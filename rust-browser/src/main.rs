#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adblock;
mod browser;
mod downloads;
mod extensions;
mod importer;
mod limiter;
mod privacy;
mod security;
mod tabs;
mod theme;
mod ui_assets;
mod vault;

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use tao::platform::windows::WindowBuilderExtWindows;
use tao::{
    dpi::LogicalSize as TaoLogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::{Fullscreen, Icon, Theme as WindowTheme, Window, WindowBuilder},
};
#[cfg(target_os = "windows")]
use wry::{Theme as WebViewTheme, WebViewBuilderExtWindows};
use wry::{
    dpi::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize},
    http::{
        header::{ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_TYPE},
        Request, Response, StatusCode,
    },
    Rect, WebContext, WebView, WebViewBuilder,
};

use crate::adblock::AdShield;
use crate::browser::{Bookmark, BrowserConfig, BrowserCore};
use crate::extensions::ExtensionHost;
use crate::limiter::{LimiterConfig, ResourceLimiter};
use crate::privacy::PrivacyConfig;
use crate::security::SecurityEngine;
use crate::tabs::WorkspaceId;
use crate::theme::AccentPreset;
use crate::vault::CredentialVault;

const RAIL_WIDTH: f64 = 48.0;
const DRAWER_WIDTH: f64 = 320.0;
const TOP_BAR_HEIGHT: f64 = 120.0;
const OBSIDIAN_BG: (u8, u8, u8, u8) = (11, 13, 18, 255);
const APP_ICON_RGBA: &[u8] = include_bytes!("../assets/ferrox-icon-64.rgba");
const APP_ICON_DIM: u32 = 64;

static DOWNLOAD_SEQ: AtomicU64 = AtomicU64::new(1);

const CONTENT_TAB_INIT_SCRIPT: &str = r#"
(function() {
  if (window.__ferroxContentHooked) return;
  window.__ferroxContentHooked = true;

  function postContentIpc(payload) {
    try {
      if (window.ipc && typeof window.ipc.postMessage === 'function') {
        window.ipc.postMessage(JSON.stringify(payload));
      }
    } catch (_e) {}
  }

  function resolveHttpUrl(raw) {
    if (typeof raw !== 'string') return null;
    var trimmed = raw.trim();
    if (!trimmed || trimmed === 'about:blank' || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('javascript:')) {
      return null;
    }
    try {
      var resolved = new URL(trimmed, window.location.href).href;
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        return resolved;
      }
    } catch (_e) {}
    return null;
  }

  function isNewWindowTarget(target) {
    var t = (target || '').trim().toLowerCase();
    return Boolean(t && t !== '_self' && t !== '_parent' && t !== '_top');
  }

  try {
    // Layer 1: Override window.open so OAuth popups (Gmail, etc.) and JS popups stay in the same tab
    window.open = function(url) {
      var resolved = resolveHttpUrl(url);
      if (resolved) {
        window.location.assign(resolved);
      }
      return window;
    };

    // Layer 2: Override programmatic anchor.click() (used heavily by Google Images / SPA cards)
    if (window.HTMLAnchorElement && HTMLAnchorElement.prototype && HTMLAnchorElement.prototype.click) {
      var origAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() {
        try {
          if (isNewWindowTarget(this.getAttribute('target'))) {
            this.setAttribute('target', '_self');
          }
        } catch (_e) {}
        return origAnchorClick.apply(this, arguments);
      };
    }

    // Layer 3: Strip _blank early on pointerdown/mousedown, and block autoscroll on middle-click over links
    function stripTargetEarly(ev) {
      var anchor = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!anchor) return;
      if (ev.button === 1) {
        ev.preventDefault();
        return;
      }
      if (ev.button === 0 && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        if (isNewWindowTarget(anchor.getAttribute('target'))) {
          anchor.setAttribute('target', '_self');
        }
      }
    }
    document.addEventListener('pointerdown', stripTargetEarly, true);
    document.addEventListener('mousedown', stripTargetEarly, true);

    // Layer 4: Middle-click opens in a new background FerroX tab
    document.addEventListener('auxclick', function(ev) {
      if (ev.button !== 1) return;
      var anchor = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!anchor) return;
      var href = resolveHttpUrl(anchor.href || anchor.getAttribute('href'));
      if (!href) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      postContentIpc({ action: 'open_bg_tab', url: href });
    }, true);

    // Layer 5: Ctrl+Click / Cmd+Click opens background tab; normal left-click stays in same tab
    document.addEventListener('click', function(ev) {
      var anchor = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!anchor) return;
      var href = resolveHttpUrl(anchor.href || anchor.getAttribute('href'));
      if (!href) return;

      if (ev.button === 0 && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        postContentIpc({ action: 'open_bg_tab', url: href });
        return;
      }

      if (ev.button === 0 && !ev.shiftKey && isNewWindowTarget(anchor.getAttribute('target'))) {
        anchor.setAttribute('target', '_self');
        ev.preventDefault();
        ev.stopImmediatePropagation();
        window.location.assign(href);
      }
    }, true);

    // Keep form submissions in the same tab
    document.addEventListener('submit', function(ev) {
      var form = ev.target;
      if (form && form.getAttribute && isNewWindowTarget(form.getAttribute('target'))) {
        form.setAttribute('target', '_self');
      }
    }, true);

    // Forward standard desktop browser keyboard shortcuts from live pages to FerroX shell
    document.addEventListener('keydown', function(ev) {
      var mod = ev.ctrlKey || ev.metaKey;
      var key = (ev.key || '').toLowerCase();
      var cmd = null;

      if (ev.key === 'F11') {
        cmd = 'toggle_fullscreen';
      } else if (ev.key === 'F5' || (mod && !ev.altKey && key === 'r')) {
        cmd = 'reload';
      } else if (ev.altKey && !mod && ev.key === 'ArrowLeft') {
        cmd = 'back';
      } else if (ev.altKey && !mod && ev.key === 'ArrowRight') {
        cmd = 'forward';
      } else if (ev.altKey && !mod && key === 'd') {
        cmd = 'focus_omnibox';
      } else if (mod && !ev.altKey) {
        if (key === 't' && ev.shiftKey) cmd = 'reopen_tab';
        else if (key === 't' && !ev.shiftKey) cmd = 'new_tab';
        else if (key === 'w' && !ev.shiftKey) cmd = 'close_tab';
        else if (ev.key === 'Tab' && ev.shiftKey) cmd = 'prev_tab';
        else if (ev.key === 'Tab' && !ev.shiftKey) cmd = 'next_tab';
        else if (key === 'l') cmd = 'focus_omnibox';
        else if (key === 'f') cmd = 'find_in_page';
        else if (key === 'k') cmd = 'tab_search';
        else if (key === '=' || key === '+') cmd = 'zoom_in';
        else if (key === '-') cmd = 'zoom_out';
        else if (key === '0') cmd = 'zoom_reset';
      }

      if (cmd) {
        ev.preventDefault();
        ev.stopPropagation();
        postContentIpc({ action: 'shortcut', command: cmd });
      }
    }, true);
  } catch (_e) {}
})();
"#;

#[derive(Debug)]
enum UserEvent {
    Ipc(String),
    ContentIpc {
        tab_id: String,
        raw: String,
    },
    TelemetryTick,
    TabNavigated {
        tab_id: String,
        url: String,
    },
    TabTitleChanged {
        tab_id: String,
        title: String,
    },
    TabOpenSameWindow {
        tab_id: String,
        url: String,
    },
    DownloadStarted {
        id: String,
        filename: String,
        url: String,
        path: String,
        warning: Option<String>,
    },
    DownloadCompleted {
        url: String,
        path: Option<String>,
        success: bool,
    },
    ProfilesDetected(String),
    ProfileImported(String),
}

#[derive(Debug, Deserialize)]
struct ContentIpcMessage {
    action: String,
    url: Option<String>,
    host: Option<String>,
    command: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IpcMessage {
    action: String,
    url: Option<String>,
    id: Option<serde_json::Value>,
    #[serde(rename = "tabId")]
    tab_id: Option<String>,
    #[serde(rename = "isPrivate")]
    is_private: Option<bool>,
    open: Option<bool>,
    left: Option<f64>,
    top: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    visible: Option<bool>,
    enabled: Option<bool>,
    rules: Option<Vec<String>>,
    factor: Option<f64>,
    query: Option<String>,
    backwards: Option<bool>,
    path: Option<String>,
    #[serde(rename = "ramEnabled")]
    ram_enabled: Option<bool>,
    #[serde(rename = "ramLimitMb")]
    ram_limit_mb: Option<u64>,
    #[serde(rename = "cpuEnabled")]
    cpu_enabled: Option<bool>,
    #[serde(rename = "cpuLimitPercent")]
    cpu_limit_percent: Option<u32>,
    #[serde(rename = "netEnabled")]
    net_enabled: Option<bool>,
    #[serde(rename = "netLimitKbps")]
    net_limit_kbps: Option<u64>,
    accent: Option<AccentPreset>,
    #[serde(rename = "accentPreset")]
    accent_preset: Option<String>,
    #[serde(rename = "customHex")]
    custom_hex: Option<String>,
    #[serde(rename = "surfaceTheme")]
    surface_theme: Option<String>,
    engine: Option<String>,
    #[serde(rename = "verticalTabs")]
    vertical_tabs: Option<bool>,
    #[serde(rename = "showBookmarksBar")]
    show_bookmarks_bar: Option<bool>,
    #[serde(rename = "httpsOnly")]
    https_only: Option<bool>,
    #[serde(rename = "safeBrowsing")]
    safe_browsing: Option<bool>,
    #[serde(rename = "fingerprintProtection")]
    fingerprint_protection: Option<bool>,
    #[serde(rename = "vpnEnabled")]
    vpn_enabled: Option<bool>,
    #[serde(rename = "vpnRegion")]
    vpn_region: Option<String>,
    #[serde(rename = "profileId")]
    profile_id: Option<String>,
}

#[derive(Serialize)]
struct TabDto {
    id: u64,
    title: String,
    url: String,
    pinned: bool,
    hibernated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiSyncPayload {
    workspace: &'static str,
    active_tab_id: Option<u64>,
    active_url: String,
    tabs: Vec<TabDto>,
    bookmarks: Vec<Bookmark>,
    ram_mb: u64,
    ram_limit_mb: u64,
    ram_enabled: bool,
    cpu_percent: f32,
    shield_enabled: bool,
    blocked_count: usize,
    accent_hex: &'static str,
    accent_preset: String,
    custom_accent_hex: String,
    surface_theme: String,
    hardware_acceleration: bool,
    search_engine: String,
    vertical_tabs: bool,
    show_bookmarks_bar: bool,
    private_mode: bool,
    https_only: bool,
    vpn_enabled: bool,
    vpn_region: String,
    vault_count: usize,
    auto_sync_browsers: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadEventPayload {
    phase: &'static str,
    id: Option<String>,
    filename: Option<String>,
    url: String,
    saved_path: Option<String>,
    warning: Option<String>,
    success: bool,
}

struct AppState {
    core: BrowserCore,
    limiter: Arc<Mutex<ResourceLimiter>>,
    shield: AdShield,
    security: SecurityEngine,
    privacy: PrivacyConfig,
    vault: CredentialVault,
    extensions: ExtensionHost,
    drawer_open: bool,
    content_rect_override: Option<(f64, f64, f64, f64)>,
    content_visible: bool,
    active_tab_key: Option<String>,
    is_fullscreen: bool,
    initial_auto_sync_done: bool,
    tab_last_bounds: HashMap<String, (i32, i32, i32, i32)>,
    tab_last_visible: HashMap<String, bool>,
    tab_zooms: HashMap<String, f64>,
    last_telemetry_sent: Option<(u64, i32)>,
}

fn workspace_slug(ws: WorkspaceId) -> &'static str {
    match ws {
        WorkspaceId::Personal => "personal",
        WorkspaceId::Work => "work",
        WorkspaceId::Gaming => "gaming",
        WorkspaceId::Development => "development",
    }
}

fn parse_workspace(slug: &str) -> WorkspaceId {
    match slug {
        "work" => WorkspaceId::Work,
        "gaming" => WorkspaceId::Gaming,
        "development" => WorkspaceId::Development,
        _ => WorkspaceId::Personal,
    }
}

fn logical_window_size(window: &Window) -> (f64, f64) {
    let scale = window.scale_factor();
    let logical = window.inner_size().to_logical::<f64>(scale);
    (logical.width.max(360.0), logical.height.max(240.0))
}

fn chrome_rect_physical(width: u32, height: u32) -> Rect {
    Rect {
        position: PhysicalPosition::new(0, 0).into(),
        size: PhysicalSize::new(width.max(1), height.max(1)).into(),
    }
}

fn compute_content_bounds_tuple(state: &AppState, window: &Window) -> (i32, i32, i32, i32) {
    if let Some((x, y, w, h)) = state.content_rect_override {
        return (
            x.max(0.0).round() as i32,
            y.max(0.0).round() as i32,
            w.max(1.0).round() as i32,
            h.max(1.0).round() as i32,
        );
    }
    let (w, h) = logical_window_size(window);
    let left = RAIL_WIDTH + if state.drawer_open { DRAWER_WIDTH } else { 0.0 };
    (
        left.round() as i32,
        TOP_BAR_HEIGHT.round() as i32,
        (w - left).max(1.0).round() as i32,
        (h - TOP_BAR_HEIGHT).max(1.0).round() as i32,
    )
}

fn rect_from_tuple(bounds: (i32, i32, i32, i32)) -> Rect {
    Rect {
        position: LogicalPosition::new(bounds.0 as f64, bounds.1 as f64).into(),
        size: LogicalSize::new(bounds.2 as f64, bounds.3 as f64).into(),
    }
}

fn build_child(window: &Window, builder: WebViewBuilder<'_>) -> wry::Result<WebView> {
    #[cfg(not(target_os = "linux"))]
    {
        builder.build_as_child(window)
    }
    #[cfg(target_os = "linux")]
    {
        use tao::platform::unix::WindowExtUnix;
        let vbox = window.default_vbox().expect("GTK vbox missing");
        builder.build_gtk(vbox)
    }
}

fn derive_download_filename(url: &str, dest: &PathBuf) -> String {
    if let Some(name) = dest.file_name().and_then(|s| s.to_str()) {
        if !name.trim().is_empty() {
            return name.trim().to_string();
        }
    }
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(seg) = parsed
            .path_segments()
            .and_then(|mut s| s.next_back())
            .filter(|s| !s.is_empty())
        {
            return seg.to_string();
        }
    }
    "download.bin".to_string()
}

fn open_file_in_os(path: &str) {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", trimmed])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(trimmed).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(trimmed).spawn();
    }
}

fn show_file_in_folder(path: &str) {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("explorer")
            .arg(format!("/select,{}", trimmed))
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").args(["-R", trimmed]).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let target = PathBuf::from(trimmed);
        let dir = target
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| trimmed.to_string());
        let _ = Command::new("xdg-open").arg(dir).spawn();
    }
}

#[allow(clippy::too_many_arguments)]
fn spawn_tab_webview(
    tab_id: &str,
    initial_url: &str,
    is_private: bool,
    window: &Window,
    shared_web_context: &mut WebContext,
    combined_init_script: &str,
    bounds: (i32, i32, i32, i32),
    proxy: &EventLoopProxy<UserEvent>,
) -> wry::Result<WebView> {
    let nav_proxy = proxy.clone();
    let nav_tab = tab_id.to_string();

    let title_proxy = proxy.clone();
    let title_tab = tab_id.to_string();

    let popup_proxy = proxy.clone();
    let popup_tab = tab_id.to_string();

    let content_ipc_proxy = proxy.clone();
    let content_ipc_tab = tab_id.to_string();

    let dl_start_proxy = proxy.clone();
    let dl_done_proxy = proxy.clone();

    let base_builder = if is_private {
        WebViewBuilder::new()
    } else {
        WebViewBuilder::new_with_web_context(shared_web_context)
    };

    let builder = base_builder
        .with_background_color(OBSIDIAN_BG)
        .with_url(initial_url)
        .with_initialization_script(combined_init_script)
        .with_ipc_handler(move |req: Request<String>| {
            let _ = content_ipc_proxy.send_event(UserEvent::ContentIpc {
                tab_id: content_ipc_tab.clone(),
                raw: req.body().clone(),
            });
        })
        .with_navigation_handler(move |url| {
            if url.starts_with("http://") || url.starts_with("https://") {
                let _ = nav_proxy.send_event(UserEvent::TabNavigated {
                    tab_id: nav_tab.clone(),
                    url,
                });
            }
            true
        })
        .with_new_window_req_handler(move |url| {
            if url.starts_with("http://") || url.starts_with("https://") {
                let _ = popup_proxy.send_event(UserEvent::TabOpenSameWindow {
                    tab_id: popup_tab.clone(),
                    url,
                });
            }
            false
        })
        .with_document_title_changed_handler(move |title| {
            if !title.trim().is_empty() {
                let _ = title_proxy.send_event(UserEvent::TabTitleChanged {
                    tab_id: title_tab.clone(),
                    title,
                });
            }
        })
        .with_download_started_handler(move |url, destination_path| {
            let filename = derive_download_filename(&url, destination_path);
            let needs_dir = destination_path.is_relative()
                || destination_path
                    .parent()
                    .map(|p| p.as_os_str().is_empty())
                    .unwrap_or(true);
            if needs_dir {
                if let Some(dl_dir) = dirs::download_dir() {
                    let _ = std::fs::create_dir_all(&dl_dir);
                    *destination_path = dl_dir.join(&filename);
                }
            }
            let warning = downloads::scan_download_filename(&filename);
            let seq = DOWNLOAD_SEQ.fetch_add(1, Ordering::Relaxed);
            let _ = dl_start_proxy.send_event(UserEvent::DownloadStarted {
                id: format!("native-dl-{}", seq),
                filename,
                url,
                path: destination_path.to_string_lossy().into_owned(),
                warning,
            });
            true
        })
        .with_download_completed_handler(move |url, saved_path, success| {
            let _ = dl_done_proxy.send_event(UserEvent::DownloadCompleted {
                url,
                path: saved_path.map(|p| p.to_string_lossy().into_owned()),
                success,
            });
        })
        .with_bounds(rect_from_tuple(bounds));

    #[cfg(target_os = "windows")]
    let builder = builder.with_theme(WebViewTheme::Dark);

    build_child(window, builder)
}

fn shield_sync_js(shield: &AdShield) -> String {
    let rules_json = serde_json::to_string(&shield.rules()).unwrap_or_else(|_| "[]".to_string());
    format!(
        "if (window.__ferroxSetShield) window.__ferroxSetShield({}, {});",
        if shield.enabled { "true" } else { "false" },
        rules_json
    )
}

fn build_tab_init_script(base_init_script: &str, shield: &AdShield) -> String {
    format!("{}\n{}", base_init_script, shield_sync_js(shield))
}

fn broadcast_shield_state(shield: &AdShield, tab_webviews: &HashMap<String, WebView>) {
    let script = shield_sync_js(shield);
    for wv in tab_webviews.values() {
        let _ = wv.evaluate_script(&script);
    }
}

fn apply_tab_webviews_layout(
    state: &mut AppState,
    window: &Window,
    tab_webviews: &HashMap<String, WebView>,
) {
    let next_bounds = compute_content_bounds_tuple(state, window);
    let active_key = state.active_tab_key.as_deref();

    for (key, wv) in tab_webviews.iter() {
        let should_show = state.content_visible && active_key == Some(key.as_str());
        if should_show && state.tab_last_bounds.get(key) != Some(&next_bounds) {
            let _ = wv.set_bounds(rect_from_tuple(next_bounds));
            state.tab_last_bounds.insert(key.clone(), next_bounds);
        }
        if state.tab_last_visible.get(key) != Some(&should_show) {
            let _ = wv.set_visible(should_show);
            state.tab_last_visible.insert(key.clone(), should_show);
        }
    }
}

fn sync_telemetry_only(state: &mut AppState, chrome: &WebView) {
    let (ram_mb, cpu_percent) = match state.limiter.lock() {
        Ok(guard) => (guard.snapshot.total_ram_mb, guard.snapshot.total_cpu_percent),
        Err(_) => (0, 0.0),
    };
    let cpu_tenths = (cpu_percent * 10.0).round() as i32;
    if state.last_telemetry_sent == Some((ram_mb, cpu_tenths)) {
        return;
    }
    state.last_telemetry_sent = Some((ram_mb, cpu_tenths));
    let _ = chrome.evaluate_script(&format!(
        "if (window.__ferroxTelemetry) window.__ferroxTelemetry({{ ramMb: {}, cpuPercent: {:.1} }});",
        ram_mb,
        cpu_tenths as f32 / 10.0
    ));
}

fn sync_views(
    state: &mut AppState,
    window: &Window,
    chrome: &WebView,
    tab_webviews: &HashMap<String, WebView>,
) {
    let (ram_mb, ram_limit_mb, ram_enabled, cpu_percent) = match state.limiter.lock() {
        Ok(guard) => (
            guard.snapshot.total_ram_mb,
            guard.config.ram_limit_mb,
            guard.config.ram_enabled,
            guard.snapshot.total_cpu_percent,
        ),
        Err(_) => (0, 1024, true, 0.0),
    };

    let active_url = state
        .core
        .tabs
        .active_tab()
        .map(|t| t.url.clone())
        .unwrap_or_else(|| "ferrox://speed-dial".to_string());

    let tabs = state
        .core
        .tabs
        .workspace_tabs()
        .into_iter()
        .map(|t| TabDto {
            id: t.id,
            title: t.title.clone(),
            url: t.url.clone(),
            pinned: t.pinned,
            hibernated: t.hibernated,
        })
        .collect();

    let payload = UiSyncPayload {
        workspace: workspace_slug(state.core.tabs.active_workspace()),
        active_tab_id: state.core.tabs.active_tab_id(),
        active_url,
        tabs,
        bookmarks: state.core.bookmarks.clone(),
        ram_mb,
        ram_limit_mb,
        ram_enabled,
        cpu_percent,
        shield_enabled: state.shield.enabled,
        blocked_count: state.shield.blocked_count(),
        accent_hex: state.core.config.accent.hex(),
        accent_preset: state.core.config.accent_preset.clone(),
        custom_accent_hex: state.core.config.custom_accent_hex.clone(),
        surface_theme: state.core.config.surface_theme.clone(),
        hardware_acceleration: state.core.config.hardware_acceleration,
        search_engine: state.core.config.search_engine_id.clone(),
        vertical_tabs: state.core.config.vertical_tabs,
        show_bookmarks_bar: state.core.config.show_bookmarks_bar,
        private_mode: state.privacy.private_browsing,
        https_only: state.security.https_only,
        vpn_enabled: state.core.config.vpn_enabled,
        vpn_region: state.core.config.vpn_region.clone(),
        vault_count: state.vault.entries().len(),
        auto_sync_browsers: state.core.config.auto_sync_browsers,
    };

    if let Ok(json) = serde_json::to_string(&payload) {
        let _ = chrome.evaluate_script(&format!(
            "if (window.__ferroxSync) window.__ferroxSync({});",
            json
        ));
    }

    apply_tab_webviews_layout(state, window, tab_webviews);
}

fn load_app_icon() -> Option<Icon> {
    Icon::from_rgba(APP_ICON_RGBA.to_vec(), APP_ICON_DIM, APP_ICON_DIM).ok()
}

fn toggle_window_fullscreen(state: &mut AppState, window: &Window, chrome: &WebView) {
    state.is_fullscreen = !state.is_fullscreen;
    if state.is_fullscreen {
        window.set_fullscreen(Some(Fullscreen::Borderless(None)));
    } else {
        window.set_fullscreen(None);
    }
    let _ = chrome.evaluate_script(&format!(
        "if (window.__ferroxFullscreenChanged) window.__ferroxFullscreenChanged({});",
        if state.is_fullscreen { "true" } else { "false" }
    ));
}

fn main() {
    env_logger::init();

    let config = BrowserConfig::load_or_default();
    if config.hardware_acceleration {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--enable-smooth-scrolling --enable-gpu-rasterization --enable-zero-copy",
        );
    } else {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu");
    }

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let app_icon = load_app_icon();
    let window_builder = WindowBuilder::new()
        .with_title("FerroX Browser")
        .with_inner_size(TaoLogicalSize::new(1360.0, 860.0))
        .with_theme(Some(WindowTheme::Dark))
        .with_window_icon(app_icon.clone());

    #[cfg(target_os = "windows")]
    let window_builder = window_builder.with_taskbar_icon(app_icon);

    let window = window_builder
        .build(&event_loop)
        .expect("Failed to create FerroX window");

    // Shared persistent WebContext for HTTP disk cache, cookies, sessions, and IndexedDB across all tabs
    let profile_dir = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("ferrox-browser")
        .join("webview-profile");
    let _ = std::fs::create_dir_all(&profile_dir);
    let mut shared_web_context = WebContext::new(Some(profile_dir));

    let phys_size = window.inner_size();
    let ipc_proxy = proxy.clone();

    #[cfg(target_os = "windows")]
    let chrome_entry_url = "https://ferrox.localhost/index.html";
    #[cfg(not(target_os = "windows"))]
    let chrome_entry_url = "ferrox://localhost/index.html";

    let chrome_builder = WebViewBuilder::new()
        .with_background_color(OBSIDIAN_BG)
        .with_custom_protocol("ferrox".into(), move |_webview_id, request| {
            let (bytes, mime) = ui_assets::resolve_ui_asset(request.uri().path());
            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, mime)
                .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(Cow::Borrowed(bytes))
                .unwrap_or_else(|_| {
                    Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(Cow::Borrowed(&b"Failed to build UI asset response"[..]))
                        .expect("Fallback response must be valid")
                })
        })
        .with_url(chrome_entry_url)
        .with_bounds(chrome_rect_physical(phys_size.width, phys_size.height))
        .with_ipc_handler(move |req: Request<String>| {
            let _ = ipc_proxy.send_event(UserEvent::Ipc(req.body().clone()));
        });

    #[cfg(target_os = "windows")]
    let chrome_builder = chrome_builder
        .with_https_scheme(true)
        .with_theme(WebViewTheme::Dark);

    let chrome_webview = build_child(&window, chrome_builder)
        .expect("Failed to initialize FerroX chrome WebView");

    let shield = AdShield::with_default_rules();
    let privacy = PrivacyConfig::default();
    let extensions = ExtensionHost::with_defaults();
    let combined_init_script = format!(
        "{}\n{}\n{}\n{}",
        CONTENT_TAB_INIT_SCRIPT,
        shield.cosmetic_init_script(),
        privacy.anti_fingerprint_script(),
        extensions.build_combined_init_script()
    );

    let initial_state = AppState {
        core: BrowserCore::new(config),
        limiter: Arc::new(Mutex::new(ResourceLimiter::new(LimiterConfig::default()))),
        shield,
        security: SecurityEngine::new(),
        privacy,
        vault: CredentialVault::new(),
        extensions,
        drawer_open: false,
        content_rect_override: None,
        content_visible: false,
        active_tab_key: None,
        is_fullscreen: false,
        initial_auto_sync_done: false,
        tab_last_bounds: HashMap::new(),
        tab_last_visible: HashMap::new(),
        tab_zooms: HashMap::new(),
        last_telemetry_sent: None,
    };

    let mut tab_webviews: HashMap<String, WebView> = HashMap::new();

    let limiter_bg = Arc::clone(&initial_state.limiter);
    let tick_proxy = proxy.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        if let Ok(mut guard) = limiter_bg.lock() {
            guard.sample_process_metrics();
        }
        if tick_proxy.send_event(UserEvent::TelemetryTick).is_err() {
            break;
        }
    });

    let mut state = initial_state;
    let worker_proxy = proxy.clone();
    sync_views(&mut state, &window, &chrome_webview, &tab_webviews);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            Event::WindowEvent {
                event: WindowEvent::Resized(new_size),
                ..
            } => {
                let _ = chrome_webview
                    .set_bounds(chrome_rect_physical(new_size.width, new_size.height));
                state.tab_last_bounds.clear();
                apply_tab_webviews_layout(&mut state, &window, &tab_webviews);
            }
            Event::WindowEvent {
                event:
                    WindowEvent::ScaleFactorChanged {
                        new_inner_size, ..
                    },
                ..
            } => {
                let _ = chrome_webview.set_bounds(chrome_rect_physical(
                    new_inner_size.width,
                    new_inner_size.height,
                ));
                state.tab_last_bounds.clear();
                apply_tab_webviews_layout(&mut state, &window, &tab_webviews);
            }
            Event::UserEvent(UserEvent::TabNavigated { tab_id, url }) => {
                if let (Ok(json_tab), Ok(json_url)) =
                    (serde_json::to_string(&tab_id), serde_json::to_string(&url))
                {
                    let _ = chrome_webview.evaluate_script(&format!(
                        "if (window.__ferroxContentUpdate) window.__ferroxContentUpdate({{ tabId: {}, url: {} }});",
                        json_tab, json_url
                    ));
                }
            }
            Event::UserEvent(UserEvent::TabTitleChanged { tab_id, title }) => {
                if let (Ok(json_tab), Ok(json_title)) =
                    (serde_json::to_string(&tab_id), serde_json::to_string(&title))
                {
                    let _ = chrome_webview.evaluate_script(&format!(
                        "if (window.__ferroxContentUpdate) window.__ferroxContentUpdate({{ tabId: {}, title: {} }});",
                        json_tab, json_title
                    ));
                }
            }
            Event::UserEvent(UserEvent::TabOpenSameWindow { tab_id, url }) => {
                let assessment = state.security.evaluate_navigation(&url);
                if assessment.safe && !state.shield.is_blocked(&assessment.upgraded_url) {
                    if let Some(wv) = tab_webviews.get(&tab_id) {
                        let _ = wv.load_url(&assessment.upgraded_url);
                    }
                    if let (Ok(json_tab), Ok(json_url)) = (
                        serde_json::to_string(&tab_id),
                        serde_json::to_string(&assessment.upgraded_url),
                    ) {
                        let _ = chrome_webview.evaluate_script(&format!(
                            "if (window.__ferroxContentUpdate) window.__ferroxContentUpdate({{ tabId: {}, url: {} }});",
                            json_tab, json_url
                        ));
                    }
                }
            }
            Event::UserEvent(UserEvent::ContentIpc { tab_id: _, raw }) => {
                let Ok(msg) = serde_json::from_str::<ContentIpcMessage>(&raw) else {
                    return;
                };
                match msg.action.as_str() {
                    "open_bg_tab" => {
                        if let Some(url) = msg.url {
                            if let Ok(json_url) = serde_json::to_string(&url) {
                                let _ = chrome_webview.evaluate_script(&format!(
                                    "if (window.__ferroxOpenTab) window.__ferroxOpenTab({{ url: {}, background: true }});",
                                    json_url
                                ));
                            }
                        }
                    }
                    "shortcut" => {
                        if let Some(cmd) = msg.command {
                            if cmd == "toggle_fullscreen" {
                                toggle_window_fullscreen(&mut state, &window, &chrome_webview);
                            } else if let Ok(json_cmd) = serde_json::to_string(&cmd) {
                                let _ = chrome_webview.evaluate_script(&format!(
                                    "if (window.__ferroxShortcut) window.__ferroxShortcut({});",
                                    json_cmd
                                ));
                            }
                        }
                    }
                    "ad_blocked" => {
                        let url = msg
                            .url
                            .unwrap_or_else(|| "https://www.youtube.com/".to_string());
                        let host = msg
                            .host
                            .unwrap_or_else(|| "youtube-ads".to_string());
                        state.shield.record_block(&url);
                        if let (Ok(json_host), Ok(json_url)) =
                            (serde_json::to_string(&host), serde_json::to_string(&url))
                        {
                            let _ = chrome_webview.evaluate_script(&format!(
                                "if (window.__ferroxAdBlocked) window.__ferroxAdBlocked({{ host: {}, url: {} }});",
                                json_host, json_url
                            ));
                        }
                    }
                    _ => {}
                }
            }
            Event::UserEvent(UserEvent::DownloadStarted {
                id,
                filename,
                url,
                path,
                warning,
            }) => {
                let payload = DownloadEventPayload {
                    phase: "started",
                    id: Some(id),
                    filename: Some(filename),
                    url,
                    saved_path: Some(path),
                    warning,
                    success: true,
                };
                if let Ok(json) = serde_json::to_string(&payload) {
                    let _ = chrome_webview.evaluate_script(&format!(
                        "if (window.__ferroxDownloadEvent) window.__ferroxDownloadEvent({});",
                        json
                    ));
                }
            }
            Event::UserEvent(UserEvent::DownloadCompleted { url, path, success }) => {
                let payload = DownloadEventPayload {
                    phase: "completed",
                    id: None,
                    filename: None,
                    url,
                    saved_path: path,
                    warning: None,
                    success,
                };
                if let Ok(json) = serde_json::to_string(&payload) {
                    let _ = chrome_webview.evaluate_script(&format!(
                        "if (window.__ferroxDownloadEvent) window.__ferroxDownloadEvent({});",
                        json
                    ));
                }
            }
            Event::UserEvent(UserEvent::ProfilesDetected(json)) => {
                let _ = chrome_webview.evaluate_script(&format!(
                    "if (window.__ferroxProfilesDetected) window.__ferroxProfilesDetected({});",
                    json
                ));
            }
            Event::UserEvent(UserEvent::ProfileImported(json)) => {
                let _ = chrome_webview.evaluate_script(&format!(
                    "if (window.__ferroxProfileImported) window.__ferroxProfileImported({});",
                    json
                ));
            }
            Event::UserEvent(UserEvent::TelemetryTick) => {
                let should_hibernate = state
                    .limiter
                    .lock()
                    .map(|g| g.config.ram_enabled && g.snapshot.total_ram_mb > g.config.ram_limit_mb)
                    .unwrap_or(false);
                if should_hibernate && state.core.tabs.hibernate_oldest_background_tab() > 0 {
                    sync_views(&mut state, &window, &chrome_webview, &tab_webviews);
                } else {
                    sync_telemetry_only(&mut state, &chrome_webview);
                }
            }
            Event::UserEvent(UserEvent::Ipc(raw)) => {
                let Ok(msg) = serde_json::from_str::<IpcMessage>(&raw) else {
                    return;
                };
                let mut layout_only = false;
                match msg.action.as_str() {
                    "ready" => {
                        let should_auto_sync =
                            state.core.config.auto_sync_browsers && !state.initial_auto_sync_done;
                        if should_auto_sync {
                            state.initial_auto_sync_done = true;
                        }
                        let bg_proxy = worker_proxy.clone();
                        std::thread::spawn(move || {
                            let detected = importer::detect_installed_profiles();
                            if let Ok(json) = serde_json::to_string(&detected) {
                                let _ = bg_proxy.send_event(UserEvent::ProfilesDetected(json));
                            }
                            if should_auto_sync && !detected.is_empty() {
                                let imported = importer::import_profile_by_id("all");
                                if let Ok(json) = serde_json::to_string(&imported) {
                                    let _ = bg_proxy.send_event(UserEvent::ProfileImported(json));
                                }
                            }
                        });
                    }
                    "detect_profiles" => {
                        let bg_proxy = worker_proxy.clone();
                        std::thread::spawn(move || {
                            let detected = importer::detect_installed_profiles();
                            if let Ok(json) = serde_json::to_string(&detected) {
                                let _ = bg_proxy.send_event(UserEvent::ProfilesDetected(json));
                            }
                        });
                        return;
                    }
                    "import_profile" => {
                        let target_id = msg.profile_id.unwrap_or_else(|| "all".to_string());
                        let bg_proxy = worker_proxy.clone();
                        std::thread::spawn(move || {
                            let imported = importer::import_profile_by_id(&target_id);
                            if let Ok(json) = serde_json::to_string(&imported) {
                                let _ = bg_proxy.send_event(UserEvent::ProfileImported(json));
                            }
                        });
                        return;
                    }
                    "set_auto_sync" => {
                        if let Some(enabled) = msg.enabled {
                            state.core.config.auto_sync_browsers = enabled;
                            let _ = state.core.config.save();
                        }
                        return;
                    }
                    "set_active_url" => {
                        if let Some(url) = msg.url {
                            state.core.tabs.navigate_active(&url);
                            if url.starts_with("ferrox://") {
                                state.content_visible = false;
                            }
                        }
                        layout_only = true;
                    }
                    "layout" => {
                        if let (Some(l), Some(t), Some(w), Some(h)) =
                            (msg.left, msg.top, msg.width, msg.height)
                        {
                            state.content_rect_override = Some((l, t, w, h));
                        }
                        if let Some(vis) = msg.visible {
                            state.content_visible = vis;
                        }
                        layout_only = true;
                    }
                    "navigate_tab" | "navigate" => {
                        let tab_key = msg
                            .tab_id
                            .or_else(|| state.active_tab_key.clone())
                            .unwrap_or_else(|| "tab-1".to_string());
                        let is_private = msg.is_private.unwrap_or(false);
                        if let Some(raw_url) = msg.url {
                            let normalized = BrowserCore::normalize_address(
                                &raw_url,
                                &state.core.config.search_engine,
                            );
                            let assessment = state.security.evaluate_navigation(&normalized);
                            if !assessment.safe {
                                state.shield.record_block(&normalized);
                            } else if state.shield.is_blocked(&assessment.upgraded_url) {
                                state.shield.record_block(&assessment.upgraded_url);
                            } else if assessment.upgraded_url.starts_with("ferrox://") {
                                if state.active_tab_key.as_deref() == Some(tab_key.as_str()) {
                                    state.content_visible = false;
                                }
                                layout_only = true;
                            } else {
                                let is_background = msg.visible == Some(false);
                                if !is_background {
                                    state.active_tab_key = Some(tab_key.clone());
                                    state.content_visible = true;
                                }
                                if let Some(existing_wv) = tab_webviews.get(&tab_key) {
                                    let _ = existing_wv.load_url(&assessment.upgraded_url);
                                } else {
                                    let bounds = compute_content_bounds_tuple(&state, &window);
                                    let tab_init =
                                        build_tab_init_script(&combined_init_script, &state.shield);
                                    if let Ok(wv) = spawn_tab_webview(
                                        &tab_key,
                                        &assessment.upgraded_url,
                                        is_private,
                                        &window,
                                        &mut shared_web_context,
                                        &tab_init,
                                        bounds,
                                        &worker_proxy,
                                    ) {
                                        if is_background {
                                            let _ = wv.set_visible(false);
                                            state.tab_last_visible.insert(tab_key.clone(), false);
                                        } else {
                                            state.tab_last_visible.insert(tab_key.clone(), true);
                                        }
                                        state.tab_last_bounds.insert(tab_key.clone(), bounds);
                                        if let Some(&z) = state.tab_zooms.get(&tab_key) {
                                            let _ = wv.zoom(z);
                                        }
                                        tab_webviews.insert(tab_key.clone(), wv);
                                    }
                                }
                                layout_only = true;
                            }
                        }
                    }
                    "activate_tab" => {
                        if let Some(tab_key) = msg.tab_id {
                            let url = msg.url.unwrap_or_else(|| "ferrox://speed-dial".to_string());
                            let is_private = msg.is_private.unwrap_or(false);
                            state.active_tab_key = Some(tab_key.clone());
                            if url.starts_with("ferrox://") {
                                state.content_visible = false;
                            } else {
                                state.content_visible = true;
                                // CRITICAL: If this tab already has a live WebView, DO NOT reload it!
                                // Just toggle visibility so scroll position, YouTube playback, and DOM survive.
                                if !tab_webviews.contains_key(&tab_key) {
                                    let assessment = state.security.evaluate_navigation(&url);
                                    if assessment.safe
                                        && !state.shield.is_blocked(&assessment.upgraded_url)
                                    {
                                        let bounds = compute_content_bounds_tuple(&state, &window);
                                        let tab_init = build_tab_init_script(
                                            &combined_init_script,
                                            &state.shield,
                                        );
                                        if let Ok(wv) = spawn_tab_webview(
                                            &tab_key,
                                            &assessment.upgraded_url,
                                            is_private,
                                            &window,
                                            &mut shared_web_context,
                                            &tab_init,
                                            bounds,
                                            &worker_proxy,
                                        ) {
                                            state.tab_last_bounds.insert(tab_key.clone(), bounds);
                                            state.tab_last_visible.insert(tab_key.clone(), true);
                                            if let Some(&z) = state.tab_zooms.get(&tab_key) {
                                                let _ = wv.zoom(z);
                                            }
                                            tab_webviews.insert(tab_key.clone(), wv);
                                        }
                                    }
                                }
                            }
                            layout_only = true;
                        }
                    }
                    "close_tab" | "hibernate_tab" => {
                        if let Some(tab_key) = msg.tab_id {
                            // Actually drop the WebView instance so WebView2 releases RAM immediately!
                            tab_webviews.remove(&tab_key);
                            state.tab_last_bounds.remove(&tab_key);
                            state.tab_last_visible.remove(&tab_key);
                            if msg.action == "close_tab" {
                                state.tab_zooms.remove(&tab_key);
                            }
                            if state.active_tab_key.as_deref() == Some(tab_key.as_str()) {
                                state.content_visible = false;
                            }
                            layout_only = true;
                        }
                    }
                    "tab_back" | "back" => {
                        let key = msg.tab_id.or_else(|| state.active_tab_key.clone());
                        if let Some(k) = key {
                            if let Some(wv) = tab_webviews.get(&k) {
                                let _ = wv.evaluate_script("window.history.back();");
                            }
                        }
                        return;
                    }
                    "tab_forward" | "forward" => {
                        let key = msg.tab_id.or_else(|| state.active_tab_key.clone());
                        if let Some(k) = key {
                            if let Some(wv) = tab_webviews.get(&k) {
                                let _ = wv.evaluate_script("window.history.forward();");
                            }
                        }
                        return;
                    }
                    "tab_reload" | "reload" => {
                        let key = msg.tab_id.or_else(|| state.active_tab_key.clone());
                        if let Some(k) = key {
                            if let Some(wv) = tab_webviews.get(&k) {
                                let _ = wv.evaluate_script("window.location.reload();");
                            }
                        }
                        return;
                    }
                    "tab_zoom" => {
                        let key = msg.tab_id.or_else(|| state.active_tab_key.clone());
                        if let (Some(k), Some(factor)) = (key, msg.factor) {
                            let clamped = factor.clamp(0.5, 2.5);
                            state.tab_zooms.insert(k.clone(), clamped);
                            if let Some(wv) = tab_webviews.get(&k) {
                                let _ = wv.zoom(clamped);
                            }
                        }
                        return;
                    }
                    "tab_find" => {
                        let key = msg.tab_id.or_else(|| state.active_tab_key.clone());
                        if let (Some(k), Some(query)) = (key, msg.query) {
                            if let Some(wv) = tab_webviews.get(&k) {
                                let backwards = msg.backwards.unwrap_or(false);
                                if let Ok(json_q) = serde_json::to_string(&query) {
                                    let _ = wv.evaluate_script(&format!(
                                        "window.find({}, false, {}, true, false, true, false);",
                                        json_q,
                                        if backwards { "true" } else { "false" }
                                    ));
                                }
                            }
                        }
                        return;
                    }
                    "tab_find_clear" => {
                        let key = msg.tab_id.or_else(|| state.active_tab_key.clone());
                        if let Some(k) = key {
                            if let Some(wv) = tab_webviews.get(&k) {
                                let _ = wv.evaluate_script(
                                    "if (window.getSelection) { window.getSelection().removeAllRanges(); }",
                                );
                            }
                        }
                        return;
                    }
                    "toggle_fullscreen" => {
                        toggle_window_fullscreen(&mut state, &window, &chrome_webview);
                        return;
                    }
                    "open_download_file" => {
                        if let Some(path) = msg.path {
                            open_file_in_os(&path);
                        }
                        return;
                    }
                    "show_download_in_folder" => {
                        if let Some(path) = msg.path {
                            show_file_in_folder(&path);
                        }
                        return;
                    }
                    "workspace" => {
                        if let Some(ws_str) = msg.id.and_then(|v| v.as_str().map(String::from)) {
                            state.core.tabs.switch_workspace(parse_workspace(&ws_str));
                        }
                    }
                    "home" => {
                        state.core.navigate_active("ferrox://speed-dial");
                        state.content_visible = false;
                        layout_only = true;
                    }
                    "drawer" => {
                        state.drawer_open = msg.open.unwrap_or(false);
                        layout_only = true;
                    }
                    "hibernate_inactive" => {
                        let active_key = state.active_tab_key.clone();
                        tab_webviews.retain(|k, _| active_key.as_deref() == Some(k.as_str()));
                        state
                            .tab_last_bounds
                            .retain(|k, _| active_key.as_deref() == Some(k.as_str()));
                        state
                            .tab_last_visible
                            .retain(|k, _| active_key.as_deref() == Some(k.as_str()));
                        state.core.tabs.hibernate_all_inactive();
                    }
                    "set_limiter" => {
                        if let Ok(mut guard) = state.limiter.lock() {
                            if let Some(enabled) = msg.ram_enabled {
                                guard.config.ram_enabled = enabled;
                            }
                            if let Some(limit) = msg.ram_limit_mb {
                                guard.config.ram_limit_mb = limit;
                            }
                            if let Some(enabled) = msg.cpu_enabled {
                                guard.config.cpu_enabled = enabled;
                            }
                            if let Some(limit) = msg.cpu_limit_percent {
                                guard.config.cpu_limit_percent = limit;
                            }
                            if let Some(enabled) = msg.net_enabled {
                                guard.config.net_enabled = enabled;
                            }
                            if let Some(limit) = msg.net_limit_kbps {
                                guard.config.net_limit_kbps = limit;
                            }
                        }
                    }
                    "toggle_shield" => {
                        state.shield.enabled = !state.shield.enabled;
                        broadcast_shield_state(&state.shield, &tab_webviews);
                    }
                    "set_shield" => {
                        if let Some(enabled) = msg.enabled {
                            state.shield.enabled = enabled;
                        }
                        if let Some(rules) = msg.rules {
                            state.shield.set_rules(rules);
                        }
                        broadcast_shield_state(&state.shield, &tab_webviews);
                    }
                    "set_accent" => {
                        if let Some(accent) = msg.accent {
                            state.core.config.accent = accent;
                            let _ = state.core.config.save();
                        }
                    }
                    "set_theme" => {
                        if let Some(accent) = msg.accent {
                            state.core.config.accent = accent;
                        }
                        if let Some(preset) = msg.accent_preset {
                            state.core.config.accent_preset = preset;
                        }
                        if let Some(hex) = msg.custom_hex {
                            state.core.config.custom_accent_hex = hex;
                        }
                        if let Some(surface) = msg.surface_theme {
                            state.core.config.surface_theme = surface;
                        }
                        let _ = state.core.config.save();
                    }
                    "set_hardware_acceleration" => {
                        if let Some(enabled) = msg.enabled {
                            state.core.config.hardware_acceleration = enabled;
                            let _ = state.core.config.save();
                        }
                    }
                    "set_search_engine" => {
                        if let Some(engine) = msg.engine {
                            state.core.config.search_engine = match engine.as_str() {
                                "wikipedia" => {
                                    "https://en.wikipedia.org/w/index.php?search=".to_string()
                                }
                                "crates" => "https://crates.io/search?q=".to_string(),
                                _ => "https://duckduckgo.com/?q=".to_string(),
                            };
                            state.core.config.search_engine_id = engine;
                            let _ = state.core.config.save();
                        }
                    }
                    "set_layout" => {
                        if let Some(vt) = msg.vertical_tabs {
                            state.core.config.vertical_tabs = vt;
                        }
                        if let Some(bm) = msg.show_bookmarks_bar {
                            state.core.config.show_bookmarks_bar = bm;
                        }
                        let _ = state.core.config.save();
                    }
                    "set_privacy" => {
                        if let Some(https_only) = msg.https_only {
                            state.security.https_only = https_only;
                        }
                        if let Some(safe_browsing) = msg.safe_browsing {
                            state.security.safe_browsing_enabled = safe_browsing;
                        }
                        if let Some(fp) = msg.fingerprint_protection {
                            state.privacy.fingerprint_protection = fp;
                        }
                        if let Some(vpn_on) = msg.vpn_enabled {
                            state.core.config.vpn_enabled = vpn_on;
                            state.privacy.vpn_enabled = vpn_on;
                        }
                        if let Some(vpn_reg) = msg.vpn_region {
                            state.core.config.vpn_region = vpn_reg.clone();
                            state.privacy.vpn_region = vpn_reg;
                        }
                        let _ = state.core.config.save();
                    }
                    _ => {}
                }
                if layout_only {
                    apply_tab_webviews_layout(&mut state, &window, &tab_webviews);
                } else {
                    sync_views(&mut state, &window, &chrome_webview, &tab_webviews);
                }
            }
            _ => {}
        }
    });
}
