use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedBrowserProfile {
    pub id: String,
    pub browser: String,
    pub browser_name: String,
    pub profile_name: String,
    pub profile_path: String,
    pub has_bookmarks: bool,
    pub has_history: bool,
    pub has_logins_file: bool,
    pub estimated_bookmarks: usize,
    pub estimated_history: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedBookmark {
    pub title: String,
    pub url: String,
    pub category: String,
    pub pinned_to_bar: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedHistoryItem {
    pub title: String,
    pub url: String,
    pub visited_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedCredential {
    pub site: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportResult {
    pub profile_id: String,
    pub browser: String,
    pub browser_name: String,
    pub bookmarks: Vec<ImportedBookmark>,
    pub history: Vec<ImportedHistoryItem>,
    pub credentials: Vec<ImportedCredential>,
    pub notes: Vec<String>,
}

struct TempSqliteCopy {
    main_path: PathBuf,
    wal_path: PathBuf,
    shm_path: PathBuf,
}

impl TempSqliteCopy {
    fn from_source(src: &Path) -> Option<Self> {
        if !src.is_file() {
            return None;
        }
        let seq = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        let base = std::env::temp_dir().join(format!("ferrox_sync_{}_{}.sqlite", pid, seq));
        let wal_dst = PathBuf::from(format!("{}-wal", base.display()));
        let shm_dst = PathBuf::from(format!("{}-shm", base.display()));

        fs::copy(src, &base).ok()?;

        let wal_src = PathBuf::from(format!("{}-wal", src.display()));
        if wal_src.is_file() {
            let _ = fs::copy(&wal_src, &wal_dst);
        }
        let shm_src = PathBuf::from(format!("{}-shm", src.display()));
        if shm_src.is_file() {
            let _ = fs::copy(&shm_src, &shm_dst);
        }

        Some(Self {
            main_path: base,
            wal_path: wal_dst,
            shm_path: shm_dst,
        })
    }

    fn open_readonly(&self) -> Option<Connection> {
        Connection::open_with_flags(&self.main_path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()
    }
}

impl Drop for TempSqliteCopy {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.main_path);
        let _ = fs::remove_file(&self.wal_path);
        let _ = fs::remove_file(&self.shm_path);
    }
}

fn opera_candidate_dirs() -> Vec<(&'static str, &'static str, PathBuf)> {
    let mut dirs_out = Vec::new();
    if let Some(cfg) = dirs::config_dir() {
        #[cfg(target_os = "windows")]
        {
            dirs_out.push((
                "operagx",
                "Opera GX",
                cfg.join("Opera Software").join("Opera GX Stable"),
            ));
            dirs_out.push((
                "opera",
                "Opera",
                cfg.join("Opera Software").join("Opera Stable"),
            ));
        }
        #[cfg(target_os = "macos")]
        {
            dirs_out.push(("operagx", "Opera GX", cfg.join("com.operasoftware.OperaGX")));
            dirs_out.push(("opera", "Opera", cfg.join("com.operasoftware.Opera")));
        }
        #[cfg(target_os = "linux")]
        {
            dirs_out.push(("operagx", "Opera GX", cfg.join("opera-gx")));
            dirs_out.push(("opera", "Opera", cfg.join("opera")));
        }
    }
    dirs_out
}

fn firefox_profiles_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        dirs::config_dir().map(|d| d.join("Mozilla").join("Firefox").join("Profiles"))
    }
    #[cfg(target_os = "macos")]
    {
        dirs::config_dir().map(|d| d.join("Firefox").join("Profiles"))
    }
    #[cfg(target_os = "linux")]
    {
        dirs::home_dir().map(|d| d.join(".mozilla").join("firefox"))
    }
}

fn count_chromium_bookmarks(node: &serde_json::Value) -> usize {
    let mut count = 0;
    if node.get("type").and_then(|v| v.as_str()) == Some("url") {
        if let Some(u) = node.get("url").and_then(|v| v.as_str()) {
            if u.starts_with("http://") || u.starts_with("https://") {
                return 1;
            }
        }
    }
    if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
        for child in children {
            count += count_chromium_bookmarks(child);
        }
    }
    count
}

fn collect_chromium_bookmarks(
    node: &serde_json::Value,
    category: &str,
    pinned_to_bar: bool,
    out: &mut Vec<ImportedBookmark>,
) {
    if node.get("type").and_then(|v| v.as_str()) == Some("url") {
        if let Some(url) = node.get("url").and_then(|v| v.as_str()) {
            let trimmed = url.trim();
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                let title = node
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or(trimmed);
                out.push(ImportedBookmark {
                    title: title.to_string(),
                    url: trimmed.to_string(),
                    category: category.to_string(),
                    pinned_to_bar,
                });
            }
        }
        return;
    }

    if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
        let next_cat = node
            .get("name")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(category);
        for child in children {
            collect_chromium_bookmarks(child, next_cat, pinned_to_bar, out);
        }
    }
}

fn parse_opera_bookmarks(path: &Path, brand_label: &str) -> Vec<ImportedBookmark> {
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Vec::new();
    };
    let Some(roots) = json.get("roots").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(bar) = roots.get("bookmark_bar") {
        collect_chromium_bookmarks(bar, &format!("{} Bar", brand_label), true, &mut out);
    }
    if let Some(other) = roots.get("other") {
        collect_chromium_bookmarks(other, &format!("{} Bookmarks", brand_label), false, &mut out);
    }
    if let Some(synced) = roots.get("synced") {
        collect_chromium_bookmarks(synced, &format!("{} Synced", brand_label), false, &mut out);
    }
    out
}

fn count_opera_bookmarks(path: &Path) -> usize {
    let Ok(raw) = fs::read_to_string(path) else {
        return 0;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return 0;
    };
    let Some(roots) = json.get("roots").and_then(|v| v.as_object()) else {
        return 0;
    };
    roots.values().map(count_chromium_bookmarks).sum()
}

fn chromium_webkit_time_to_unix_ms(webkit_micros: i64) -> u64 {
    const EPOCH_OFFSET_MS: i64 = 11_644_473_600_000;
    let ms = (webkit_micros / 1000) - EPOCH_OFFSET_MS;
    if ms > 0 {
        ms as u64
    } else {
        0
    }
}

fn read_opera_history(path: &Path) -> Vec<ImportedHistoryItem> {
    let Some(copy) = TempSqliteCopy::from_source(path) else {
        return Vec::new();
    };
    let Some(conn) = copy.open_readonly() else {
        return Vec::new();
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT url, title, last_visit_time FROM urls \
         WHERE url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT 300",
    ) else {
        return Vec::new();
    };

    let rows = stmt.query_map([], |row| {
        let url: String = row.get(0)?;
        let title: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
        let visited_raw: i64 = row.get::<_, Option<i64>>(2)?.unwrap_or(0);
        Ok(ImportedHistoryItem {
            title: if title.trim().is_empty() {
                url.clone()
            } else {
                title
            },
            url,
            visited_at: chromium_webkit_time_to_unix_ms(visited_raw),
        })
    });

    match rows {
        Ok(iter) => iter.flatten().collect(),
        Err(_) => Vec::new(),
    }
}

fn count_opera_history(path: &Path) -> usize {
    let Some(copy) = TempSqliteCopy::from_source(path) else {
        return 0;
    };
    let Some(conn) = copy.open_readonly() else {
        return 0;
    };
    conn.query_row(
        "SELECT COUNT(*) FROM urls WHERE url LIKE 'http%'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v.max(0) as usize)
    .unwrap_or(0)
}

fn read_firefox_places(path: &Path) -> (Vec<ImportedBookmark>, Vec<ImportedHistoryItem>) {
    let Some(copy) = TempSqliteCopy::from_source(path) else {
        return (Vec::new(), Vec::new());
    };
    let Some(conn) = copy.open_readonly() else {
        return (Vec::new(), Vec::new());
    };

    let mut bookmarks = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(b.title, p.title, p.url), p.url, COALESCE(parent.title, 'Firefox'), b.parent \
         FROM moz_bookmarks b \
         JOIN moz_places p ON b.fk = p.id \
         LEFT JOIN moz_bookmarks parent ON b.parent = parent.id \
         WHERE b.type = 1 AND p.url LIKE 'http%' \
         ORDER BY b.dateAdded DESC LIMIT 500",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            let title: String = row.get(0)?;
            let url: String = row.get(1)?;
            let parent_title: String = row.get(2)?;
            let parent_id: i64 = row.get::<_, Option<i64>>(3)?.unwrap_or(0);
            let is_toolbar = parent_id == 3 || parent_title.to_lowercase().contains("toolbar");
            let category = if is_toolbar {
                "Firefox Toolbar".to_string()
            } else if parent_title.trim().is_empty() {
                "Firefox".to_string()
            } else {
                parent_title
            };
            Ok(ImportedBookmark {
                title: if title.trim().is_empty() {
                    url.clone()
                } else {
                    title
                },
                url,
                category,
                pinned_to_bar: is_toolbar,
            })
        }) {
            bookmarks = rows.flatten().collect();
        }
    }

    let mut history = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(title, url), url, COALESCE(last_visit_date, 0) \
         FROM moz_places \
         WHERE hidden = 0 AND visit_count > 0 AND url LIKE 'http%' \
         ORDER BY last_visit_date DESC LIMIT 300",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            let title: String = row.get(0)?;
            let url: String = row.get(1)?;
            let last_visit_micros: i64 = row.get(2)?;
            Ok(ImportedHistoryItem {
                title: if title.trim().is_empty() {
                    url.clone()
                } else {
                    title
                },
                url,
                visited_at: (last_visit_micros.max(0) / 1000) as u64,
            })
        }) {
            history = rows.flatten().collect();
        }
    }

    (bookmarks, history)
}

fn count_firefox_places(path: &Path) -> (usize, usize) {
    let Some(copy) = TempSqliteCopy::from_source(path) else {
        return (0, 0);
    };
    let Some(conn) = copy.open_readonly() else {
        return (0, 0);
    };
    let bm_count = conn
        .query_row(
            "SELECT COUNT(*) FROM moz_bookmarks b JOIN moz_places p ON b.fk = p.id \
             WHERE b.type = 1 AND p.url LIKE 'http%'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|v| v.max(0) as usize)
        .unwrap_or(0);
    let hist_count = conn
        .query_row(
            "SELECT COUNT(*) FROM moz_places WHERE hidden = 0 AND visit_count > 0 AND url LIKE 'http%'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|v| v.max(0) as usize)
        .unwrap_or(0);
    (bm_count, hist_count)
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut cols = Vec::new();
    let mut cell = String::new();
    let mut in_quotes = false;
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if in_quotes {
            if ch == '"' && i + 1 < chars.len() && chars[i + 1] == '"' {
                cell.push('"');
                i += 1;
            } else if ch == '"' {
                in_quotes = false;
            } else {
                cell.push(ch);
            }
        } else if ch == '"' {
            in_quotes = true;
        } else if ch == ',' {
            cols.push(cell.trim().to_string());
            cell.clear();
        } else {
            cell.push(ch);
        }
        i += 1;
    }
    cols.push(cell.trim().to_string());
    cols
}

fn try_read_exported_passwords_csv(profile_dir: &Path, candidates: &[&str]) -> Vec<ImportedCredential> {
    let mut search_paths = Vec::new();
    for name in candidates {
        search_paths.push(profile_dir.join(name));
    }
    if let Some(dl_dir) = dirs::download_dir() {
        for name in candidates {
            search_paths.push(dl_dir.join(name));
        }
    }

    for candidate in search_paths {
        let Ok(raw) = fs::read_to_string(&candidate) else {
            continue;
        };
        let mut lines = raw.lines().filter(|l| !l.trim().is_empty());
        let Some(header_line) = lines.next() else {
            continue;
        };
        let header: Vec<String> = parse_csv_line(header_line)
            .into_iter()
            .map(|h| h.to_lowercase())
            .collect();
        let url_idx = header
            .iter()
            .position(|h| h == "url" || h == "origin" || h == "hostname");
        let user_idx = header
            .iter()
            .position(|h| h == "username" || h == "user" || h == "email" || h == "login");
        let pass_idx = header.iter().position(|h| h == "password" || h == "pass");

        let (Some(u_idx), Some(p_idx)) = (user_idx, pass_idx) else {
            continue;
        };

        let mut creds = Vec::new();
        for line in lines {
            let cols = parse_csv_line(line);
            let raw_url = url_idx
                .and_then(|idx| cols.get(idx))
                .cloned()
                .unwrap_or_default();
            let username = cols.get(u_idx).cloned().unwrap_or_default();
            let password = cols.get(p_idx).cloned().unwrap_or_default();
            if raw_url.is_empty() || username.is_empty() || password.is_empty() {
                continue;
            }
            let site = url::Url::parse(&raw_url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_string()))
                .unwrap_or(raw_url);
            creds.push(ImportedCredential {
                site,
                username,
                password,
            });
        }
        if !creds.is_empty() {
            return creds;
        }
    }
    Vec::new()
}

pub fn detect_installed_profiles() -> Vec<DetectedBrowserProfile> {
    let mut detected = Vec::new();

    for (slug, name, dir) in opera_candidate_dirs() {
        if !dir.is_dir() {
            continue;
        }
        let bm_path = dir.join("Bookmarks");
        let hist_path = dir.join("History");
        let logins_path = dir.join("Login Data");
        let has_bookmarks = bm_path.is_file();
        let has_history = hist_path.is_file();
        let has_logins_file = logins_path.is_file();
        if !has_bookmarks && !has_history {
            continue;
        }
        detected.push(DetectedBrowserProfile {
            id: format!("{}:default", slug),
            browser: slug.to_string(),
            browser_name: name.to_string(),
            profile_name: "Default".to_string(),
            profile_path: dir.display().to_string(),
            has_bookmarks,
            has_history,
            has_logins_file,
            estimated_bookmarks: if has_bookmarks {
                count_opera_bookmarks(&bm_path)
            } else {
                0
            },
            estimated_history: if has_history {
                count_opera_history(&hist_path)
            } else {
                0
            },
        });
    }

    if let Some(ff_root) = firefox_profiles_root() {
        if let Ok(entries) = fs::read_dir(&ff_root) {
            let mut dirs_list: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir() && p.join("places.sqlite").is_file())
                .collect();

            dirs_list.sort_by(|a, b| {
                let a_name = a.file_name().and_then(|n| n.to_str()).unwrap_or("");
                let b_name = b.file_name().and_then(|n| n.to_str()).unwrap_or("");
                let a_pri = usize::from(!a_name.contains("default-release"));
                let b_pri = usize::from(!b_name.contains("default-release"));
                a_pri.cmp(&b_pri).then_with(|| a_name.cmp(b_name))
            });

            for profile_dir in dirs_list {
                let folder_name = profile_dir
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("default")
                    .to_string();
                let places_path = profile_dir.join("places.sqlite");
                let (bm_count, hist_count) = count_firefox_places(&places_path);
                let has_logins_file = profile_dir.join("logins.json").is_file();
                detected.push(DetectedBrowserProfile {
                    id: format!("firefox:{}", folder_name),
                    browser: "firefox".to_string(),
                    browser_name: "Mozilla Firefox".to_string(),
                    profile_name: folder_name,
                    profile_path: profile_dir.display().to_string(),
                    has_bookmarks: bm_count > 0,
                    has_history: hist_count > 0,
                    has_logins_file,
                    estimated_bookmarks: bm_count,
                    estimated_history: hist_count,
                });
            }
        }
    }

    detected
}

pub fn import_profile_by_id(profile_id: &str) -> Vec<ProfileImportResult> {
    let profiles = detect_installed_profiles();
    let targets: Vec<DetectedBrowserProfile> = if profile_id == "all" {
        profiles
    } else {
        profiles
            .into_iter()
            .filter(|p| p.id == profile_id || p.browser == profile_id)
            .collect()
    };

    targets
        .into_iter()
        .map(|profile| {
            let dir = PathBuf::from(&profile.profile_path);
            let mut notes = Vec::new();

            if profile.browser == "firefox" {
                let (bookmarks, history) = read_firefox_places(&dir.join("places.sqlite"));
                let credentials = try_read_exported_passwords_csv(&dir, &["logins.csv"]);
                if credentials.is_empty() && profile.has_logins_file {
                    notes.push(
                        "Firefox encrypts logins.json with your OS profile key. Export logins.csv from about:logins to also import passwords."
                            .to_string(),
                    );
                }
                ProfileImportResult {
                    profile_id: profile.id,
                    browser: profile.browser,
                    browser_name: profile.browser_name,
                    bookmarks,
                    history,
                    credentials,
                    notes,
                }
            } else {
                let bookmarks = parse_opera_bookmarks(&dir.join("Bookmarks"), &profile.browser_name);
                let history = read_opera_history(&dir.join("History"));
                let credentials = try_read_exported_passwords_csv(
                    &dir,
                    &["Opera Passwords.csv", "passwords.csv", "logins.csv"],
                );
                if credentials.is_empty() && profile.has_logins_file {
                    notes.push(
                        "Opera encrypts saved logins with OS DPAPI. Export Opera Passwords.csv from opera://password-manager/settings to also import passwords."
                            .to_string(),
                    );
                }
                ProfileImportResult {
                    profile_id: profile.id,
                    browser: profile.browser,
                    browser_name: profile.browser_name,
                    bookmarks,
                    history,
                    credentials,
                    notes,
                }
            }
        })
        .collect()
}
