use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Downloading,
    Paused,
    Completed,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: u64,
    pub filename: String,
    pub url: String,
    pub bytes_received: u64,
    pub total_bytes: u64,
    pub status: DownloadStatus,
    pub warning: Option<String>,
}

pub fn scan_download_filename(filename: &str) -> Option<String> {
    let lower = filename.to_ascii_lowercase();
    let risky_exts = [".exe", ".bat", ".cmd", ".ps1", ".vbs", ".scr", ".msi", ".hta"];
    for ext in risky_exts {
        if lower.ends_with(ext) {
            return Some(format!(
                "Executable or script file ({}) flagged by FerroX Download Scanner.",
                ext
            ));
        }
    }
    None
}
