import { FormEvent, useState } from 'react';
import {
  ArrowUpRight,
  Cpu,
  Download,
  Globe,
  Plus,
  Search,
  Shield,
  Terminal,
} from 'lucide-react';
import { BookmarkItem, LimiterConfig } from '../lib/browserEngine';
import { isRustNativeShell } from '../lib/rustBridge';
import backdropImg from '../assets/images/speed_dial_backdrop_1795363253714.jpg';

interface SpeedDialViewProps {
  bookmarks: BookmarkItem[];
  limiter: LimiterConfig;
  totalRamMb: number;
  blockedTotal: number;
  onNavigate: (url: string) => void;
  onAddBookmark: (title: string, url: string) => void;
  onOpenLimiter: () => void;
}

const BACKDROP_URL = backdropImg;

export function SpeedDialView({
  bookmarks,
  limiter,
  totalRamMb,
  blockedTotal,
  onNavigate,
  onAddBookmark,
  onOpenLimiter,
}: SpeedDialViewProps) {
  const [query, setQuery] = useState('');
  const [addingTile, setAddingTile] = useState(false);
  const [tileTitle, setTileTitle] = useState('');
  const [tileUrl, setTileUrl] = useState('');
  const [backdropFailed, setBackdropFailed] = useState(false);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onNavigate(query);
  };

  const handleAddTile = (e: FormEvent) => {
    e.preventDefault();
    if (!tileTitle.trim() || !tileUrl.trim()) return;
    onAddBookmark(tileTitle.trim(), tileUrl.trim());
    setTileTitle('');
    setTileUrl('');
    setAddingTile(false);
  };

  return (
    <div
      className="@container relative h-full overflow-y-auto"
      style={{ backgroundColor: 'var(--fx-bg)' }}
    >
      {/* Architectural backdrop */}
      <div className="relative h-52 @md:h-56 w-full overflow-hidden border-b border-white/8 bg-[#10131C]">
        {!backdropFailed && (
          <img
            src={BACKDROP_URL}
            alt="FerroX architectural obsidian surface"
            referrerPolicy="no-referrer"
            onError={() => setBackdropFailed(true)}
            className="w-full h-full object-cover opacity-55"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--fx-bg), color-mix(in srgb, var(--fx-bg) 65%, transparent), color-mix(in srgb, var(--fx-bg) 35%, transparent))',
          }}
          aria-hidden="true"
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-xs font-medium text-slate-300 tracking-wide mb-1.5">
            FerroX Browser · Rust WebView Core
          </p>
          <h1 className="font-display text-2xl @md:text-4xl font-semibold text-white tracking-tight max-w-xl [text-wrap:balance]">
            Lightweight browsing with bounded memory and speed.
          </h1>

          <form onSubmit={handleSearch} className="w-full max-w-xl mt-4">
            <label htmlFor="speed-dial-search" className="sr-only">
              Search the web or enter a URL
            </label>
            <div className="flex items-center h-11 px-4 rounded-xl bg-[#12151E]/95 border border-white/15 focus-within:border-white/35 shadow-lg">
              <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" aria-hidden="true" />
              <input
                id="speed-dial-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search DuckDuckGo or enter https://..."
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                className="ml-2 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                style={{ backgroundColor: 'var(--fx-accent)' }}
              >
                Go
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-7">
        {/* Speed Dial Tiles */}
        <section aria-labelledby="speed-dial-heading">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <h2 id="speed-dial-heading" className="font-display text-lg font-semibold text-white">
                Speed Dial
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Quick-launch sites and internal FerroX views
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddingTile((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B26] hover:bg-[#1E2433] border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add Tile
            </button>
          </div>

          {addingTile && (
            <form
              onSubmit={handleAddTile}
              className="flex flex-wrap items-end gap-3 p-4 mb-5 rounded-xl bg-[#12151E] border border-white/10"
            >
              <div className="flex-1 min-w-[160px]">
                <label htmlFor="tile-title" className="block text-xs text-slate-400 mb-1">
                  Title
                </label>
                <input
                  id="tile-title"
                  type="text"
                  required
                  value={tileTitle}
                  onChange={(e) => setTileTitle(e.target.value)}
                  placeholder="Crates.io"
                  className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <div className="flex-[2] min-w-[220px]">
                <label htmlFor="tile-url" className="block text-xs text-slate-400 mb-1">
                  URL
                </label>
                <input
                  id="tile-url"
                  type="text"
                  required
                  value={tileUrl}
                  onChange={(e) => setTileUrl(e.target.value)}
                  placeholder="https://crates.io"
                  className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-sm font-mono-tabular text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                >
                  Save Tile
                </button>
                <button
                  type="button"
                  onClick={() => setAddingTile(false)}
                  className="h-9 px-3 rounded-lg bg-white/6 hover:bg-white/10 text-xs text-slate-300 whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-3.5">
            {bookmarks.slice(0, 6).map((bm) => (
              <button
                key={bm.id}
                type="button"
                onClick={() => onNavigate(bm.url)}
                className="group flex flex-col justify-between p-4 h-24 rounded-xl border border-white/8 hover:border-white/20 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                style={{ backgroundColor: 'var(--fx-panel)' }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0B0D12] border border-white/8 text-slate-300">
                    {bm.url.startsWith('ferrox://') ? (
                      <Terminal className="w-4 h-4" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                    ) : (
                      <Globe className="w-4 h-4" aria-hidden="true" />
                    )}
                  </span>
                  <ArrowUpRight
                    className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-white truncate">{bm.title}</div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{bm.category}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* System Budget & Rust Desktop Crate Summary */}
        <section className="grid grid-cols-1 @lg:grid-cols-3 gap-4 pt-6 border-t border-white/8">
          <div
            className="p-5 rounded-xl border border-white/8 flex flex-col justify-between gap-4"
            style={{ backgroundColor: 'var(--fx-panel)' }}
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Cpu className="w-4 h-4" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                Memory & Site Isolation
              </div>
              <div className="font-mono-tabular text-2xl font-semibold text-white mt-2">
                {totalRamMb} MB
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {limiter.ramEnabled
                  ? `Auto-hibernate cap at ${limiter.ramLimitMb} MB`
                  : 'RAM cap currently paused'}
                {' · '}
                {limiter.netEnabled ? `Proxy capped at ${limiter.netLimitKbps} KB/s` : 'Unlimited bandwidth'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenLimiter}
              className="self-start text-xs font-medium text-white hover:underline whitespace-nowrap"
            >
              Adjust Resource Limiter
            </button>
          </div>

          <div
            className="p-5 rounded-xl border border-white/8 flex flex-col justify-between gap-4"
            style={{ backgroundColor: 'var(--fx-panel)' }}
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Shield className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                Privacy & Safe Browsing
              </div>
              <div className="font-mono-tabular text-2xl font-semibold text-white mt-2">
                {blockedTotal} blocked
              </div>
              <p className="text-xs text-slate-400 mt-1">
                HTTPS enforcement, Safe Browsing checks, DoH, and anti-fingerprinting enabled.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ferrox://hub')}
              className="self-start text-xs font-medium text-white hover:underline whitespace-nowrap"
            >
              Open Browser Manager
            </button>
          </div>

          <div
            className="p-5 rounded-xl border border-white/8 flex flex-col justify-between gap-4"
            style={{ backgroundColor: 'var(--fx-panel)' }}
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Terminal className="w-4 h-4" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                Native Rust Desktop Crate
              </div>
              <div className="font-display text-lg font-semibold text-white mt-2">
                wry + tao + sysinfo
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Inspect all Cargo modules or export the full Rust source archive to build natively.
              </p>
            </div>
            {isRustNativeShell() ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('ferrox://settings')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                >
                  Themes &amp; Profile Import
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('ferrox://docs')}
                  className="text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap"
                >
                  Shortcuts
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('ferrox://rust-source')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                >
                  Explore Rust Source
                </button>
                <a
                  href="/api/rust-crate.zip"
                  download="ferrox-browser-rust.zip"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  .zip
                </a>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
