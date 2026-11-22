use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ThreatKind {
    Phishing,
    Malware,
    InsecureHttp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityAssessment {
    pub safe: bool,
    pub upgraded_url: String,
    pub threat: Option<ThreatKind>,
    pub reason: Option<String>,
}

pub struct SecurityEngine {
    pub https_only: bool,
    pub safe_browsing_enabled: bool,
    phishing_indicators: Vec<&'static str>,
}

impl SecurityEngine {
    pub fn new() -> Self {
        Self {
            https_only: true,
            safe_browsing_enabled: true,
            phishing_indicators: vec![
                "malware.testing.google.test",
                "testsafebrowsing.appspot.com",
                "login-verify-account.example",
                "secure-wallet-airdrop.example",
                "paypal-security-check.example",
            ],
        }
    }

    pub fn evaluate_navigation(&self, raw_url: &str) -> SecurityAssessment {
        if raw_url.starts_with("ferrox://") {
            return SecurityAssessment {
                safe: true,
                upgraded_url: raw_url.to_string(),
                threat: None,
                reason: None,
            };
        }

        let Ok(mut parsed) = Url::parse(raw_url) else {
            return SecurityAssessment {
                safe: false,
                upgraded_url: raw_url.to_string(),
                threat: Some(ThreatKind::Malware),
                reason: Some("Malformed URL rejected by parser.".to_string()),
            };
        };

        let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();

        if self.safe_browsing_enabled {
            for sig in &self.phishing_indicators {
                if host == *sig || host.ends_with(&format!(".{}", sig)) {
                    return SecurityAssessment {
                        safe: false,
                        upgraded_url: raw_url.to_string(),
                        threat: Some(ThreatKind::Phishing),
                        reason: Some(format!("Matched Safe Browsing signature: {}", sig)),
                    };
                }
            }
            if host.starts_with("xn--") && host.contains("login") {
                return SecurityAssessment {
                    safe: false,
                    upgraded_url: raw_url.to_string(),
                    threat: Some(ThreatKind::Phishing),
                    reason: Some("Suspicious punycode lookalike domain detected.".to_string()),
                };
            }
        }

        if self.https_only && parsed.scheme() == "http" && host != "localhost" && host != "127.0.0.1" {
            let _ = parsed.set_scheme("https");
            return SecurityAssessment {
                safe: true,
                upgraded_url: parsed.to_string(),
                threat: None,
                reason: Some("Automatically upgraded HTTP request to HTTPS.".to_string()),
            };
        }

        SecurityAssessment {
            safe: true,
            upgraded_url: parsed.to_string(),
            threat: if parsed.scheme() == "http" {
                Some(ThreatKind::InsecureHttp)
            } else {
                None
            },
            reason: None,
        }
    }
}
