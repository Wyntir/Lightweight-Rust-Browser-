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
}

impl Default for BrowserConfig {
    fn default() -> Self {
        Self {
            accent: AccentPreset::Crimson,
            accent_preset: "crimson".to_string(),
            custom_accent_hex: "#FA1E4E".to_string(),
            surface_theme: "obsidian".to_string(),
            hardware_acceleration: true,
            search_engine: "https://duckduckgo.com/?q=".to_string(),
            search_engine_id: "duckduckgo".to_string(),
            vertical_tabs: false,
            show_bookmarks_bar: true,
            vpn_enabled: false,
            vpn_region: "US East".to_string(),
            homepage: "ferrox://speed-dial".to_string(),
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
                title: "Rust Language".to_string(),
                url: "https://www.rust-lang.org".to_string(),
            },
            Bookmark {
                title: "Docs.rs".to_string(),
                url: "https://docs.rs".to_string(),
            },
            Bookmark {
                title: "Crates.io".to_string(),
                url: "https://crates.io".to_string(),
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
