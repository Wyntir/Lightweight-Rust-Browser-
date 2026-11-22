use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightweightExtension {
    pub id: String,
    pub name: String,
    pub match_pattern: String,
    pub enabled: bool,
    pub content_script: String,
}

pub struct ExtensionHost {
    pub extensions: Vec<LightweightExtension>,
}

impl ExtensionHost {
    pub fn with_defaults() -> Self {
        Self {
            extensions: vec![
                LightweightExtension {
                    id: "ext-dark-reader".to_string(),
                    name: "Dark Mode Boost".to_string(),
                    match_pattern: "*".to_string(),
                    enabled: false,
                    content_script: "document.documentElement.style.filter='invert(0.92) hue-rotate(180deg)';".to_string(),
                },
                LightweightExtension {
                    id: "ext-focus-dimmer".to_string(),
                    name: "Focus Dimmer".to_string(),
                    match_pattern: "*".to_string(),
                    enabled: false,
                    content_script: "document.body.style.maxWidth='78ch';document.body.style.margin='0 auto';".to_string(),
                },
            ],
        }
    }

    pub fn build_combined_init_script(&self) -> String {
        let mut combined = String::new();
        for ext in &self.extensions {
            if ext.enabled {
                combined.push_str(&format!("try {{ {} }} catch(_e) {{}}\n", ext.content_script));
            }
        }
        combined
    }
}
