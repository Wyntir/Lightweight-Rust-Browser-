import { FormEvent, memo, RefObject, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Cpu,
  Download,
  EyeOff,
  Home,
  Languages,
  Lock,
  PanelTop,
  PictureInPicture2,
  Puzzle,
  RotateCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldOff,
  Star,
} from 'lucide-react';
import { PermissionValue, SitePermissions } from '../lib/browserEngine';
import { SitePermissionsPopover } from './SitePermissionsPopover';

interface AddressToolbarProps {
  currentUrl: string;
  isPrivateTab: boolean;
  canBack: boolean;
  canForward: boolean;
  isLoading: boolean;
  isBookmarked: boolean;
  showBookmarksBar: boolean;
  readerModeActive: boolean;
  translatedLang: string | null;
  pipActive: boolean;
  shieldEnabled: boolean;
  vpnEnabled: boolean;
  httpsOnly: boolean;
  upgradedFromHttp?: boolean;
  insecureHttp?: boolean;
  blockedCount: number;
  activeDownloadsCount: number;
  enabledExtensionsCount: number;
  totalRamMb: number;
  ramLimitMb: number;
  ramLimiterEnabled: boolean;
  sitePermissions: SitePermissions;
  onChangeSitePermission: (origin: string, key: keyof SitePermissions, val: PermissionValue) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onNavigate: (input: string) => void;
  onToggleBookmark: () => void;
  onToggleBookmarksBar: () => void;
  onToggleReaderMode: () => void;
  onTranslatePage: (targetLang: string | null) => void;
  onTogglePip: () => void;
  onOpenDownloads: () => void;
  onOpenExtensions: () => void;
  onOpenShield: () => void;
  onOpenLimiter: () => void;
  onPopoverOpenChange?: (open: boolean) => void;
  omniboxInputRef?: RefObject<HTMLInputElement | null>;
  zoomFactor?: number;
  onResetZoom?: () => void;
}

const TRANSLATE_LANGUAGES = ['Spanish', 'French', 'German', 'Japanese', 'Portuguese'];

export const AddressToolbar = memo(function AddressToolbar({
  currentUrl,
  isPrivateTab,
  canBack,
  canForward,
  isLoading,
  isBookmarked,
  showBookmarksBar,
  readerModeActive,
  translatedLang,
  pipActive,
  shieldEnabled,
  vpnEnabled,
  httpsOnly,
  upgradedFromHttp,
  insecureHttp,
  blockedCount,
  activeDownloadsCount,
  enabledExtensionsCount,
  totalRamMb,
  ramLimitMb,
  ramLimiterEnabled,
  sitePermissions,
  onChangeSitePermission,
  onBack,
  onForward,
  onReload,
  onHome,
  onNavigate,
  onToggleBookmark,
  onToggleBookmarksBar,
  onToggleReaderMode,
  onTranslatePage,
  onTogglePip,
  onOpenDownloads,
  onOpenExtensions,
  onOpenShield,
  onOpenLimiter,
  onPopoverOpenChange,
  omniboxInputRef,
  zoomFactor = 1,
  onResetZoom,
}: AddressToolbarProps) {
  const [draft, setDraft] = useState(
    currentUrl === 'ferrox://speed-dial' ? '' : currentUrl
  );
  const [permOpen, setPermOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);

  useEffect(() => {
    setDraft(currentUrl === 'ferrox://speed-dial' ? '' : currentUrl);
    setPermOpen(false);
    setTranslateOpen(false);
  }, [currentUrl]);

  useEffect(() => {
    onPopoverOpenChange?.(permOpen || translateOpen);
  }, [onPopoverOpenChange, permOpen, translateOpen]);

  useEffect(() => {
    if (!translateOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTranslateOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [translateOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const target = draft.trim() || 'ferrox://speed-dial';
    onNavigate(target);
  };

  const isInternal = currentUrl.startsWith('ferrox://');
  const isHttps = currentUrl.startsWith('https://');

  return (
    <div
      className="flex items-center gap-2 h-12 px-3 border-b border-white/8 relative z-20"
      style={{ backgroundColor: 'var(--fx-panel)' }}
    >
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack}
          aria-label="Back"
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onForward}
          disabled={!canForward}
          aria-label="Forward"
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onReload}
          aria-label="Reload page"
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-300 hover:bg-white/10 transition-colors"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onHome}
          aria-label="Speed Dial Home"
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-300 hover:bg-white/10 transition-colors"
        >
          <Home className="w-4 h-4" />
        </button>
      </div>

      {/* Omnibox + Site Permissions Popover */}
      <div className="relative flex-1 min-w-0">
        <form onSubmit={handleSubmit} className="w-full">
          <label htmlFor="ferrox-omnibox" className="sr-only">
            Address bar or search query
          </label>
          <div className="flex items-center gap-1.5 h-8.5 pl-2 pr-1.5 bg-[#0B0D12] border border-white/10 rounded-lg focus-within:border-white/30 transition-colors">
            <button
              type="button"
              onClick={() => setPermOpen((o) => !o)}
              aria-label="Site security and permissions"
              title="View HTTPS status & site permissions"
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-white/10 text-slate-400 shrink-0"
            >
              {isInternal ? (
                <Search className="w-3.5 h-3.5 text-slate-400" />
              ) : insecureHttp ? (
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Lock className={`w-3.5 h-3.5 ${isHttps ? 'text-emerald-400' : 'text-slate-500'}`} />
              )}
            </button>

            {isPrivateTab && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-medium shrink-0">
                <EyeOff className="w-3 h-3" aria-hidden="true" />
                Private
              </span>
            )}

            <input
              ref={omniboxInputRef}
              id="ferrox-omnibox"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Search the web or enter URL (e.g. rust-lang.org)"
              className="w-full bg-transparent text-xs md:text-sm font-mono-tabular text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />

            {Math.round(zoomFactor * 100) !== 100 && onResetZoom && (
              <button
                type="button"
                onClick={onResetZoom}
                aria-label="Reset page zoom to 100%"
                title="Click to reset zoom (Ctrl+0)"
                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/18 text-[10px] font-mono-tabular text-slate-200 shrink-0 transition-colors"
              >
                {Math.round(zoomFactor * 100)}%
              </button>
            )}

            {!isInternal && (
              <>
                <button
                  type="button"
                  onClick={onToggleReaderMode}
                  aria-label="Toggle Reader Mode"
                  title="Reader Mode"
                  className={`p-1 rounded transition-colors shrink-0 ${
                    readerModeActive
                      ? 'text-white bg-white/15'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                </button>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setTranslateOpen((o) => !o)}
                    aria-label="Translate page"
                    title="Translate page"
                    className={`p-1 rounded transition-colors ${
                      translatedLang
                        ? 'text-sky-400 bg-sky-500/15'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Languages className="w-3.5 h-3.5" />
                  </button>
                  {translateOpen && (
                    <div className="absolute right-0 top-8 z-40 w-44 rounded-lg bg-[#141824] border border-white/15 shadow-xl p-1.5 space-y-0.5">
                      <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">
                        Translate Page To
                      </div>
                      {TRANSLATE_LANGUAGES.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => {
                            onTranslatePage(lang);
                            setTranslateOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                            translatedLang === lang
                              ? 'bg-white/15 text-white font-medium'
                              : 'text-slate-300 hover:bg-white/8 hover:text-white'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                      {translatedLang && (
                        <button
                          type="button"
                          onClick={() => {
                            onTranslatePage(null);
                            setTranslateOpen(false);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded text-xs text-amber-300 hover:bg-white/8 border-t border-white/8 mt-1 pt-1.5"
                        >
                          Show Original
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
              className="p-1 text-slate-400 hover:text-amber-400 transition-colors shrink-0 rounded"
            >
              <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>

            <button
              type="submit"
              aria-label="Search or go to address"
              className="h-6 px-2.5 rounded text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
              style={{ backgroundColor: 'var(--fx-accent)' }}
            >
              Go
            </button>
          </div>
        </form>

        <SitePermissionsPopover
          open={permOpen}
          currentUrl={currentUrl}
          httpsOnly={httpsOnly}
          upgradedFromHttp={upgradedFromHttp}
          permissions={sitePermissions}
          onChangePermission={onChangeSitePermission}
          onClose={() => setPermOpen(false)}
        />
      </div>

      {/* Compact Right Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggleBookmarksBar}
          aria-label="Toggle Bookmarks Bar"
          title="Toggle Bookmarks Bar"
          className={`hidden md:flex items-center justify-center w-8 h-8 rounded-md border transition-colors ${
            showBookmarksBar
              ? 'bg-[#181C28] border-white/18 text-white'
              : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-white/8'
          }`}
        >
          <PanelTop className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onTogglePip}
          aria-label="Picture-in-Picture"
          title="Picture-in-Picture floating window"
          className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-md border transition-colors ${
            pipActive
              ? 'bg-[#181C28] border-white/25 text-white'
              : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-white/8'
          }`}
        >
          <PictureInPicture2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onOpenExtensions}
          aria-label="Extensions manager"
          title="Extensions"
          className="hidden sm:flex items-center gap-1 h-8 px-2 rounded-md bg-transparent hover:bg-white/8 text-xs text-slate-300 hover:text-white transition-colors"
        >
          <Puzzle className="w-3.5 h-3.5" aria-hidden="true" />
          {enabledExtensionsCount > 0 && (
            <span className="font-mono-tabular text-[11px]">{enabledExtensionsCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenDownloads}
          aria-label="Downloads manager"
          title="Downloads"
          className="flex items-center gap-1 h-8 px-2 rounded-md bg-transparent hover:bg-white/8 text-xs text-slate-300 hover:text-white transition-colors"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          {activeDownloadsCount > 0 && (
            <span className="font-mono-tabular text-[11px] text-emerald-400">
              {activeDownloadsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenShield}
          aria-label="Open Privacy and Shield"
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            shieldEnabled
              ? 'bg-[#181C28] border-white/12 text-slate-200 hover:border-white/25'
              : 'bg-transparent border-white/8 text-slate-500 hover:text-slate-300'
          }`}
          title={vpnEnabled ? 'Privacy, Shield & VPN Active' : 'Privacy & Ad Shield'}
        >
          {shieldEnabled ? (
            <Shield className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          ) : (
            <ShieldOff className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          )}
          <span className="font-mono-tabular">{blockedCount}</span>
          {vpnEnabled && <span className="text-[10px] text-sky-400 font-semibold">VPN</span>}
        </button>

        <button
          type="button"
          onClick={onOpenLimiter}
          aria-label="Open Resource Limiter and Site Isolation"
          className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-[#181C28] border border-white/12 hover:border-white/25 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <Cpu className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
          <span className="font-mono-tabular">
            {totalRamMb} MB{ramLimiterEnabled ? ` / ${ramLimitMb} MB` : ''}
          </span>
        </button>
      </div>
    </div>
  );
});
