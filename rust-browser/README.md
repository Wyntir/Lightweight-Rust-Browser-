# FerroX Browser (Rust Edition)

FerroX is a lightweight, resource-bounded desktop web browser written in Rust, inspired by Opera GX. It pairs the OS-native WebView (`wry` + `tao`) with a dark GX chrome shell and live process resource limiting via `sysinfo`.

## Modules

- **`src/main.rs`** — Boots `tao` (dark DWM chrome) + dual `wry` WebViews (chrome shell via `ferrox://` custom protocol + live web content WebView), handles IPC commands, and enforces RAM limits on background tabs.
- **`src/ui_assets.rs` + `src/ui/`** — Embedded React 19 + Tailwind CSS UI (`index.html`, `bundle.css`, `bundle.js`, backdrop assets) served over `https://ferrox.localhost/` on Windows WebView2 so `localStorage`, WebCrypto, and full styling match the web preview 1:1.
- **`src/browser.rs`** — Omnibox URL/search normalization, `ferrox://` routes, and persistent `config.json`.
- **`src/tabs.rs`** — Workspaces (`Main`, `Gaming`, `Dev`, `Research`), per-tab back/forward history, and LRU tab hibernation.
- **`src/limiter.rs`** — `sysinfo` process tree memory/CPU sampling and token-bucket `BandwidthLimiter`.
- **`src/adblock.rs`** — Tracker domain rules and cosmetic initialization script injected into `wry::WebView`.
- **`src/theme.rs`** — Accent presets (`Crimson`, `Cobalt`, `Amber`, `Emerald`).

## Quick Build on Windows (`.exe`)

1. Install [Rust](https://rustup.rs/). (Windows 10/11 already includes Edge WebView2 Runtime.)
2. Double-click **`build-windows.bat`** or run:
   ```cmd
   cargo build --release
   .\target\release\ferrox-browser.exe
   ```

## Automated Build via GitHub Actions

Push this repository to GitHub and open the **Actions** tab -> **Build FerroX Windows EXE** to download the compiled `ferrox-browser.exe` artifact without installing Rust locally.

## Linux & macOS

- **macOS**: `cargo run --release` (uses built-in `WKWebView`)
- **Linux (Debian/Ubuntu)**: Install `libwebkit2gtk-4.1-dev` and `libgtk-3-dev`, then run `cargo run --release`
