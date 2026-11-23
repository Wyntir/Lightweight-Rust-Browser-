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
    pub stripped_trackers: usize,
}

const TRACKING_QUERY_PARAMS: &[&str] = &[
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "mc_eid",
    "mc_cid",
    "yclid",
    "igshid",
    "_hsenc",
    "_hsmi",
    "mkt_tok",
    "ref_src",
    "oly_enc_id",
    "oly_anon_id",
    "vero_id",
    "rb_clickid",
    "s_cid",
];

pub struct SecurityEngine {
    pub https_only: bool,
    pub safe_browsing_enabled: bool,
    pub strip_tracking_params: bool,
    phishing_indicators: Vec<&'static str>,
}

impl SecurityEngine {
    pub fn new() -> Self {
        Self {
            https_only: true,
            safe_browsing_enabled: true,
            strip_tracking_params: true,
            phishing_indicators: vec![
                "malware.testing.google.test",
                "testsafebrowsing.appspot.com",
                "login-verify-account.example",
                "secure-wallet-airdrop.example",
                "paypal-security-check.example",
                "coinhive.com",
                "coin-hive.com",
                "cryptoloot.pro",
                "crypto-loot.com",
                "webminepool.com",
            ],
        }
    }

    fn strip_url_trackers(parsed: &mut Url) -> usize {
        if parsed.query().is_none() {
            return 0;
        }
        let mut kept: Vec<(String, String)> = Vec::new();
        let mut stripped: usize = 0;

        for (k, v) in parsed.query_pairs() {
            let lower = k.to_ascii_lowercase();
            let is_tracker = lower.starts_with("utm_")
                || TRACKING_QUERY_PARAMS.iter().any(|p| *p == lower);
            if is_tracker {
                stripped += 1;
            } else {
                kept.push((k.into_owned(), v.into_owned()));
            }
        }

        if stripped > 0 {
            if kept.is_empty() {
                parsed.set_query(None);
            } else {
                parsed.query_pairs_mut().clear().extend_pairs(
                    kept.iter().map(|(k, v)| (k.as_str(), v.as_str())),
                );
            }
        }
        stripped
    }

    pub fn evaluate_navigation(&self, raw_url: &str) -> SecurityAssessment {
        if raw_url.starts_with("ferrox://") {
            return SecurityAssessment {
                safe: true,
                upgraded_url: raw_url.to_string(),
                threat: None,
                reason: None,
                stripped_trackers: 0,
            };
        }

        let trimmed_lower = raw_url.trim().to_ascii_lowercase();
        if trimmed_lower.starts_with("javascript:")
            || trimmed_lower.starts_with("vbscript:")
            || trimmed_lower.starts_with("data:text/html")
        {
            return SecurityAssessment {
                safe: false,
                upgraded_url: raw_url.to_string(),
                threat: Some(ThreatKind::Malware),
                reason: Some("Blocked unsafe script/HTML navigation scheme.".to_string()),
                stripped_trackers: 0,
            };
        }

        let Ok(mut parsed) = Url::parse(raw_url) else {
            return SecurityAssessment {
                safe: false,
                upgraded_url: raw_url.to_string(),
                threat: Some(ThreatKind::Malware),
                reason: Some("Malformed URL rejected by parser.".to_string()),
                stripped_trackers: 0,
            };
        };

        if !matches!(parsed.scheme(), "http" | "https") {
            return SecurityAssessment {
                safe: false,
                upgraded_url: raw_url.to_string(),
                threat: Some(ThreatKind::Malware),
                reason: Some(format!(
                    "Blocked non-HTTP(S) navigation scheme: {}",
                    parsed.scheme()
                )),
                stripped_trackers: 0,
            };
        }

        let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();

        if self.safe_browsing_enabled {
            // Block credential-in-URL phishing trick (e.g. https://google.com@evil.example)
            if !parsed.username().is_empty() {
                return SecurityAssessment {
                    safe: false,
                    upgraded_url: raw_url.to_string(),
                    threat: Some(ThreatKind::Phishing),
                    reason: Some(
                        "Blocked deceptive URL containing embedded login credentials (@-trick)."
                            .to_string(),
                    ),
                    stripped_trackers: 0,
                };
            }

            for sig in &self.phishing_indicators {
                if host == *sig || host.ends_with(&format!(".{}", sig)) {
                    return SecurityAssessment {
                        safe: false,
                        upgraded_url: raw_url.to_string(),
                        threat: Some(ThreatKind::Phishing),
                        reason: Some(format!("Matched Safe Browsing signature: {}", sig)),
                        stripped_trackers: 0,
                    };
                }
            }

            let suspicious_brand = host.contains("login")
                || host.contains("bank")
                || host.contains("wallet")
                || host.contains("verify")
                || host.contains("account")
                || host.contains("paypal")
                || host.contains("apple")
                || host.contains("microsoft")
                || host.contains("google");
            if host.starts_with("xn--") && suspicious_brand {
                return SecurityAssessment {
                    safe: false,
                    upgraded_url: raw_url.to_string(),
                    threat: Some(ThreatKind::Phishing),
                    reason: Some("Suspicious IDN punycode lookalike domain blocked.".to_string()),
                    stripped_trackers: 0,
                };
            }
        }

        let stripped_trackers = if self.strip_tracking_params {
            Self::strip_url_trackers(&mut parsed)
        } else {
            0
        };

        if self.https_only && parsed.scheme() == "http" && host != "localhost" && host != "127.0.0.1" {
            let _ = parsed.set_scheme("https");
            return SecurityAssessment {
                safe: true,
                upgraded_url: parsed.to_string(),
                threat: None,
                reason: Some("Automatically upgraded HTTP request to HTTPS.".to_string()),
                stripped_trackers,
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
            stripped_trackers,
        }
    }
}
