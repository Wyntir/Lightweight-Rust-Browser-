use serde::{Deserialize, Serialize};
use url::Url;

use crate::tabs::TabManager;
use crate::theme::AccentPreset;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BrowserConfig {
    pub accent: AccentPreset,
    pub accent_preset: String,
    pub custom_accent_hex: String,
    pub surface_theme: String,
    pub hardware_acceleration: bool,
    pub search_engine: String,
    pub search_engine_id: String,
    pub vertical_tabs: bool,
    pub show_bookmarks_bar: bool,
    pub vpn_enabled: bool,
    pub vpn_region: String,
    pub homepage: String,
    pub auto_sync_browsers: bool,
    pub ram_enabled: bool,
    pub ram_limit_mb: u64,
    pub auto_hibernate_enabled: bool,
    pub auto_hibernate_minutes: u64,
    pub cpu_enabled: bool,
    pub cpu_limit_percent: u32,
    pub net_enabled: bool,
    pub net_limit_kbps: u64,
}

impl Default for BrowserConfig {
    fn default() -> Self {
        Self {
            accent: AccentPreset::Crimson,
            accent_preset: "crimson".to_string(),
            custom_accent_hex: "#FA1E4E".to_string(),
            surface_theme: "obsidian".to_string(),
            hardware_acceleration: true,
            search_engine: "https://www.google.com/search?q=".to_string(),
            search_engine_id: "google".to_string(),
            vertical_tabs: false,
            show_bookmarks_bar: true,
            vpn_enabled: false,
            vpn_region: "US East".to_string(),
            homepage: "ferrox://speed-dial".to_string(),
            auto_sync_browsers: true,
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

impl BrowserConfig {
    pub fn load_or_default() -> Self {
        let Some(dir) = dirs::config_dir() else {
            return Self::default();
        };
        let path = dir.join("ferrox-browser").join("config.json");
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self) -> std::io::Result<()> {
        let Some(dir) = dirs::config_dir() else {
            return Ok(());
        };
        let folder = dir.join("ferrox-browser");
        std::fs::create_dir_all(&folder)?;
        let raw = serde_json::to_string_pretty(self)?;
        std::fs::write(folder.join("config.json"), raw)
    }
}

pub struct BrowserCore {
    pub config: BrowserConfig,
    pub tabs: TabManager,
    pub bookmarks: Vec<Bookmark>,
    pub history: Vec<String>,
}

impl BrowserCore {
    pub fn new(config: BrowserConfig) -> Self {
        let bookmarks = vec![
            Bookmark {
                title: "Google".to_string(),
                url: "https://www.google.com".to_string(),
            },
            Bookmark {
                title: "YouTube".to_string(),
                url: "https://www.youtube.com".to_string(),
            },
            Bookmark {
                title: "Wikipedia".to_string(),
                url: "https://en.wikipedia.org".to_string(),
            },
        ];

        Self {
            config,
            tabs: TabManager::new(),
            bookmarks,
            history: Vec::new(),
        }
    }

    pub fn normalize_address(input: &str, search_engine: &str) -> String {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return "ferrox://speed-dial".to_string();
        }
        if trimmed.starts_with("ferrox://")
            || trimmed.starts_with("http://")
            || trimmed.starts_with("https://")
        {
            return trimmed.to_string();
        }
        if !trimmed.contains(' ') && trimmed.contains('.') {
            let candidate = format!("https://{}", trimmed);
            if Url::parse(&candidate).is_ok() {
                return candidate;
            }
        }
        format!("{}{}", search_engine, trimmed.replace(' ', "+"))
    }

    pub fn navigate_active(&mut self, url: &str) {
        self.tabs.navigate_active(url);
        if !url.starts_with("ferrox://") {
            self.history.push(url.to_string());
        }
    }
}
