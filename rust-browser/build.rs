fn main() {
    println!("cargo:rerun-if-changed=assets/ferrox-icon.ico");
    println!("cargo:rerun-if-changed=assets/ferrox-icon-64.rgba");
    println!("cargo:rerun-if-changed=assets/ferrox-browser.exe.manifest");

    #[cfg(windows)]
    {
        if std::env::var_os("CARGO_CFG_WINDOWS").is_some() {
            let mut res = winresource::WindowsResource::new();
            res.set_icon("assets/ferrox-icon.ico");
            res.set_manifest_file("assets/ferrox-browser.exe.manifest");
            res.set("ProductName", "FerroX Browser");
            res.set("FileDescription", "FerroX Lightweight Rust Web Browser");
            res.set("CompanyName", "FerroX Browser Project");
            res.set("LegalCopyright", "Copyright (c) FerroX Browser Contributors");
            res.set("OriginalFilename", "ferrox-browser.exe");
            res.set("InternalName", "ferrox-browser");
            if let Err(err) = res.compile() {
                panic!("Failed to embed Windows icon & version metadata: {}", err);
            }
        }
    }
}
