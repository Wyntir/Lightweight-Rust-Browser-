interface DocsViewProps {
  onOpenRustSource: () => void;
}

export function DocsView({ onOpenRustSource }: DocsViewProps) {
  return (
    <div className="h-full overflow-y-auto bg-[#0B0D12] px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="pb-4 border-b border-white/8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-white">
              FerroX Architecture
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              How FerroX delivers an Opera GX-style lightweight browser in Rust
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenRustSource}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
            style={{ backgroundColor: 'var(--fx-accent)' }}
          >
            Inspect Rust Crate
          </button>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-base font-semibold text-white">
            01. Native WebView Without Bundled Chromium Bloat
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Instead of shipping a 150 MB+ Chromium binary, FerroX uses <span className="font-mono-tabular text-white">wry</span> and <span className="font-mono-tabular text-white">tao</span> to bind directly to the host OS WebView engine (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), keeping idle binary footprint minimal while pairing it with an <span className="font-mono-tabular text-white">egui</span> chrome rail.
          </p>
        </section>

        <section className="space-y-3 pt-4 border-t border-white/8">
          <h2 className="font-display text-base font-semibold text-white">
            02. Process Resource Limiting & Tab Hibernation
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            In <span className="font-mono-tabular text-white">src/limiter.rs</span>, a background sampler tracks process tree RSS memory and CPU utilization via <span className="font-mono-tabular text-white">sysinfo</span>. When active memory exceeds the configured RAM cap, <span className="font-mono-tabular text-white">TabManager::hibernate_oldest_background_tab</span> suspends idle unpinned tabs to drop their memory footprint. Network responses pass through a token-bucket <span className="font-mono-tabular text-white">BandwidthLimiter</span>.
          </p>
        </section>

        <section className="space-y-3 pt-4 border-t border-white/8">
          <h2 className="font-display text-base font-semibold text-white">
            03. Internal Routes
          </h2>
          <div className="divide-y divide-white/8 border border-white/8 rounded-xl bg-[#12151E]">
            <div className="flex items-center justify-between px-4 py-3 text-xs">
              <span className="font-mono-tabular text-white">ferrox://speed-dial</span>
              <span className="text-slate-400">Workspace start page and bookmark tiles</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-xs">
              <span className="font-mono-tabular text-white">ferrox://rust-source</span>
              <span className="text-slate-400">Full Rust Cargo source viewer and .zip export</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-xs">
              <span className="font-mono-tabular text-white">ferrox://settings</span>
              <span className="text-slate-400">Theme accents, search engine, and reset tools</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-xs">
              <span className="font-mono-tabular text-white">ferrox://docs</span>
              <span className="text-slate-400">Architecture guide and keyboard shortcuts</span>
            </div>
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-white/8">
          <h2 className="font-display text-base font-semibold text-white">
            04. Keyboard Shortcuts & Link Controls
          </h2>
          <div className="divide-y divide-white/8 border border-white/8 rounded-xl bg-[#12151E]">
            {[
              ['Ctrl + T', 'Open a new tab'],
              ['Ctrl + W', 'Close current tab'],
              ['Ctrl + Shift + T', 'Reopen last closed tab'],
              ['Ctrl + Tab / Ctrl + Shift + Tab', 'Switch to next / previous tab'],
              ['Ctrl + L / Alt + D', 'Focus and select address bar'],
              ['Ctrl + R / F5', 'Reload active tab'],
              ['Alt + Left / Alt + Right', 'Navigate back / forward'],
              ['Ctrl + F', 'Find in page'],
              ['Ctrl + + / Ctrl + - / Ctrl + 0', 'Zoom in, zoom out, or reset to 100%'],
              ['F11', 'Toggle borderless fullscreen'],
              ['Ctrl + K', 'Quick tab search across workspaces'],
              ['Middle-Click / Ctrl + Click', 'Open link in a new background tab'],
            ].map(([keys, desc]) => (
              <div key={keys} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="font-mono-tabular text-white">{keys}</span>
                <span className="text-slate-400">{desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

