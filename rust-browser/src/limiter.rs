use std::time::Instant;

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimiterConfig {
    pub ram_enabled: bool,
    pub ram_limit_mb: u64,
    pub cpu_enabled: bool,
    pub cpu_limit_percent: u32,
    pub net_enabled: bool,
    pub net_limit_kbps: u64,
}

impl Default for LimiterConfig {
    fn default() -> Self {
        Self {
            ram_enabled: true,
            ram_limit_mb: 1024,
            cpu_enabled: false,
            cpu_limit_percent: 50,
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

pub struct ResourceLimiter {
    pub config: LimiterConfig,
    pub snapshot: TelemetrySnapshot,
    system: System,
    root_pid: Pid,
}

impl ResourceLimiter {
    pub fn new(config: LimiterConfig) -> Self {
        let mut system = System::new();
        let pid = Pid::from_u32(std::process::id());
        system.refresh_processes(ProcessesToUpdate::All, true);
        Self {
            config,
            snapshot: TelemetrySnapshot::default(),
            system,
            root_pid: pid,
        }
    }

    pub fn sample_process_metrics(&mut self) {
        self.system.refresh_processes(ProcessesToUpdate::All, true);

        let mut ram_bytes: u64 = 0;
        let mut cpu_total: f32 = 0.0;
        let mut count: usize = 0;

        for (pid, proc_info) in self.system.processes() {
            let is_self = *pid == self.root_pid;
            let is_child = proc_info.parent() == Some(self.root_pid);
            if is_self || is_child {
                ram_bytes += proc_info.memory();
                cpu_total += proc_info.cpu_usage();
                count += 1;
            }
        }

        self.snapshot = TelemetrySnapshot {
            total_ram_mb: ram_bytes / (1024 * 1024),
            total_cpu_percent: cpu_total,
            process_count: count.max(1),
        };
    }
}
