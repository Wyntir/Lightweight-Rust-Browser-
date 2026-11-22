use std::collections::HashSet;

use url::Url;

pub struct AdShield {
    pub enabled: bool,
    blocked_domains: HashSet<String>,
    blocked_events: Vec<String>,
}

impl AdShield {
    pub fn with_default_rules() -> Self {
        let defaults = [
            "doubleclick.net",
            "googlesyndication.com",
            "google-analytics.com",
            "googletagmanager.com",
            "adservice.google.com",
            "connect.facebook.net",
            "scorecardresearch.com",
            "mixpanel.com",
            "hotjar.com",
            "segment.io",
            "ads.twitter.com",
        ];
        Self {
            enabled: true,
            blocked_domains: defaults.into_iter().map(String::from).collect(),
            blocked_events: Vec::new(),
        }
    }

    pub fn is_blocked(&self, raw_url: &str) -> bool {
        if !self.enabled {
            return false;
        }
        let Ok(parsed) = Url::parse(raw_url) else {
            return false;
        };
        let Some(host) = parsed.host_str() else {
            return false;
        };
        let host_lower = host.to_ascii_lowercase();
        self.blocked_domains
            .iter()
            .any(|rule| host_lower == *rule || host_lower.ends_with(&format!(".{}", rule)))
    }

    pub fn record_block(&mut self, url: &str) {
        self.blocked_events.push(url.to_string());
    }

    pub fn blocked_count(&self) -> usize {
        self.blocked_events.len()
    }

    /// JavaScript initialization snippet injected into wry::WebView to hide common ad slots.
    pub fn cosmetic_init_script(&self) -> &'static str {
        r#"
        (function() {
            const style = document.createElement('style');
            style.textContent = '[data-ad-slot], .ad-banner, .adsbygoogle { display: none !important; }';
            document.documentElement.appendChild(style);
        })();
        "#
    }
}
