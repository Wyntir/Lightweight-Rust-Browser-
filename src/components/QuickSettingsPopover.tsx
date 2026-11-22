import { Cpu, Download, Palette, Settings, X } from 'lucide-react';
import {
  ACCENT_THEMES,
  AccentThemeId,
  SURFACE_THEMES,
  SurfaceThemeId,
} from '../lib/browserEngine';

interface QuickSettingsPopoverProps {
  open: boolean;
  accent: AccentThemeId;
  customAccentHex: string;
  surfaceTheme: SurfaceThemeId;
  hardwareAcceleration: boolean;
  verticalTabs: boolean;
  showBookmarksBar: boolean;
  onClose: () => void;
  onChangeAccent: (accent: AccentThemeId) => void;
  onChangeCustomAccentHex: (hex: string) => void;
  onChangeSurfaceTheme: (surface: SurfaceThemeId) => void;
  onToggleHardwareAcceleration: () => void;
  onToggleVerticalTabs: () => void;
  onToggleBookmarksBar: () => void;
  onOpenFullSettings: () => void;
}

export function QuickSettingsPopover({
  open,
  accent,
  customAccentHex,
  surfaceTheme,
  hardwareAcceleration,
  verticalTabs,
  showBookmarksBar,
  onClose,
  onChangeAccent,
  onChangeCustomAccentHex,
  onChangeSurfaceTheme,
  onToggleHardwareAcceleration,
  onToggleVerticalTabs,
  onToggleBookmarksBar,
  onOpenFullSettings,
}: QuickSettingsPopoverProps) {
  if (!open) return null;

  return (
    <div
      className="fx-pop-in fixed right-3 top-12 z-50 w-80 rounded-xl border border-white/15 shadow-2xl p-4 space-y-4"
      style={{ backgroundColor: 'var(--fx-panel)' }}
      role="dialog"
      aria-label="Quick browser settings"
    >
      <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Settings className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
          <span>Quick Settings</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick settings"
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hardware Acceleration */}
      <div className="p-3 rounded-lg bg-black/25 border border-white/10 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="quick-hw-accel"
            className="flex items-center gap-2 text-xs font-medium text-white cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
            Hardware Acceleration
          </label>
          <button
            id="quick-hw-accel"
            type="button"
            role="switch"
            aria-checked={hardwareAcceleration}
            onClick={onToggleHardwareAcceleration}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              hardwareAcceleration ? '' : 'bg-white/15'
            }`}
            style={hardwareAcceleration ? { backgroundColor: 'var(--fx-accent)' } : undefined}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                hardwareAcceleration ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          {hardwareAcceleration
            ? 'GPU compositing active (--enable-gpu in Rust WebView2).'
            : 'Software rendering (--disable-gpu). Saves battery / fixes driver artifacts.'}
        </p>
      </div>

      {/* Theme Customization */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Palette className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
          <span>Theme & Accent</span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {(Object.keys(SURFACE_THEMES) as SurfaceThemeId[]).map((id) => {
            const s = SURFACE_THEMES[id];
            const selected = surfaceTheme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeSurfaceTheme(id)}
                title={s.name}
                aria-label={`Surface theme ${s.name}`}
                aria-pressed={selected}
                className={`h-7 rounded-md border flex items-center justify-center transition-all ${
                  selected ? 'border-white ring-1 ring-white/40' : 'border-white/15 hover:border-white/35'
                }`}
                style={{ backgroundColor: s.panelHex }}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.bgHex }} />
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            {(Object.keys(ACCENT_THEMES) as Array<Exclude<AccentThemeId, 'custom'>>).map((id) => {
              const t = ACCENT_THEMES[id];
              const selected = accent === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeAccent(id)}
                  title={t.name}
                  aria-label={`Accent ${t.name}`}
                  aria-pressed={selected}
                  className={`w-6 h-6 rounded-md border transition-transform ${
                    selected ? 'border-white scale-105' : 'border-white/15 hover:scale-105'
                  }`}
                  style={{ backgroundColor: t.hex }}
                />
              );
            })}
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
            <span>Custom</span>
            <input
              type="color"
              aria-label="Pick custom accent color"
              value={customAccentHex}
              onChange={(e) => {
                onChangeCustomAccentHex(e.target.value);
                onChangeAccent('custom');
              }}
              className="w-6 h-6 rounded border border-white/20 bg-transparent cursor-pointer p-0"
            />
          </label>
        </div>
      </div>

      {/* Layout Quick Toggles */}
      <div className="space-y-1.5 pt-2 border-t border-white/10 text-xs">
        <label className="flex items-center justify-between text-slate-200 cursor-pointer py-0.5">
          <span>Vertical Tabs</span>
          <input
            type="checkbox"
            checked={verticalTabs}
            onChange={onToggleVerticalTabs}
            className="w-4 h-4"
            style={{ accentColor: 'var(--fx-accent)' }}
          />
        </label>
        <label className="flex items-center justify-between text-slate-200 cursor-pointer py-0.5">
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

      <button
        type="button"
        onClick={() => {
          onOpenFullSettings();
          onClose();
        }}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-medium text-white transition-colors"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        All Settings &amp; Profile Import
      </button>
    </div>
  );
}
