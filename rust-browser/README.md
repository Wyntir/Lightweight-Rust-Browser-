# FerroX Browser (Rust Edition)

FerroX is a lightweight, resource-bounded desktop web browser written in Rust, inspired by Opera GX. It pairs the OS-native WebView (`wry` + `tao`) with a dark GX chrome shell and live process resource limiting via `sysinfo`.

## Modules

- **`build.rs` + `assets/`** — Embeds the multi-size `ferrox-icon.ico` (16–256px) for Windows Explorer & Taskbar, PerMonitorV2 DPI manifest (`ferrox-browser.exe.manifest`), and PE VersionInfo metadata (`ProductName`, `FileDescription`, `CompanyName`) directly into `ferrox-browser.exe`.
- **`sign-windows.ps1`** — Authenticode SHA-256 code-signing script supporting both CA-issued `.pfx` certificates (`FERROX_SIGN_PFX` / `FERROX_SIGN_PASSWORD`) and automatic local trusted publisher signing on your PC (`-TrustLocally`).
- **`src/main.rs`** — Boots `tao` (dark DWM chrome + native window/taskbar icon) + dual `wry` WebViews (chrome shell via `ferrox://` custom protocol + live web content WebView), intercepts `target="_blank"` / `window.open` popups into the same window, caches layout bounds to eliminate compositor stutter, runs profile scans on background threads, and enforces RAM limits.
- **`src/importer.rs`** — Automatically detects local Opera GX, Opera, and Mozilla Firefox profiles and reads live `Bookmarks` JSON + `History` / `places.sqlite` databases (even while those browsers are running) for 1-click and auto-on-launch migration.
- **`src/ui_assets.rs` + `src/ui/`** — Embedded React 19 + Tailwind CSS UI (`index.html`, `favicon.png`, `bundle.css`, `bundle.js`, logo & backdrop assets) served over `https://ferrox.localhost/` on Windows WebView2 so `localStorage`, WebCrypto, and full styling match the web preview 1:1.
- **`src/browser.rs`** — Omnibox URL/search normalization, `ferrox://` routes, and persistent `config.json`.
- **`src/tabs.rs`** — Workspaces (`Main`, `Gaming`, `Dev`, `Research`), per-tab back/forward history, and LRU tab hibernation.
- **`src/limiter.rs`** — Lightweight `sysinfo` (`ProcessRefreshKind::nothing().with_memory().with_cpu()`) sampling every 2s and token-bucket `BandwidthLimiter`.
- **`src/adblock.rs`** — Tracker domain rules and cosmetic initialization script injected into `wry::WebView`.
- **`src/theme.rs`** — Accent presets (`Crimson`, `Cobalt`, `Amber`, `Emerald`).

## Quick Build & Sign on Windows (`.exe`)

1. Install [Rust](https://rustup.rs/). (Windows 10/11 already includes Edge WebView2 Runtime.)
2. Double-click **`build-windows.bat`** — it compiles `ferrox-browser.exe` with the embedded FerroX logo, manifest, and VersionInfo, then runs `sign-windows.ps1 -TrustLocally` to sign the binary with a local Authenticode certificate so Windows shows a verified publisher on your PC instead of an unsigned/unknown executable.
3. For public distribution across other PCs without SmartScreen prompts, supply a CA-issued code-signing certificate (`FERROX_SIGN_PFX` + `FERROX_SIGN_PASSWORD` locally, or `WINDOWS_CERT_PFX_BASE64` + `WINDOWS_CERT_PASSWORD` in GitHub Actions secrets).

## Automated Build via GitHub Actions

Push this repository to GitHub and open the **Actions** tab -> **Build FerroX Windows EXE** to download the compiled `ferrox-browser.exe` and `ferrox-browser.exe.sha256` checksum artifacts.

## Linux & macOS

- **macOS**: `cargo run --release` (uses built-in `WKWebView`)
- **Linux (Debian/Ubuntu)**: Install `libwebkit2gtk-4.1-dev` and `libgtk-3-dev`, then run `cargo run --release`
