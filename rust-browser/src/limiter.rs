use std::collections::HashSet;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LimiterConfig {
    pub ram_enabled: bool,
    pub ram_limit_mb: u64,
    pub auto_hibernate_enabled: bool,
    pub auto_hibernate_minutes: u64,
    pub cpu_enabled: bool,
    pub cpu_limit_percent: u32,
    pub net_enabled: bool,
    pub net_limit_kbps: u64,
}

impl Default for LimiterConfig {
    fn default() -> Self {
        Self {
            ram_enabled: true,
            ram_limit_mb: 512,
            auto_hibernate_enabled: true,
            auto_hibernate_minutes: 5,
            cpu_enabled: false,
            cpu_limit_percent: 60,
            net_enabled: false,
            net_limit_kbps: 1024,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct TelemetrySnapshot {
    pub total_ram_mb: u64,
    pub total_cpu_percent: f32,
    pub process_count: usize,
}

/// Token-bucket bandwidth limiter for network responses and WebView proxy streams.
pub struct BandwidthLimiter {
    limit_kbps: u64,
    tokens_bytes: f64,
    last_refill: Instant,
}

impl BandwidthLimiter {
    pub fn new(limit_kbps: u64) -> Self {
        let cap = (limit_kbps * 1024) as f64;
        Self {
            limit_kbps,
            tokens_bytes: cap,
            last_refill: Instant::now(),
        }
    }

    pub fn consume_or_delay(&mut self, bytes: usize) -> std::time::Duration {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.last_refill = now;

        let bytes_per_sec = (self.limit_kbps * 1024) as f64;
        self.tokens_bytes = (self.tokens_bytes + elapsed * bytes_per_sec).min(bytes_per_sec);
        self.tokens_bytes -= bytes as f64;

        if self.tokens_bytes >= 0.0 {
            std::time::Duration::ZERO
        } else {
            let deficit = -self.tokens_bytes;
            std::time::Duration::from_secs_f64(deficit / bytes_per_sec.max(1.0))
        }
    }
}

#[cfg(target_os = "windows")]
mod win_mem {
    use std::ffi::c_void;

    const PROCESS_SET_QUOTA: u32 = 0x0100;
    const PROCESS_SET_INFORMATION: u32 = 0x0200;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
    const NORMAL_PRIORITY_CLASS: u32 = 0x0000_0020;

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(
            dw_desired_access: u32,
            b_inherit_handle: i32,
            dw_process_id: u32,
        ) -> *mut c_void;
        fn SetProcessWorkingSetSize(
            h_process: *mut c_void,
            dw_minimum_working_set_size: usize,
            dw_maximum_working_set_size: usize,
        ) -> i32;
        fn SetPriorityClass(h_process: *mut c_void, dw_priority_class: u32) -> i32;
        fn CloseHandle(h_object: *mut c_void) -> i32;
    }

    pub fn trim_working_set_for_pids(pids: &[u32]) -> usize {
        let mut trimmed = 0usize;
        for &pid in pids {
            unsafe {
                let handle = OpenProcess(
                    PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION,
                    0,
                    pid,
                );
                if !handle.is_null() {
                    // (SIZE_T)-1, (SIZE_T)-1 asks the Windows Memory Manager to flush
                    // idle working-set pages immediately without OOM-killing renderers.
                    if SetProcessWorkingSetSize(handle, usize::MAX, usize::MAX) != 0 {
                        trimmed += 1;
                    }
                    CloseHandle(handle);
                }
            }
        }
        trimmed
    }

    pub fn apply_cpu_priority_for_pids(pids: &[u32], root_pid: u32, throttle: bool) {
        let priority_class = if throttle {
            BELOW_NORMAL_PRIORITY_CLASS
        } else {
            NORMAL_PRIORITY_CLASS
        };
        for &pid in pids {
            if pid == root_pid {
                continue;
            }
            unsafe {
                let handle = OpenProcess(
                    PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION,
                    0,
                    pid,
                );
                if !handle.is_null() {
                    SetPriorityClass(handle, priority_class);
                    CloseHandle(handle);
                }
            }
        }
    }
}

pub struct ResourceLimiter {
    pub config: LimiterConfig,
    pub snapshot: TelemetrySnapshot,
    system: System,
    root_pid: Pid,
    tree_pids: Vec<u32>,
}

impl ResourceLimiter {
    pub fn new(config: LimiterConfig) -> Self {
        let system = System::new();
        let pid = Pid::from_u32(std::process::id());
        Self {
            config,
            snapshot: TelemetrySnapshot::default(),
            system,
            root_pid: pid,
            tree_pids: vec![std::process::id()],
        }
    }

    /// Walks the full process tree (FerroX host + msedgewebview2 browser + GPU + all tab renderers)
    /// so reported RAM matches Windows Task Manager accurately.
    pub fn sample_process_metrics(&mut self) {
        let kind = ProcessRefreshKind::new().with_memory().with_cpu();
        self.system
            .refresh_processes_specifics(ProcessesToUpdate::All, true, kind);

        let mut tree: HashSet<Pid> = HashSet::new();
        tree.insert(self.root_pid);
        loop {
            let before = tree.len();
            for (pid, proc_info) in self.system.processes() {
                if let Some(parent) = proc_info.parent() {
                    if tree.contains(&parent) {
                        tree.insert(*pid);
                    }
                }
            }
            if tree.len() == before {
                break;
            }
        }

        let mut ram_bytes: u64 = 0;
        let mut cpu_total: f32 = 0.0;
        let mut pids_u32: Vec<u32> = Vec::with_capacity(tree.len());

        for pid in &tree {
            pids_u32.push(pid.as_u32());
            if let Some(proc_info) = self.system.process(*pid) {
                ram_bytes = ram_bytes.saturating_add(proc_info.memory());
                cpu_total += proc_info.cpu_usage();
            }
        }

        self.tree_pids = pids_u32;
        self.snapshot = TelemetrySnapshot {
            total_ram_mb: ram_bytes / (1024 * 1024),
            total_cpu_percent: cpu_total,
            process_count: tree.len().max(1),
        };
    }

    /// Trims idle working-set pages across the FerroX + WebView2 process tree on Windows.
    pub fn trim_process_tree_working_set(&self) -> usize {
        #[cfg(target_os = "windows")]
        {
            win_mem::trim_working_set_for_pids(&self.tree_pids)
        }
        #[cfg(not(target_os = "windows"))]
        {
            0
        }
    }

    /// Lowers WebView2 child process CPU scheduling priority when CPU limiter is active.
    pub fn apply_cpu_priority(&self) {
        #[cfg(target_os = "windows")]
        {
            let throttle = self.config.cpu_enabled && self.config.cpu_limit_percent < 75;
            win_mem::apply_cpu_priority_for_pids(&self.tree_pids, self.root_pid.as_u32(), throttle);
        }
    }
}
