use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DohProvider {
    Cloudflare,
    Quad9,
    Google,
    Custom,
}

impl DohProvider {
    pub fn endpoint(self) -> &'static str {
        match self {
            DohProvider::Cloudflare => "https://cloudflare-dns.com/dns-query",
            DohProvider::Quad9 => "https://dns.quad9.net/dns-query",
            DohProvider::Google => "https://dns.google/dns-query",
            DohProvider::Custom => "",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Ask,
    Allow,
    Block,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SitePermissions {
    pub camera: PermissionDecision,
    pub microphone: PermissionDecision,
    pub notifications: PermissionDecision,
    pub location: PermissionDecision,
    pub clipboard: PermissionDecision,
}

impl Default for SitePermissions {
    fn default() -> Self {
        Self {
            camera: PermissionDecision::Ask,
            microphone: PermissionDecision::Ask,
            notifications: PermissionDecision::Block,
            location: PermissionDecision::Ask,
            clipboard: PermissionDecision::Ask,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyConfig {
    pub block_third_party_cookies: bool,
    pub clear_cookies_on_exit: bool,
    pub fingerprint_protection: bool,
    pub private_browsing: bool,
    pub doh_provider: DohProvider,
    pub custom_doh_url: String,
    pub vpn_enabled: bool,
    pub vpn_region: String,
    pub per_site_permissions: HashMap<String, SitePermissions>,
}

impl Default for PrivacyConfig {
    fn default() -> Self {
        Self {
            block_third_party_cookies: true,
            clear_cookies_on_exit: false,
            fingerprint_protection: true,
            private_browsing: false,
            doh_provider: DohProvider::Cloudflare,
            custom_doh_url: String::new(),
            vpn_enabled: false,
            vpn_region: "US-East".to_string(),
            per_site_permissions: HashMap::new(),
        }
    }
}

impl PrivacyConfig {
    /// Generates WebView init script that normalizes canvas/hardware properties when enabled.
    pub fn anti_fingerprint_script(&self) -> &'static str {
        if !self.fingerprint_protection {
            return "";
        }
        r#"
        (function() {
            try {
                Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
                Object.defineProperty(navigator, 'deviceMemory', { get: () => 4 });
            } catch (_) {}
        })();
        "#
    }
}
