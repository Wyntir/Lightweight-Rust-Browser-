import { FormEvent, memo, useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Download,
  Layers,
  Plus,
  Search,
  Shield,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import { BookmarkItem, LimiterConfig } from '../lib/browserEngine';
import { isRustNativeShell } from '../lib/rustBridge';
import backdropImg from '../assets/images/speed_dial_backdrop_1795363253714.jpg';
import ferroxLogo from '../assets/images/ferrox_logo_icon.png';

interface SpeedDialViewProps {
  bookmarks: BookmarkItem[];
  limiter: LimiterConfig;
  totalRamMb: number;
  blockedTotal: number;
  detectedProfilesCount?: number;
  activeWorkspaceLabel?: string;
  workspaceTabCount?: number;
  onNavigate: (url: string) => void;
  onOpenBackgroundTab?: (url: string) => void;
  onHoverUrl?: (url: string | null) => void;
  onAddBookmark: (title: string, url: string) => void;
  onOpenLimiter: () => void;
  onOpenShield?: () => void;
  onQuickSync?: () => void;
}

const BACKDROP_URL = backdropImg;

const TILE_PALETTES = [
  { bg: 'rgba(250, 30, 78, 0.14)', border: 'rgba(250, 30, 78, 0.30)', text: '#FB7185' },
  { bg: 'rgba(56, 189, 248, 0.14)', border: 'rgba(56, 189, 248, 0.28)', text: '#7DD3FC' },
  { bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.28)', text: '#6EE7B7' },
  { bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.28)', text: '#FCD34D' },
  { bg: 'rgba(167, 139, 250, 0.14)', border: 'rgba(167, 139, 250, 0.28)', text: '#C4B5FD' },
];

function extractHost(rawUrl: string): string {
  if (rawUrl.startsWith('ferrox://')) return rawUrl;
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}

function getTileMonogram(title: string, host: string): string {
  const lowerHost = host.toLowerCase();
  if (lowerHost.includes('google.')) return 'G';
  if (lowerHost.includes('youtube.')) return 'YT';
  if (lowerHost.includes('wikipedia.')) return 'W';
  const clean = (title || host || 'FX').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function getTilePalette(seed: string) {
  const lower = seed.toLowerCase();
  if (lower.includes('google.')) {
    return { bg: 'rgba(59, 130, 246, 0.16)', border: 'rgba(96, 165, 250, 0.34)', text: '#93C5FD' };
  }
  if (lower.includes('youtube.')) {
    return { bg: 'rgba(239, 68, 68, 0.16)', border: 'rgba(248, 113, 113, 0.34)', text: '#FCA5A5' };
  }
  if (lower.includes('wikipedia.')) {
    return { bg: 'rgba(226, 232, 240, 0.12)', border: 'rgba(226, 232, 240, 0.26)', text: '#E2E8F0' };
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TILE_PALETTES[hash % TILE_PALETTES.length];
}

function formatClock(now: Date): { time: string; date: string } {
  return {
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

export const SpeedDialView = memo(function SpeedDialView({
  bookmarks,
  limiter,
  totalRamMb,
  blockedTotal,
  detectedProfilesCount = 0,
  activeWorkspaceLabel = 'Personal',
  workspaceTabCount = 0,
  onNavigate,
  onOpenBackgroundTab,
  onHoverUrl,
  onAddBookmark,
  onOpenLimiter,
  onOpenShield,
  onQuickSync,
}: SpeedDialViewProps) {
  const [query, setQuery] = useState('');
  const [addingTile, setAddingTile] = useState(false);
  const [tileTitle, setTileTitle] = useState('');
  const [tileUrl, setTileUrl] = useState('');
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onNavigate(query);
    setQuery('');
  };

  const handleAddTile = (e: FormEvent) => {
    e.preventDefault();
    if (!tileTitle.trim() || !tileUrl.trim()) return;
    onAddBookmark(tileTitle.trim(), tileUrl.trim());
    setTileTitle('');
    setTileUrl('');
    setAddingTile(false);
  };

  const ramPct =
    limiter.ramEnabled && limiter.ramLimitMb > 0
      ? Math.min(100, Math.round((totalRamMb / limiter.ramLimitMb) * 100))
      : 0;

  return (
    <div
      className="@container relative h-full overflow-y-auto fx-scroll"
      style={{ backgroundColor: 'var(--fx-bg)' }}
    >
      {/* Focused Browser Cockpit Header */}
      <div className="relative h-44 @md:h-48 w-full overflow-hidden border-b border-white/8 bg-[#0D1018]">
        {!backdropFailed && (
          <img
            src={BACKDROP_URL}
            alt="FerroX architectural obsidian surface"
            referrerPolicy="no-referrer"
            onError={() => setBackdropFailed(true)}
            className="w-full h-full object-cover opacity-40"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--fx-bg) 4%, color-mix(in srgb, var(--fx-bg) 72%, transparent) 55%, color-mix(in srgb, var(--fx-bg) 48%, transparent) 100%)',
          }}
          aria-hidden="true"
        />

        <div className="absolute inset-0 max-w-5xl mx-auto px-6 flex flex-col justify-between py-5">
          {/* Top bar: Brand + Workspace context + Clock */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {!logoFailed ? (
                <img
                  src={ferroxLogo}
                  alt="FerroX Browser emblem"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="w-7 h-7 rounded-lg shadow-md object-cover shrink-0 border border-white/10"
                />
              ) : (
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-display font-bold text-white shrink-0"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                  aria-hidden="true"
                >
                  FX
                </span>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display text-sm font-semibold tracking-tight text-white">
                  FerroX
                </span>
                <span className="text-white/20" aria-hidden="true">/</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 truncate">
                  <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span>{activeWorkspaceLabel}</span>
                  <span className="font-mono-tabular text-[11px] text-slate-500">
                    · {workspaceTabCount} {workspaceTabCount === 1 ? 'tab' : 'tabs'}
                  </span>
                </span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="font-mono-tabular text-sm font-semibold text-white leading-none">
                {clock.time}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">{clock.date}</div>
            </div>
          </div>

          {/* Precision Command Search Bar */}
          <form onSubmit={handleSearch} className="w-full max-w-2xl mx-auto">
            <label htmlFor="speed-dial-search" className="sr-only">
              Search the web or enter a URL
            </label>
            <div className="group flex items-center h-12 pl-4 pr-2 rounded-xl bg-[#0F131D]/92 backdrop-blur-md border border-white/14 focus-within:border-white/35 shadow-[0_12px_36px_rgba(0,0,0,0.45)] transition-colors">
              <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" aria-hidden="true" />
              <input
                id="speed-dial-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Google or enter a URL..."
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Go"
                className={`flex items-center justify-center h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  query.trim().length > 0
                    ? 'text-white'
                    : 'text-slate-400 bg-white/[0.06] hover:bg-white/12 hover:text-white'
                }`}
                style={query.trim().length > 0 ? { backgroundColor: 'var(--fx-accent)' } : undefined}
              >
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Speed Dial Tiles */}
        <section aria-labelledby="speed-dial-heading">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-baseline gap-2.5">
              <h1 id="speed-dial-heading" className="font-display text-base font-semibold text-white tracking-tight">
                Speed Dial
              </h1>
              <span className="font-mono-tabular text-[11px] text-slate-500">
                {Math.min(bookmarks.length, 12)} pinned
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAddingTile((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add Tile
            </button>
          </div>

          {addingTile && (
            <form
              onSubmit={handleAddTile}
              className="flex flex-wrap items-end gap-3 p-4 mb-5 rounded-xl bg-[#12151E] border border-white/12"
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
                  placeholder="GitHub"
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
                  placeholder="https://github.com"
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

          <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-3">
            {bookmarks.slice(0, 12).map((bm) => {
              const host = extractHost(bm.url);
              const isInternal = bm.url.startsWith('ferrox://');
              const palette = getTilePalette(host || bm.title);
              const monogram = getTileMonogram(bm.title, host);
              return (
                <button
                  key={bm.id}
                  type="button"
                  onClick={(e) => {
                    if ((e.ctrlKey || e.metaKey) && onOpenBackgroundTab) {
                      e.preventDefault();
                      onOpenBackgroundTab(bm.url);
                      return;
                    }
                    onNavigate(bm.url);
                  }}
                  onMouseDown={(e) => {
                    if (e.button === 1) e.preventDefault();
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1 && onOpenBackgroundTab) {
                      e.preventDefault();
                      onOpenBackgroundTab(bm.url);
                    }
                  }}
                  onMouseEnter={() => onHoverUrl?.(bm.url)}
                  onMouseLeave={() => onHoverUrl?.(null)}
                  className="fx-tile group flex items-center gap-3.5 p-3.5 rounded-xl border border-white/8 hover:border-white/20 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                  style={{ backgroundColor: 'var(--fx-panel)' }}
                >
                  <span
                    className="flex items-center justify-center w-10 h-10 rounded-lg border shrink-0 font-display text-xs font-bold tracking-wide"
                    style={
                      isInternal
                        ? {
                            backgroundColor: 'var(--fx-accent-soft)',
                            borderColor: 'color-mix(in srgb, var(--fx-accent) 35%, transparent)',
                            color: 'var(--fx-accent)',
                          }
                        : {
                            backgroundColor: palette.bg,
                            borderColor: palette.border,
                            color: palette.text,
                          }
                    }
                    aria-hidden="true"
                  >
                    {isInternal ? <Terminal className="w-4 h-4" /> : monogram}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{bm.title}</div>
                    <div className="font-mono-tabular text-[11px] text-slate-400 truncate mt-0.5">
                      {host}
                    </div>
                  </div>

                  <ArrowUpRight
                    className="w-4 h-4 text-slate-600 group-hover:text-slate-200 transition-colors shrink-0"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* Quiet Integrated Control Deck */}
        <section
          aria-label="Browser controls summary"
          className="grid grid-cols-1 @lg:grid-cols-3 gap-3 pt-5 border-t border-white/8"
        >
          <div
            className="p-4 rounded-xl border border-white/8 flex flex-col justify-between gap-3"
            style={{ backgroundColor: 'var(--fx-panel)' }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Cpu className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                  Resource Guard
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {limiter.ramEnabled ? `${limiter.ramLimitMb} MB cap` : 'Uncapped'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono-tabular text-xl font-semibold text-white">
                  {totalRamMb} MB
                </span>
                <span className="text-[11px] text-slate-500">
                  {limiter.autoHibernateEnabled
                    ? `Sleep tabs after ${limiter.autoHibernateMinutes}m`
                    : 'Auto-sleep off'}
                </span>
              </div>
              {limiter.ramEnabled && (
                <div className="h-1 w-full rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${ramPct}%`,
                      backgroundColor: ramPct > 85 ? '#FB7185' : 'var(--fx-accent)',
                    }}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenLimiter}
              className="self-start text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
            >
              Adjust Resource Limiter →
            </button>
          </div>

          <div
            className="p-4 rounded-xl border border-white/8 flex flex-col justify-between gap-3"
            style={{ backgroundColor: 'var(--fx-panel)' }}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  Universal Ad Shield
                </span>
                <span className="font-mono-tabular text-[11px] text-emerald-400">All Sites</span>
              </div>
              <div className="font-mono-tabular text-xl font-semibold text-white">
                {blockedTotal} blocked
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Blocks ads, popunders &amp; trackers across all sites plus non-stalling YouTube ad pruning.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {onOpenShield && (
                <button
                  type="button"
                  onClick={onOpenShield}
                  className="text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                >
                  Shield Controls →
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('ferrox://hub')}
                className="text-xs font-medium text-slate-400 hover:text-white transition-colors whitespace-nowrap"
              >
                Open Browser Manager
              </button>
            </div>
          </div>

          <div
            className="p-4 rounded-xl border border-white/8 flex flex-col justify-between gap-3"
            style={{ backgroundColor: 'var(--fx-panel)' }}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <RefreshCw className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                  Browser Profile Sync
                </span>
                {detectedProfilesCount > 0 && (
                  <span className="font-mono-tabular text-[11px] text-sky-300">
                    {detectedProfilesCount} ready
                  </span>
                )}
              </div>
              <div className="font-display text-base font-semibold text-white">
                {detectedProfilesCount > 0
                  ? `${detectedProfilesCount} Profile${detectedProfilesCount === 1 ? '' : 's'} Detected`
                  : 'All-Browser Importer'}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Import bookmarks, history &amp; logins from Chrome, Edge, Brave, Opera GX, Firefox &amp; Vivaldi.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => (onQuickSync ? onQuickSync() : onNavigate('ferrox://settings'))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/10 hover:bg-white/16 border border-white/12 transition-colors whitespace-nowrap"
              >
                {detectedProfilesCount > 0 ? 'Sync All Browsers' : 'Open Profile Sync'}
              </button>
              {!isRustNativeShell() && (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('ferrox://rust-source')}
                    className="text-xs font-medium text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                  >
                    Rust Source
                  </button>
                  <a
                    href="/api/rust-crate.zip"
                    download="ferrox-browser-rust.zip"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3 h-3" aria-hidden="true" />
                    .zip
                  </a>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});
