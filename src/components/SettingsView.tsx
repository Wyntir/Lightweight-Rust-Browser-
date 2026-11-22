import {
  ACCENT_THEMES,
  AccentThemeId,
  BookmarkItem,
  HistoryItem,
  SEARCH_ENGINES,
  SearchEngineId,
  SURFACE_THEMES,
  SurfaceThemeId,
} from '../lib/browserEngine';
import { VaultCredential } from '../lib/vaultCrypto';
import { ProfileImporterPanel } from './ProfileImporterPanel';

interface SettingsViewProps {
  accent: AccentThemeId;
  customAccentHex: string;
  surfaceTheme: SurfaceThemeId;
  searchEngine: SearchEngineId;
  hardwareAcceleration: boolean;
  verticalTabs: boolean;
  showBookmarksBar: boolean;
  onChangeAccent: (accent: AccentThemeId) => void;
  onChangeCustomAccentHex: (hex: string) => void;
  onChangeSurfaceTheme: (surface: SurfaceThemeId) => void;
  onChangeSearchEngine: (engine: SearchEngineId) => void;
  onToggleHardwareAcceleration: () => void;
  onToggleVerticalTabs: () => void;
  onToggleBookmarksBar: () => void;
  onImportProfileData: (data: {
    bookmarks: BookmarkItem[];
    history: HistoryItem[];
    credentials: VaultCredential[];
  }) => void;
  onClearHistory: () => void;
  onResetDefaults: () => void;
}

export function SettingsView({
  accent,
  customAccentHex,
  surfaceTheme,
  searchEngine,
  hardwareAcceleration,
  verticalTabs,
  showBookmarksBar,
  onChangeAccent,
  onChangeCustomAccentHex,
  onChangeSurfaceTheme,
  onChangeSearchEngine,
  onToggleHardwareAcceleration,
  onToggleVerticalTabs,
  onToggleBookmarksBar,
  onImportProfileData,
  onClearHistory,
  onResetDefaults,
}: SettingsViewProps) {
  return (
    <div className="h-full overflow-y-auto px-6 py-8" style={{ backgroundColor: 'var(--fx-bg)' }}>
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="pb-4 border-b border-white/8">
          <h1 className="font-display text-2xl font-semibold text-white">Browser Settings</h1>
          <p className="text-xs text-slate-400 mt-1">
            Customize FerroX themes, hardware acceleration, search engine, and import profiles from Opera GX or Firefox.
          </p>
        </header>

        {/* Theme Customization */}
        <section className="space-y-4 pb-6 border-b border-white/8">
          <div>
            <h2 className="font-display text-base font-semibold text-white">Theme Studio</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose a surface backdrop, preset accent, or any custom hex accent color.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">Surface Palette</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {(Object.keys(SURFACE_THEMES) as SurfaceThemeId[]).map((id) => {
                const s = SURFACE_THEMES[id];
                const selected = surfaceTheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChangeSurfaceTheme(id)}
                    aria-pressed={selected}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'border-white/35 text-white'
                        : 'border-white/8 text-slate-300 hover:border-white/20'
                    }`}
                    style={{ backgroundColor: s.panelHex }}
                  >
                    <span
                      className="w-4 h-4 rounded-sm border border-white/15 shrink-0"
                      style={{ backgroundColor: s.bgHex }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="text-xs font-medium text-slate-300">Accent Color</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {(Object.keys(ACCENT_THEMES) as Array<Exclude<AccentThemeId, 'custom'>>).map((id) => {
                const theme = ACCENT_THEMES[id];
                const selected = accent === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChangeAccent(id)}
                    aria-pressed={selected}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'bg-[#161B26] border-white/30 text-white'
                        : 'bg-[#12151E] border-white/8 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-sm shrink-0"
                      style={{ backgroundColor: theme.hex }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium whitespace-nowrap">{theme.name}</span>
                  </button>
                );
              })}

              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                  accent === 'custom'
                    ? 'bg-[#161B26] border-white/30 text-white'
                    : 'bg-[#12151E] border-white/8 text-slate-300 hover:border-white/20'
                }`}
              >
                <input
                  type="color"
                  aria-label="Custom accent hex color"
                  value={customAccentHex}
                  onChange={(e) => {
                    onChangeCustomAccentHex(e.target.value);
                    onChangeAccent('custom');
                  }}
                  className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer p-0 shrink-0"
                />
                <span className="text-xs font-medium whitespace-nowrap">Custom</span>
              </label>
            </div>
          </div>
        </section>

        {/* System & Hardware Acceleration */}
        <section className="space-y-3 pb-6 border-b border-white/8">
          <h2 className="font-display text-base font-semibold text-white">Performance &amp; Layout</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label
              className="flex items-center justify-between p-3.5 rounded-xl border border-white/8 text-xs text-slate-200 cursor-pointer"
              style={{ backgroundColor: 'var(--fx-panel)' }}
            >
              <span>Hardware Acceleration</span>
              <input
                type="checkbox"
                checked={hardwareAcceleration}
                onChange={onToggleHardwareAcceleration}
                className="w-4 h-4"
                style={{ accentColor: 'var(--fx-accent)' }}
              />
            </label>
            <label
              className="flex items-center justify-between p-3.5 rounded-xl border border-white/8 text-xs text-slate-200 cursor-pointer"
              style={{ backgroundColor: 'var(--fx-panel)' }}
            >
              <span>Vertical Tabs Sidebar</span>
              <input
                type="checkbox"
                checked={verticalTabs}
                onChange={onToggleVerticalTabs}
                className="w-4 h-4"
                style={{ accentColor: 'var(--fx-accent)' }}
              />
            </label>
            <label
              className="flex items-center justify-between p-3.5 rounded-xl border border-white/8 text-xs text-slate-200 cursor-pointer"
              style={{ backgroundColor: 'var(--fx-panel)' }}
            >
              <span>Show Bookmarks Bar</span>
              <input
                type="checkbox"
                checked={showBookmarksBar}
                onChange={onToggleBookmarksBar}
                className="w-4 h-4"
                style={{ accentColor: 'var(--fx-accent)' }}
              />
            </label>
          </div>
        </section>

        {/* Import Opera GX & Mozilla Firefox */}
        <section className="pb-6 border-b border-white/8">
          <ProfileImporterPanel onImportProfileData={onImportProfileData} />
        </section>

        {/* Search Engine */}
        <section className="space-y-3 pb-6 border-b border-white/8">
          <label htmlFor="search-engine-select" className="block font-display text-base font-semibold text-white">
            Omnibox Search Engine
          </label>
          <p className="text-xs text-slate-400">
            Used when typing plain search terms instead of a domain or ferrox:// route.
          </p>
          <select
            id="search-engine-select"
            value={searchEngine}
            onChange={(e) => onChangeSearchEngine(e.target.value as SearchEngineId)}
            className="h-9 px-3 rounded-lg bg-[#12151E] border border-white/12 text-xs text-white focus:outline-none focus:border-white/30"
          >
            {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => (
              <option key={id} value={id}>
                {SEARCH_ENGINES[id].label}
              </option>
            ))}
          </select>
        </section>

        {/* Storage Controls */}
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">Privacy &amp; Reset</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Clear local browsing history or restore default bookmarks and resource caps.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClearHistory}
              className="px-4 py-2 rounded-lg bg-[#12151E] hover:bg-[#1A202E] border border-white/10 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              Clear History
            </button>
            <button
              type="button"
              onClick={onResetDefaults}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
              style={{ backgroundColor: 'var(--fx-accent)' }}
            >
              Reset Defaults
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
