@echo off
setlocal
echo Building FerroX Browser (Windows x86_64 release)...

where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] Rust cargo was not found in PATH.
    echo Install Rust from https://rustup.rs/ and re-run this script.
    pause
    exit /b 1
)

cargo build --release
if %errorlevel% neq 0 (
    echo [Error] Build failed. Check compiler output above.
    pause
    exit /b 1
)

copy /Y target\release\ferrox-browser.exe .\ferrox-browser.exe >nul
echo.
echo Success! Created .\ferrox-browser.exe
echo Launching FerroX Browser...
start "" .\ferrox-browser.exe
