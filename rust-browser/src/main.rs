#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adblock;
mod browser;
mod downloads;
mod extensions;
mod limiter;
mod privacy;
mod security;
mod tabs;
mod theme;
mod vault;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tao::{
    dpi::LogicalSize as TaoLogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::{Window, WindowBuilder},
};
use wry::{
    dpi::{LogicalPosition, LogicalSize},
    http::Request,
    Rect, WebView, WebViewBuilder,
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

const CHROME_HTML: &str = include_str!("chrome_ui.html");
const RAIL_WIDTH: f64 = 48.0;
const DRAWER_WIDTH: f64 = 320.0;
const TOP_BAR_HEIGHT: f64 = 120.0;

#[derive(Debug)]
enum UserEvent {
    Ipc(String),
    TelemetryTick,
}

#[derive(Debug, Deserialize)]
struct IpcMessage {
    action: String,
    url: Option<String>,
    id: Option<serde_json::Value>,
    open: Option<bool>,
    left: Option<f64>,
    top: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    visible: Option<bool>,
    enabled: Option<bool>,
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

fn content_rect(state: &AppState, window: &Window) -> Rect {
    if let Some((x, y, w, h)) = state.content_rect_override {
        return Rect {
            position: LogicalPosition::new(x.max(0.0), y.max(0.0)).into(),
            size: LogicalSize::new(w.max(1.0), h.max(1.0)).into(),
        };
    }
    let (w, h) = logical_window_size(window);
    let left = RAIL_WIDTH + if state.drawer_open { DRAWER_WIDTH } else { 0.0 };
    Rect {
        position: LogicalPosition::new(left, TOP_BAR_HEIGHT).into(),
        size: LogicalSize::new((w - left).max(1.0), (h - TOP_BAR_HEIGHT).max(1.0)).into(),
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

fn sync_views(state: &AppState, window: &Window, chrome: &WebView, content: &WebView) {
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
        active_url: active_url.clone(),
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
    };

    if let Ok(json) = serde_json::to_string(&payload) {
        let _ = chrome.evaluate_script(&format!(
            "if (window.__ferroxSync) window.__ferroxSync({});",
            json
        ));
    }

    let show_content = state.content_visible && !active_url.starts_with("ferrox://");
    let _ = content.set_bounds(content_rect(state, window));
    let _ = content.set_visible(show_content);
}

fn main() {
    env_logger::init();

    let config = BrowserConfig::load_or_default();
    if !config.hardware_acceleration {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu");
    }

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let window = WindowBuilder::new()
        .with_title("FerroX Browser")
        .with_inner_size(TaoLogicalSize::new(1360.0, 860.0))
        .build(&event_loop)
        .expect("Failed to create FerroX window");

    let (w, h) = logical_window_size(&window);
    let ipc_proxy = proxy.clone();

    let chrome_webview = build_child(
        &window,
        WebViewBuilder::new()
            .with_html(CHROME_HTML)
            .with_bounds(Rect {
                position: LogicalPosition::new(0.0, 0.0).into(),
                size: LogicalSize::new(w, h).into(),
            })
            .with_ipc_handler(move |req: Request<String>| {
                let _ = ipc_proxy.send_event(UserEvent::Ipc(req.body().clone()));
            }),
    )
    .expect("Failed to initialize FerroX chrome WebView");

    let shield = AdShield::with_default_rules();
    let privacy = PrivacyConfig::default();
    let extensions = ExtensionHost::with_defaults();
    let combined_init_script = format!(
        "{}\n{}\n{}",
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
    };

    let content_webview = build_child(
        &window,
        WebViewBuilder::new()
            .with_url("about:blank")
            .with_initialization_script(&combined_init_script)
            .with_bounds(content_rect(&initial_state, &window)),
    )
    .expect("Failed to initialize FerroX content WebView");
    let _ = content_webview.set_visible(false);

    let limiter_bg = Arc::clone(&initial_state.limiter);
    let tick_proxy = proxy.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        if let Ok(mut guard) = limiter_bg.lock() {
            guard.sample_process_metrics();
        }
        if tick_proxy.send_event(UserEvent::TelemetryTick).is_err() {
            break;
        }
    });

    let mut state = initial_state;
    sync_views(&state, &window, &chrome_webview, &content_webview);

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
                event: WindowEvent::Resized(_),
                ..
            } => {
                let (nw, nh) = logical_window_size(&window);
                let _ = chrome_webview.set_bounds(Rect {
                    position: LogicalPosition::new(0.0, 0.0).into(),
                    size: LogicalSize::new(nw, nh).into(),
                });
                let _ = content_webview.set_bounds(content_rect(&state, &window));
            }
            Event::UserEvent(UserEvent::TelemetryTick) => {
                let should_hibernate = state
                    .limiter
                    .lock()
                    .map(|g| g.config.ram_enabled && g.snapshot.total_ram_mb > g.config.ram_limit_mb)
                    .unwrap_or(false);
                if should_hibernate {
                    state.core.tabs.hibernate_oldest_background_tab();
                }
                sync_views(&state, &window, &chrome_webview, &content_webview);
            }
            Event::UserEvent(UserEvent::Ipc(raw)) => {
                let Ok(msg) = serde_json::from_str::<IpcMessage>(&raw) else {
                    return;
                };
                match msg.action.as_str() {
                    "ready" => {}
                    "layout" => {
                        if let (Some(l), Some(t), Some(w), Some(h)) =
                            (msg.left, msg.top, msg.width, msg.height)
                        {
                            state.content_rect_override = Some((l, t, w, h));
                        }
                        if let Some(vis) = msg.visible {
                            state.content_visible = vis;
                        }
                    }
                    "navigate" => {
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
                            } else {
                                if state.privacy.private_browsing {
                                    state.core.tabs.navigate_active(&assessment.upgraded_url);
                                } else {
                                    state.core.navigate_active(&assessment.upgraded_url);
                                }
                                if !assessment.upgraded_url.starts_with("ferrox://") {
                                    state.content_visible = true;
                                    let _ = content_webview.load_url(&assessment.upgraded_url);
                                } else {
                                    state.content_visible = false;
                                }
                            }
                        }
                    }
                    "new_tab" => {
                        state.core.tabs.open_tab(
                            "ferrox://speed-dial",
                            "Speed Dial",
                            state.privacy.private_browsing,
                        );
                        state.content_visible = false;
                    }
                    "select_tab" => {
                        if let Some(id) = msg.id.and_then(|v| v.as_u64()) {
                            state.core.tabs.activate_tab(id);
                            if let Some(tab) = state.core.tabs.active_tab() {
                                if !tab.url.starts_with("ferrox://") {
                                    state.content_visible = true;
                                    let _ = content_webview.load_url(&tab.url);
                                } else {
                                    state.content_visible = false;
                                }
                            }
                        }
                    }
                    "close_tab" => {
                        if let Some(id) = msg.id.and_then(|v| v.as_u64()) {
                            state.core.tabs.close_tab(id);
                            if let Some(tab) = state.core.tabs.active_tab() {
                                if !tab.url.starts_with("ferrox://") {
                                    state.content_visible = true;
                                    let _ = content_webview.load_url(&tab.url);
                                } else {
                                    state.content_visible = false;
                                }
                            }
                        }
                    }
                    "workspace" => {
                        if let Some(ws_str) = msg.id.and_then(|v| v.as_str().map(String::from)) {
                            state.core.tabs.switch_workspace(parse_workspace(&ws_str));
                            if let Some(tab) = state.core.tabs.active_tab() {
                                if !tab.url.starts_with("ferrox://") {
                                    state.content_visible = true;
                                    let _ = content_webview.load_url(&tab.url);
                                } else {
                                    state.content_visible = false;
                                }
                            }
                        }
                    }
                    "back" => {
                        state.core.tabs.go_back();
                        if let Some(tab) = state.core.tabs.active_tab() {
                            if !tab.url.starts_with("ferrox://") {
                                state.content_visible = true;
                                let _ = content_webview.load_url(&tab.url);
                            } else {
                                state.content_visible = false;
                            }
                        }
                    }
                    "forward" => {
                        state.core.tabs.go_forward();
                        if let Some(tab) = state.core.tabs.active_tab() {
                            if !tab.url.starts_with("ferrox://") {
                                state.content_visible = true;
                                let _ = content_webview.load_url(&tab.url);
                            } else {
                                state.content_visible = false;
                            }
                        }
                    }
                    "reload" => {
                        if let Some(tab) = state.core.tabs.active_tab() {
                            if !tab.url.starts_with("ferrox://") {
                                let _ = content_webview.load_url(&tab.url);
                            }
                        }
                    }
                    "home" => {
                        state.core.navigate_active("ferrox://speed-dial");
                        state.content_visible = false;
                    }
                    "drawer" => {
                        state.drawer_open = msg.open.unwrap_or(false);
                    }
                    "hibernate_inactive" => {
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
                                "wikipedia" => "https://en.wikipedia.org/w/index.php?search=".to_string(),
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
                sync_views(&state, &window, &chrome_webview, &content_webview);
            }
            _ => {}
        }
    });
}
