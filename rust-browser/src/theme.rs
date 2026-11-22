use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AccentPreset {
    Crimson,
    Cobalt,
    Amber,
    Emerald,
}

impl AccentPreset {
    pub fn hex(self) -> &'static str {
        match self {
            AccentPreset::Crimson => "#FA1E4E",
            AccentPreset::Cobalt => "#38BDF8",
            AccentPreset::Amber => "#F59E0B",
            AccentPreset::Emerald => "#10B981",
        }
    }
}
