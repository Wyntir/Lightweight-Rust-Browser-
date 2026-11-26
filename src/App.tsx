import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download as DownloadIcon, ExternalLink, FolderOpen, X } from 'lucide-react';
import {
  ACCENT_THEMES,
  AccentThemeId,
  BlockedEvent,
  BookmarkItem,
  BrowserExtension,
  canGoBack,
  canGoForward,
  clampZoomFactor,
  createTab,
  DEFAULT_BOOKMARKS,
  DEFAULT_EXTENSIONS,
  DEFAULT_LIMITER_CONFIG,
  DEFAULT_PRIVACY_CONFIG,
  DEFAULT_SITE_PERMISSIONS,
  DEFAULT_TRACKER_RULES,
  deriveTitleFromUrl,
  detectUserGeoFromTimezone,
  DownloadItem,
  duplicateTab,
  evaluateResourceBudget,
  evaluateUrlSecurity,
  findIdleTabsToHibernate,
  getNextTabId,
  getOriginFromUrl,
  getTabsToRight,
  getVpnServersWithLocationPing,
  hexToRgbaSoft,
  HistoryItem,
  LimiterConfig,
  mergeDefaultTrackerRules,
  migrateLegacyBookmarks,
  normalizeAddressInput,
  PermissionValue,
  PersistedSessionTab,
  PrivacySecurityConfig,
  reorderTabs,
  restoreSessionTabs,
  scanDownloadFilename,
  SearchEngineId,
  serializeSessionTabs,
  shouldBlockUrl,
  SitePermissions,
  stepBack,
  stepForward,
  SURFACE_THEMES,
  SurfaceThemeId,
  Tab,
  TabGroup,
  TabGroupColor,
  tabHistoryNavigate,
  WORKSPACES,
  WorkspaceId,
} from './lib/browserEngine';
import { EncryptedVaultPayload, VaultCredential } from './lib/vaultCrypto';
import { DetachDropPoint, TabStrip, VerticalTabRail } from './components/TabStrip';
import { AddressToolbar } from './components/AddressToolbar';
import { BookmarksBar } from './components/BookmarksBar';
import { FindInPageBar } from './components/FindInPageBar';
import { BrowserSidebar, DrawerTab } from './components/BrowserSidebar';
import { Drawers } from './components/Drawers';
import { SpeedDialView } from './components/SpeedDialView';
import { RustSourceView } from './components/RustSourceView';
import { LoadedPageData, TranslationData, WebViewport } from './components/WebViewport';
import { SettingsView } from './components/SettingsView';
import { DocsView } from './components/DocsView';
import { BrowserHubView, HubSection } from './components/BrowserHubView';
import { TabSearchModal } from './components/TabSearchModal';
import { PipWindow } from './components/PipWindow';
import { DetachedWindow, DetachedWindowState } from './components/DetachedWindow';
import { QuickSettingsPopover } from './components/QuickSettingsPopover';
import {
  BrowserShortcutCommand,
  DetectedBrowserProfile,
  isRustNativeShell,
  NativeProfileImportResult,
  requestRustDetectProfiles,
  requestRustImportProfile,
  rustActivateTab,
  rustCloseTab,
  rustDetachTabWindow,
  rustHibernateTab,
  rustNavigateTab,
  rustOpenDownloadFile,
  rustOpenNewWindow,
  rustShowDownloadInFolder,
  RustSyncPayload,
  rustTabBack,
  rustTabFind,
  rustTabFindClear,
  rustTabForward,
  rustTabMute,
  rustTabReload,
  rustTabZoom,
  rustToggleFullscreen,
  rustTrimMemory,
  sendToRust,
  syncRustAutoSync,
  syncRustLimiter,
  syncRustSearchEngine,
  syncRustShield,
  syncRustTheme,
} from './lib/rustBridge';
import { SyncProfileReceiptItem, SyncSummary } from './components/ProfileImporterPanel';

const STORAGE_KEY = 'ferrox_browser_state_v2';
const VAULT_STORAGE_KEY = 'ferrox_encrypted_vault_v1';

interface PersistedState {
  accent: AccentThemeId;
  customAccentHex: string;
  surfaceTheme: SurfaceThemeId;
  searchEngine: SearchEngineId;
  limiter: LimiterConfig;
  shieldEnabled: boolean;
  trackerRules: string[];
  bookmarks: BookmarkItem[];
  history: HistoryItem[];
  showBookmarksBar: boolean;
  verticalTabs: boolean;
  autoSyncBrowsers: boolean;
  privacyConfig: PrivacySecurityConfig;
  sitePermissionsMap: Record<string, SitePermissions>;
  extensions: BrowserExtension[];
  sessionTabs?: PersistedSessionTab[];
  tabGroups?: TabGroup[];
  activeWorkspace?: WorkspaceId;
  activeTabId?: string;
}

function loadPersistedState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedState>) : {};
  } catch {
    return {};
  }
}

function loadEncryptedVault(): EncryptedVaultPayload | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EncryptedVaultPayload) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const initialSaved = useMemo(() => loadPersistedState(), []);

  const [accent, setAccent] = useState<AccentThemeId>(initialSaved.accent ?? 'crimson');
  const [customAccentHex, setCustomAccentHex] = useState<string>(
    initialSaved.customAccentHex ?? '#FA1E4E'
  );
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceThemeId>(
    initialSaved.surfaceTheme ?? 'obsidian'
  );
  const [searchEngine, setSearchEngine] = useState<SearchEngineId>(
    initialSaved.searchEngine ?? 'google'
  );
  const [limiter, setLimiter] = useState<LimiterConfig>(() => ({
    ...DEFAULT_LIMITER_CONFIG,
    ...(initialSaved.limiter ?? {}),
  }));
  const [shieldEnabled, setShieldEnabled] = useState<boolean>(
    initialSaved.shieldEnabled ?? true
  );
  const [trackerRules, setTrackerRules] = useState<string[]>(() =>
    mergeDefaultTrackerRules(initialSaved.trackerRules)
  );
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() =>
    migrateLegacyBookmarks(initialSaved.bookmarks)
  );
  const [history, setHistory] = useState<HistoryItem[]>(initialSaved.history ?? []);
  const [blockedEvents, setBlockedEvents] = useState<BlockedEvent[]>([]);

  const [showBookmarksBar, setShowBookmarksBar] = useState<boolean>(
    initialSaved.showBookmarksBar ?? true
  );
  const [verticalTabs, setVerticalTabs] = useState<boolean>(
    initialSaved.verticalTabs ?? false
  );
  const [privacyConfig, setPrivacyConfig] = useState<PrivacySecurityConfig>(() => ({
    ...DEFAULT_PRIVACY_CONFIG,
    ...(initialSaved.privacyConfig ?? {}),
  }));
  const [sitePermissionsMap, setSitePermissionsMap] = useState<Record<string, SitePermissions>>(
    initialSaved.sitePermissionsMap ?? {}
  );
  const [extensions, setExtensions] = useState<BrowserExtension[]>(
    initialSaved.extensions ?? DEFAULT_EXTENSIONS
  );
  const [encryptedVault, setEncryptedVault] = useState<EncryptedVaultPayload | null>(() =>
    loadEncryptedVault()
  );

  const [downloads, setDownloads] = useState<DownloadItem[]>([
    {
      id: 'dl-seed-1',
      filename: 'ferrox-browser-rust.zip',
      url: '/api/rust-crate.zip',
      bytesReceived: 102400,
      totalBytes: 102400,
      status: 'completed',
      warning: null,
      startedAt: Date.now() - 120000,
    },
  ]);

  const restoredSession = useMemo(() => {
    const parsedTabs = restoreSessionTabs(initialSaved.sessionTabs);
    const tabsList =
      parsedTabs.length > 0 ? parsedTabs : [createTab('tab-1', 'personal', 'ferrox://speed-dial')];
    const ws: WorkspaceId =
      initialSaved.activeWorkspace === 'work' ||
      initialSaved.activeWorkspace === 'gaming' ||
      initialSaved.activeWorkspace === 'development' ||
      initialSaved.activeWorkspace === 'personal'
        ? initialSaved.activeWorkspace
        : tabsList[0].workspace;
    const matchedActive =
      tabsList.find((t) => t.id === initialSaved.activeTabId) ??
      tabsList.find((t) => t.workspace === ws) ??
      tabsList[0];
    let maxNumeric = 1;
    for (const t of tabsList) {
      const m = t.id.match(/^tab-(\d+)$/);
      if (m) {
        maxNumeric = Math.max(maxNumeric, Number(m[1]));
      }
    }
    return {
      tabs: tabsList,
      workspace: matchedActive.workspace,
      activeTabId: matchedActive.id,
      nextCounter: maxNumeric + 1,
    };
  }, [initialSaved]);

  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(restoredSession.workspace);
  const [tabs, setTabs] = useState<Tab[]>(restoredSession.tabs);
  const [tabGroups, setTabGroups] = useState<TabGroup[]>(initialSaved.tabGroups ?? []);
  const [activeTabId, setActiveTabId] = useState<string>(restoredSession.activeTabId);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<DrawerTab>(null);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [toolbarPopoverOpen, setToolbarPopoverOpen] = useState(false);
  const [tabContextMenuOpen, setTabContextMenuOpen] = useState(false);
  const [tabDragOverlayOpen, setTabDragOverlayOpen] = useState(false);
  const [detachedWindows, setDetachedWindows] = useState<DetachedWindowState[]>([]);
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const [closedTabsCount, setClosedTabsCount] = useState(0);
  const [pendingImportedCredentials, setPendingImportedCredentials] = useState<VaultCredential[]>([]);
  const [tabSearchOpen, setTabSearchOpen] = useState(false);
  const [hubInitialSection, setHubInitialSection] = useState<HubSection>('bookmarks');

  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findSignal, setFindSignal] = useState<{
    tabId: string;
    seq: number;
    query: string;
    backwards: boolean;
  } | null>(null);
  const [tabZooms, setTabZooms] = useState<Record<string, number>>({});
  const [downloadShelfId, setDownloadShelfId] = useState<string | null>(null);

  const [readerModeTabs, setReaderModeTabs] = useState<Record<string, boolean>>({});
  const [translatedTabs, setTranslatedTabs] = useState<Record<string, TranslationData | null>>({});
  const [pipTabId, setPipTabId] = useState<string | null>(null);
  const [autofillSignal, setAutofillSignal] = useState<{
    tabId: string;
    seq: number;
    username: string;
    password: string;
  } | null>(null);

  const [pageCache, setPageCache] = useState<Record<string, LoadedPageData>>({});
  const [loadingTabs, setLoadingTabs] = useState<Record<string, boolean>>({});
  const [errorTabs, setErrorTabs] = useState<Record<string, string | null>>({});

  const [autoSyncBrowsers, setAutoSyncBrowsers] = useState<boolean>(
    initialSaved.autoSyncBrowsers ?? true
  );
  const [detectedProfiles, setDetectedProfiles] = useState<DetectedBrowserProfile[]>([]);
  const [syncingProfileId, setSyncingProfileId] = useState<string | null>(null);
  const [rescanningProfiles, setRescanningProfiles] = useState<boolean>(false);
  const [syncedProfileIds, setSyncedProfileIds] = useState<string[]>([]);
  const [lastSyncSummary, setLastSyncSummary] = useState<SyncSummary | null>(null);
  const [lastTrimNotice, setLastTrimNotice] = useState<string | null>(null);
  const userGeo = useMemo(() => detectUserGeoFromTimezone(), []);
  const [vpnJitterMap, setVpnJitterMap] = useState<Record<string, number>>({});
  const [vpnPinging, setVpnPinging] = useState(false);

  const [rustTelemetry, setRustTelemetry] = useState<{
    ramMb: number;
    cpuPercent: number;
    processCount?: number;
  } | null>(null);

  const tabCounterRef = useRef(restoredSession.nextCounter);
  const detachedCounterRef = useRef(1);
  const detachedZRef = useRef(42);
  const autofillCounterRef = useRef(1);
  const findCounterRef = useRef(1);
  const closedTabsRef = useRef<Tab[]>([]);
  const urlResponseCacheRef = useRef<Map<string, LoadedPageData>>(new Map());
  const mainViewportRef = useRef<HTMLElement>(null);
  const omniboxInputRef = useRef<HTMLInputElement | null>(null);
  const rustInitializedRef = useRef(false);
  const lastLayoutKeyRef = useRef<string>('');
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;
  const historyRef = useRef(history);
  historyRef.current = history;
  const pageCacheRef = useRef(pageCache);
  pageCacheRef.current = pageCache;
  const openTabFromNativeRef = useRef<(url: string, background: boolean) => void>(() => {});
  const executeShortcutRef = useRef<(cmd: BrowserShortcutCommand) => void>(() => {});

  // Sync theme CSS variables (surface palette + accent/custom hex)
  useEffect(() => {
    const resolvedHex =
      accent === 'custom'
        ? customAccentHex
        : (ACCENT_THEMES[accent] ?? ACCENT_THEMES.crimson).hex;
    const resolvedSoft =
      accent === 'custom'
        ? hexToRgbaSoft(customAccentHex, 0.14)
        : (ACCENT_THEMES[accent] ?? ACCENT_THEMES.crimson).softBg;
    const surface = SURFACE_THEMES[surfaceTheme] ?? SURFACE_THEMES.obsidian;
    const root = document.documentElement.style;
    root.setProperty('--fx-accent', resolvedHex);
    root.setProperty('--fx-accent-soft', resolvedSoft);
    root.setProperty('--fx-bg', surface.bgHex);
    root.setProperty('--fx-chrome', surface.chromeHex);
    root.setProperty('--fx-panel', surface.panelHex);
    root.setProperty('--fx-card', surface.cardHex);
  }, [accent, customAccentHex, surfaceTheme]);

  // Global desktop browser keyboard shortcuts (also mirrored from live WebView2 pages via __ferroxShortcut)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      let cmd: BrowserShortcutCommand | null = null;

      if (e.key === 'F11') {
        cmd = 'toggle_fullscreen';
      } else if (e.key === 'F5' || (mod && !e.altKey && key === 'r')) {
        cmd = 'reload';
      } else if (e.altKey && !mod && e.key === 'ArrowLeft') {
        cmd = 'back';
      } else if (e.altKey && !mod && e.key === 'ArrowRight') {
        cmd = 'forward';
      } else if (e.altKey && !mod && key === 'd') {
        cmd = 'focus_omnibox';
      } else if (mod && !e.altKey) {
        if (key === 't' && e.shiftKey) cmd = 'reopen_tab';
        else if (key === 't' && !e.shiftKey) cmd = 'new_tab';
        else if (key === 'n' && e.shiftKey) cmd = 'new_private_tab';
        else if (key === 'n' && !e.shiftKey) cmd = 'new_window';
        else if (key === 'w' && !e.shiftKey) cmd = 'close_tab';
        else if (e.key === 'Tab' && e.shiftKey) cmd = 'prev_tab';
        else if (e.key === 'Tab' && !e.shiftKey) cmd = 'next_tab';
        else if (key === 'l') cmd = 'focus_omnibox';
        else if (key === 'f') cmd = 'find_in_page';
        else if (key === 'k') cmd = 'tab_search';
        else if (key === 'd' && !e.shiftKey) cmd = 'bookmark_page';
        else if (key === 'h' && !e.shiftKey) cmd = 'open_history';
        else if (key === 'j' && !e.shiftKey) cmd = 'open_downloads';
        else if (key === 'b' && e.shiftKey) cmd = 'toggle_bookmarks_bar';
        else if (key === 'm' && !e.shiftKey) cmd = 'mute_tab';
        else if (key === '=' || key === '+') cmd = 'zoom_in';
        else if (key === '-') cmd = 'zoom_out';
        else if (key === '0') cmd = 'zoom_reset';
        else if (!e.shiftKey && key >= '1' && key <= '8') cmd = `tab_${key}` as BrowserShortcutCommand;
        else if (!e.shiftKey && key === '9') cmd = 'tab_last';
      }

      if (cmd) {
        e.preventDefault();
        executeShortcutRef.current(cmd);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Debounced persistence (350ms) including session tabs, tab groups, and active tab
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const payload: PersistedState = {
          accent,
          customAccentHex,
          surfaceTheme,
          searchEngine,
          limiter,
          shieldEnabled,
          trackerRules,
          bookmarks,
          history: history.slice(0, 120),
          showBookmarksBar,
          verticalTabs,
          autoSyncBrowsers,
          privacyConfig,
          sitePermissionsMap,
          extensions,
          sessionTabs: serializeSessionTabs(tabs),
          tabGroups,
          activeWorkspace,
          activeTabId,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore storage quota errors
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    accent,
    customAccentHex,
    surfaceTheme,
    searchEngine,
    limiter,
    shieldEnabled,
    trackerRules,
    bookmarks,
    history,
    showBookmarksBar,
    verticalTabs,
    autoSyncBrowsers,
    privacyConfig,
    sitePermissionsMap,
    extensions,
    tabs,
    tabGroups,
    activeWorkspace,
    activeTabId,
  ]);

  // Native Rust desktop shell sync (live sysinfo telemetry + persisted config.json hydration)
  useEffect(() => {
    if (!isRustNativeShell()) return;
    const updateTelemetry = (ramMbRaw?: number, cpuPercentRaw?: number, processCountRaw?: number) => {
      const nextRam = ramMbRaw ?? 0;
      const nextCpu = Number((cpuPercentRaw ?? 0).toFixed(1));
      setRustTelemetry((prev) =>
        prev &&
        prev.ramMb === nextRam &&
        prev.cpuPercent === nextCpu &&
        prev.processCount === (processCountRaw ?? prev.processCount)
          ? prev
          : {
              ramMb: nextRam,
              cpuPercent: nextCpu,
              processCount: processCountRaw ?? prev?.processCount,
            }
      );
    };
    window.__ferroxTelemetry = (telemetry) => {
      updateTelemetry(telemetry.ramMb, telemetry.cpuPercent, telemetry.processCount);
    };
    window.__ferroxTabHibernated = (tabId: string) => {
      if (!tabId) return;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, hibernated: true, estimatedRamMb: 8, estimatedCpuPercent: 0 } : t
        )
      );
    };
    window.__ferroxMemoryTrimmed = (info) => {
      if (!info) return;
      const saved = Math.max(0, info.beforeMb - info.afterMb);
      setLastTrimNotice(
        saved > 0
          ? `Trimmed ${info.processesTrimmed} processes · ${info.beforeMb} MB -> ${info.afterMb} MB (-${saved} MB)`
          : `Trimmed ${info.processesTrimmed} processes · working set at ${info.afterMb} MB`
      );
    };
    window.__ferroxSync = (payload: RustSyncPayload) => {
      updateTelemetry(payload.ramMb, payload.cpuPercent, payload.processCount);
      if (!rustInitializedRef.current) {
        rustInitializedRef.current = true;
        if (
          payload.accentPreset === 'crimson' ||
          payload.accentPreset === 'cobalt' ||
          payload.accentPreset === 'amber' ||
          payload.accentPreset === 'emerald' ||
          payload.accentPreset === 'custom'
        ) {
          setAccent(payload.accentPreset);
        }
        if (payload.customAccentHex) {
          setCustomAccentHex(payload.customAccentHex);
        }
        if (
          payload.surfaceTheme === 'obsidian' ||
          payload.surfaceTheme === 'midnight' ||
          payload.surfaceTheme === 'abyssal' ||
          payload.surfaceTheme === 'oled' ||
          payload.surfaceTheme === 'graphite'
        ) {
          setSurfaceTheme(payload.surfaceTheme);
        }
        if (
          payload.searchEngine === 'google' ||
          payload.searchEngine === 'duckduckgo' ||
          payload.searchEngine === 'wikipedia' ||
          payload.searchEngine === 'crates'
        ) {
          setSearchEngine(payload.searchEngine);
        }
        if (payload.initialUrl && payload.initialUrl.trim()) {
          const initTabId = `tab-${tabCounterRef.current++}`;
          const initTab = createTab(initTabId, 'personal', payload.initialUrl, Date.now(), {
            isPrivate: Boolean(payload.initialPrivate),
          });
          setTabs([initTab]);
          setActiveWorkspace('personal');
          setActiveTabId(initTabId);
          if (!initTab.url.startsWith('ferrox://')) {
            rustNavigateTab(initTabId, initTab.url, { isPrivate: initTab.isPrivate, background: false });
          } else {
            rustActivateTab(initTabId, initTab.url, initTab.isPrivate);
          }
        }
        if (typeof payload.verticalTabs === 'boolean') {
          setVerticalTabs(payload.verticalTabs);
        }
        if (typeof payload.showBookmarksBar === 'boolean') {
          setShowBookmarksBar(payload.showBookmarksBar);
        }
        if (typeof payload.autoSyncBrowsers === 'boolean') {
          setAutoSyncBrowsers(payload.autoSyncBrowsers);
        }
        setLimiter((prev) => ({
          ...prev,
          ramEnabled: typeof payload.ramEnabled === 'boolean' ? payload.ramEnabled : prev.ramEnabled,
          ramLimitMb: typeof payload.ramLimitMb === 'number' && payload.ramLimitMb >= 128 ? payload.ramLimitMb : prev.ramLimitMb,
          autoHibernateEnabled:
            typeof payload.autoHibernateEnabled === 'boolean'
              ? payload.autoHibernateEnabled
              : prev.autoHibernateEnabled,
          autoHibernateMinutes:
            typeof payload.autoHibernateMinutes === 'number' && payload.autoHibernateMinutes >= 1
              ? payload.autoHibernateMinutes
              : prev.autoHibernateMinutes,
          cpuEnabled: typeof payload.cpuEnabled === 'boolean' ? payload.cpuEnabled : prev.cpuEnabled,
          cpuLimitPercent:
            typeof payload.cpuLimitPercent === 'number' ? payload.cpuLimitPercent : prev.cpuLimitPercent,
          netEnabled: typeof payload.netEnabled === 'boolean' ? payload.netEnabled : prev.netEnabled,
          netLimitKbps:
            typeof payload.netLimitKbps === 'number' ? payload.netLimitKbps : prev.netLimitKbps,
        }));
        setPrivacyConfig((prev) => ({
          ...prev,
          hardwareAcceleration: payload.hardwareAcceleration ?? prev.hardwareAcceleration,
          vpnEnabled: payload.vpnEnabled ?? prev.vpnEnabled,
          vpnRegion: payload.vpnRegion ?? prev.vpnRegion,
        }));
      }
    };
    window.__ferroxContentUpdate = (update) => {
      const targetId = update.tabId || activeTabIdRef.current;
      if (!targetId) return;
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== targetId || t.url.startsWith('ferrox://')) return t;
          const nextUrl =
            update.url && (update.url.startsWith('http://') || update.url.startsWith('https://'))
              ? update.url
              : t.url;
          const nextTitle =
            update.title && update.title.trim().length > 0
              ? update.title.trim()
              : nextUrl !== t.url
              ? deriveTitleFromUrl(nextUrl)
              : t.title;
          if (nextUrl === t.url && nextTitle === t.title) return t;
          if (nextUrl !== t.url) {
            if (t.historyIndex > 0 && t.history[t.historyIndex - 1] === nextUrl) {
              return { ...stepBack(t), title: nextTitle };
            }
            if (
              t.historyIndex + 1 < t.history.length &&
              t.history[t.historyIndex + 1] === nextUrl
            ) {
              return { ...stepForward(t), title: nextTitle };
            }
            return tabHistoryNavigate(t, nextUrl, nextTitle);
          }
          return { ...t, title: nextTitle };
        })
      );
    };
    window.__ferroxOpenTab = (payload) => {
      if (payload && typeof payload.url === 'string' && payload.url.trim()) {
        openTabFromNativeRef.current(payload.url, payload.background !== false);
      }
    };
    window.__ferroxShortcut = (cmd) => {
      executeShortcutRef.current(cmd);
    };
    window.__ferroxAdBlocked = (payload) => {
      if (!payload) return;
      const host =
        typeof payload.host === 'string' && payload.host.trim()
          ? payload.host.trim()
          : 'youtube-ads';
      const pageUrl = typeof payload.url === 'string' ? payload.url : '';
      const event: BlockedEvent = {
        id: `blk-native-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        host,
        pageUrl,
        timestamp: Date.now(),
      };
      setBlockedEvents((prev) => [event, ...prev].slice(0, 200));
    };
    window.__ferroxDownloadEvent = (ev) => {
      if (!ev || typeof ev.url !== 'string') return;
      if (ev.phase === 'started') {
        const id = ev.id || `native-dl-${Date.now()}`;
        const filename = ev.filename || 'download.bin';
        const newItem: DownloadItem = {
          id,
          filename,
          url: ev.url,
          savedPath: ev.savedPath,
          bytesReceived: 16384,
          totalBytes: 100000,
          status: 'downloading',
          warning: ev.warning ?? null,
          startedAt: Date.now(),
        };
        setDownloads((prev) => [newItem, ...prev]);
        setDownloadShelfId(id);
      } else if (ev.phase === 'completed') {
        setDownloads((prev) => {
          let matchedId: string | null = null;
          const updated = prev.map((d) => {
            const isMatch =
              !matchedId &&
              d.status === 'downloading' &&
              (d.url === ev.url || (ev.savedPath && d.savedPath === ev.savedPath));
            if (!isMatch) return d;
            matchedId = d.id;
            return {
              ...d,
              savedPath: ev.savedPath ?? d.savedPath,
              bytesReceived: d.totalBytes,
              status: ev.success ? ('completed' as const) : ('blocked' as const),
              warning: ev.success ? d.warning : d.warning ?? 'Download failed or was interrupted.',
            };
          });
          if (matchedId) {
            setDownloadShelfId(matchedId);
          }
          return updated;
        });
      }
    };
    window.__ferroxProfilesDetected = (profiles: DetectedBrowserProfile[]) => {
      setRescanningProfiles(false);
      if (Array.isArray(profiles)) {
        setDetectedProfiles(profiles);
      }
    };
    window.__ferroxProfileImported = (results: NativeProfileImportResult[]) => {
      setSyncingProfileId(null);
      const ts = Date.now();
      if (!Array.isArray(results) || results.length === 0) {
        setLastSyncSummary({
          message: 'No installed browser profile data was found to import.',
          syncedAt: ts,
          totalBookmarksFound: 0,
          newBookmarksAdded: 0,
          alreadySyncedBookmarks: 0,
          totalHistoryFound: 0,
          newHistoryAdded: 0,
          totalCredentialsFound: 0,
          perProfile: [],
          notes: [],
        });
        return;
      }

      const existingBmUrls = new Set(bookmarksRef.current.map((b) => b.url));
      const existingHistUrls = new Set(historyRef.current.map((h) => h.url));

      const uniqueNewBookmarks: BookmarkItem[] = [];
      const uniqueNewHistory: HistoryItem[] = [];
      const incomingCredentials: VaultCredential[] = [];
      const notes: string[] = [];
      const perProfile: SyncProfileReceiptItem[] = [];
      const newlySyncedIds: string[] = [];

      let totalBookmarksFound = 0;
      let totalHistoryFound = 0;

      results.forEach((res, rIdx) => {
        newlySyncedIds.push(res.profileId);
        let profileBmAdded = 0;
        let profileHistAdded = 0;
        const bmList = res.bookmarks ?? [];
        const histList = res.history ?? [];
        const credList = res.credentials ?? [];

        totalBookmarksFound += bmList.length;
        totalHistoryFound += histList.length;

        bmList.forEach((bm, bIdx) => {
          if (!existingBmUrls.has(bm.url)) {
            existingBmUrls.add(bm.url);
            profileBmAdded += 1;
            uniqueNewBookmarks.push({
              id: `sync-bm-${ts}-${rIdx}-${bIdx}`,
              title: bm.title,
              url: bm.url,
              category: bm.category || res.browserName,
              pinnedToBar: bm.pinnedToBar,
            });
          }
        });

        histList.forEach((h, hIdx) => {
          if (!existingHistUrls.has(h.url)) {
            existingHistUrls.add(h.url);
            profileHistAdded += 1;
            uniqueNewHistory.push({
              id: `sync-hist-${ts}-${rIdx}-${hIdx}`,
              title: h.title,
              url: h.url,
              visitedAt: h.visitedAt || ts,
            });
          }
        });

        credList.forEach((c, cIdx) => {
          incomingCredentials.push({
            id: `sync-cred-${ts}-${rIdx}-${cIdx}`,
            site: c.site,
            username: c.username,
            password: c.password,
            updatedAt: ts,
          });
        });

        (res.notes ?? []).forEach((n) => {
          if (n && !notes.includes(n)) notes.push(n);
        });

        perProfile.push({
          profileId: res.profileId,
          browserName: res.browserName,
          profileName: res.profileName || 'Default',
          bookmarksFound: bmList.length,
          bookmarksAdded: profileBmAdded,
          historyFound: histList.length,
          historyAdded: profileHistAdded,
          credentialsFound: credList.length,
        });
      });

      if (uniqueNewBookmarks.length > 0) {
        setBookmarks((prev) => [...prev, ...uniqueNewBookmarks]);
      }
      if (uniqueNewHistory.length > 0) {
        setHistory((prev) => [...uniqueNewHistory, ...prev].slice(0, 250));
      }
      if (incomingCredentials.length > 0) {
        setPendingImportedCredentials((prev) => [...incomingCredentials, ...prev]);
      }

      setSyncedProfileIds((prev) => Array.from(new Set([...prev, ...newlySyncedIds])));

      const browserNames = Array.from(new Set(results.map((r) => r.browserName))).join(', ');
      setLastSyncSummary({
        message:
          results.length === 1
            ? `Synced ${browserNames} (${results[0].profileName || 'Default'})`
            : `Synced ${results.length} browser profiles (${browserNames})`,
        syncedAt: ts,
        totalBookmarksFound,
        newBookmarksAdded: uniqueNewBookmarks.length,
        alreadySyncedBookmarks: Math.max(0, totalBookmarksFound - uniqueNewBookmarks.length),
        totalHistoryFound,
        newHistoryAdded: uniqueNewHistory.length,
        totalCredentialsFound: incomingCredentials.length,
        perProfile,
        notes,
      });
    };
    sendToRust('ready');
    // Activate restored external tab lazily on native startup
    const bootActive = restoredSession.tabs.find((t) => t.id === restoredSession.activeTabId);
    if (bootActive && !bootActive.url.startsWith('ferrox://')) {
      rustActivateTab(bootActive.id, bootActive.url, bootActive.isPrivate);
    }
    return () => {
      delete window.__ferroxSync;
      delete window.__ferroxTelemetry;
      delete window.__ferroxTabHibernated;
      delete window.__ferroxMemoryTrimmed;
      delete window.__ferroxContentUpdate;
      delete window.__ferroxOpenTab;
      delete window.__ferroxShortcut;
      delete window.__ferroxAdBlocked;
      delete window.__ferroxDownloadEvent;
      delete window.__ferroxProfilesDetected;
      delete window.__ferroxProfileImported;
    };
  }, [restoredSession]);

  // Sync theme, limiter, search engine, and privacy changes to Rust config when inside .exe
  useEffect(() => {
    if (!isRustNativeShell() || !rustInitializedRef.current) return;
    syncRustTheme(accent, customAccentHex, surfaceTheme);
  }, [accent, customAccentHex, surfaceTheme]);

  useEffect(() => {
    if (!isRustNativeShell() || !rustInitializedRef.current) return;
    syncRustLimiter(limiter);
  }, [limiter]);

  useEffect(() => {
    if (!isRustNativeShell() || !rustInitializedRef.current) return;
    syncRustSearchEngine(searchEngine);
  }, [searchEngine]);

  useEffect(() => {
    if (!isRustNativeShell() || !rustInitializedRef.current) return;
    sendToRust('set_hardware_acceleration', { enabled: privacyConfig.hardwareAcceleration });
  }, [privacyConfig.hardwareAcceleration]);

  useEffect(() => {
    if (!isRustNativeShell() || !rustInitializedRef.current) return;
    sendToRust('set_layout', { verticalTabs, showBookmarksBar });
  }, [verticalTabs, showBookmarksBar]);

  useEffect(() => {
    if (!isRustNativeShell() || !rustInitializedRef.current) return;
    syncRustAutoSync(autoSyncBrowsers);
  }, [autoSyncBrowsers]);

  useEffect(() => {
    if (!isRustNativeShell()) return;
    syncRustShield(shieldEnabled, trackerRules);
  }, [shieldEnabled, trackerRules]);

  useEffect(() => {
    if (!isRustNativeShell() || !rustInitializedRef.current) return;
    sendToRust('set_privacy', {
      httpsOnly: privacyConfig.httpsOnly,
      safeBrowsing: privacyConfig.safeBrowsing,
      fingerprintProtection: privacyConfig.fingerprintProtection,
      webrtcIpProtection: privacyConfig.webrtcIpProtection,
      stripTrackingParams: privacyConfig.stripTrackingParams,
      blockCryptominers: privacyConfig.blockCryptominers,
      globalPrivacyControl: privacyConfig.globalPrivacyControl,
      blockHyperlinkAuditing: privacyConfig.blockHyperlinkAuditing,
      vpnEnabled: privacyConfig.vpnEnabled,
      vpnRegion: privacyConfig.vpnRegion,
    });
  }, [
    privacyConfig.httpsOnly,
    privacyConfig.safeBrowsing,
    privacyConfig.fingerprintProtection,
    privacyConfig.webrtcIpProtection,
    privacyConfig.stripTrackingParams,
    privacyConfig.blockCryptominers,
    privacyConfig.globalPrivacyControl,
    privacyConfig.blockHyperlinkAuditing,
    privacyConfig.vpnEnabled,
    privacyConfig.vpnRegion,
  ]);

  // Progress active downloads smoothly (native WebView2 downloads cap at 85% until native DownloadCompleted fires)
  const hasActiveDownloads = useMemo(
    () => downloads.some((d) => d.status === 'downloading'),
    [downloads]
  );
  useEffect(() => {
    if (!hasActiveDownloads) return;
    const timer = setInterval(() => {
      setDownloads((prev) =>
        prev.map((d) => {
          if (d.status !== 'downloading') return d;
          if (d.id.startsWith('native-dl-')) {
            const cap = Math.floor(d.totalBytes * 0.85);
            const nextBytes = Math.min(cap, d.bytesReceived + Math.ceil(d.totalBytes / 10));
            return nextBytes === d.bytesReceived ? d : { ...d, bytesReceived: nextBytes };
          }
          const nextBytes = Math.min(d.totalBytes, d.bytesReceived + Math.ceil(d.totalBytes / 5));
          return {
            ...d,
            bytesReceived: nextBytes,
            status: nextBytes >= d.totalBytes ? 'completed' : 'downloading',
          };
        })
      );
    }, 550);
    return () => clearInterval(timer);
  }, [hasActiveDownloads]);

  const budget = useMemo(
    () => evaluateResourceBudget(tabs, activeTabId, limiter, splitTabId),
    [tabs, activeTabId, limiter, splitTabId]
  );

  // Apply automatic hibernation when RAM limit triggers and actually drop native WebViews to reclaim RAM
  useEffect(() => {
    if (budget.hibernatedIds.length > 0) {
      setTabs(budget.tabs);
      if (isRustNativeShell()) {
        for (const id of budget.hibernatedIds) {
          rustHibernateTab(id);
        }
      }
    }
  }, [budget.hibernatedIds, budget.tabs]);

  // Apply Auto-Hibernate Inactive Tabs timer based on the user's slider setting
  useEffect(() => {
    if (!limiter.autoHibernateEnabled) return;
    const interval = window.setInterval(() => {
      const idleIds = findIdleTabsToHibernate(
        tabsRef.current,
        activeTabIdRef.current,
        splitTabId,
        limiter,
        Date.now()
      );
      if (idleIds.length === 0) return;
      const idleSet = new Set(idleIds);
      setTabs((prev) =>
        prev.map((t) =>
          idleSet.has(t.id)
            ? { ...t, hibernated: true, estimatedRamMb: 8, estimatedCpuPercent: 0 }
            : t
        )
      );
      if (isRustNativeShell()) {
        for (const id of idleIds) {
          rustHibernateTab(id);
        }
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [limiter, splitTabId]);

  // Clear trim memory confirmation banner automatically after 8s
  useEffect(() => {
    if (!lastTrimNotice) return;
    const timer = window.setTimeout(() => setLastTrimNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [lastTrimNotice]);

  const workspaceTabs = useMemo(
    () => budget.tabs.filter((t) => t.workspace === activeWorkspace),
    [budget.tabs, activeWorkspace]
  );

  const activeWorkspaceMeta = useMemo(
    () => WORKSPACES.find((w) => w.id === activeWorkspace) ?? WORKSPACES[0],
    [activeWorkspace]
  );

  const vpnServers = useMemo(
    () => getVpnServersWithLocationPing(userGeo, privacyConfig.vpnProtocol, vpnJitterMap),
    [userGeo, privacyConfig.vpnProtocol, vpnJitterMap]
  );

  const currentVpnServer = useMemo(
    () => vpnServers.find((s) => s.region === privacyConfig.vpnRegion) ?? vpnServers[0],
    [vpnServers, privacyConfig.vpnRegion]
  );

  const handleRefreshVpnPing = useCallback(() => {
    setVpnPinging(true);
    window.setTimeout(() => {
      const nextJitter: Record<string, number> = {};
      for (const srv of vpnServers) {
        nextJitter[srv.region] = Math.round((Math.random() - 0.5) * 6);
      }
      setVpnJitterMap(nextJitter);
      setVpnPinging(false);
    }, 280);
  }, [vpnServers]);

  const activeTab = useMemo(
    () => workspaceTabs.find((t) => t.id === activeTabId) ?? workspaceTabs[0] ?? null,
    [workspaceTabs, activeTabId]
  );

  const splitTab = useMemo(
    () => (splitTabId && splitTabId !== activeTab?.id ? budget.tabs.find((t) => t.id === splitTabId) ?? null : null),
    [budget.tabs, splitTabId, activeTab?.id]
  );

  // Keep native Rust active tab WebView aligned via rAF-coalesced, deduplicated bounds updates
  useEffect(() => {
    if (!isRustNativeShell()) return;
    if (activeTab?.url.startsWith('ferrox://')) {
      sendToRust('set_active_url', { url: activeTab.url });
    }
    let rafId = 0;
    const syncLayoutNow = () => {
      rafId = 0;
      const container = mainViewportRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const isExternal = Boolean(
        activeTab && !activeTab.url.startsWith('ferrox://') && !activeTab.hibernated
      );
      const overlayBlocks =
        quickSettingsOpen ||
        tabSearchOpen ||
        toolbarPopoverOpen ||
        tabContextMenuOpen ||
        tabDragOverlayOpen ||
        detachedWindows.length > 0 ||
        Boolean(pipTabId);
      const left = Math.round(rect.left);
      const top = Math.round(rect.top);
      const rawWidth = splitTab ? rect.width / 2 : rect.width;
      const width = Math.max(1, Math.round(rawWidth));
      const height = Math.max(1, Math.round(rect.height));
      const visible = isExternal && !overlayBlocks;
      const key = `${activeTab?.id ?? ''},${left},${top},${width},${height},${visible ? 1 : 0}`;
      if (lastLayoutKeyRef.current === key) return;
      lastLayoutKeyRef.current = key;
      sendToRust('layout', { left, top, width, height, visible });
    };
    const scheduleSyncLayout = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(syncLayoutNow);
    };
    syncLayoutNow();
    const observer =
      typeof ResizeObserver !== 'undefined' && mainViewportRef.current
        ? new ResizeObserver(scheduleSyncLayout)
        : null;
    if (observer && mainViewportRef.current) {
      observer.observe(mainViewportRef.current);
    }
    window.addEventListener('resize', scheduleSyncLayout, { passive: true });
    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleSyncLayout);
    };
  }, [
    activeTab,
    activeDrawer,
    detachedWindows.length,
    downloadShelfId,
    findOpen,
    pipTabId,
    quickSettingsOpen,
    showBookmarksBar,
    splitTab,
    tabContextMenuOpen,
    tabDragOverlayOpen,
    tabSearchOpen,
    toolbarPopoverOpen,
    verticalTabs,
  ]);

  const fetchExternalUrl = useCallback(
    async (
      tabId: string,
      url: string,
      options?: {
        bypassSafeBrowsing?: boolean;
        isPrivate?: boolean;
        background?: boolean;
        forceReload?: boolean;
      }
    ) => {
      if (url.startsWith('ferrox://')) return;

      const sec = evaluateUrlSecurity(
        url,
        privacyConfig.httpsOnly,
        options?.bypassSafeBrowsing ? false : privacyConfig.safeBrowsing,
        privacyConfig.stripTrackingParams
      );

      if (!sec.safe && sec.threatType && sec.reason) {
        setPageCache((prev) => ({
          ...prev,
          [tabId]: {
            url,
            finalUrl: url,
            title: `Security Warning (${sec.threatType})`,
            status: 403,
            bytesTransferred: 0,
            elapsedMs: 1,
            effectiveKbps: 0,
            blockedTrackers: [],
            sanitizedHtml: '',
            safeBrowsingThreat: {
              threatType: sec.threatType!,
              reason: sec.reason!,
            },
          },
        }));
        setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
        setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
        return;
      }

      const targetUrl = sec.upgradedUrl;
      if (sec.strippedTrackers > 0) {
        setBlockedEvents((prev) =>
          [
            {
              id: `blk-utm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              host: `url-tracker-stripped (${sec.strippedTrackers})`,
              pageUrl: targetUrl,
              timestamp: Date.now(),
            },
            ...prev,
          ].slice(0, 200)
        );
      }
      if (sec.upgradedFromHttp || targetUrl !== url) {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            const nextHistory = [...t.history];
            if (t.historyIndex >= 0 && t.historyIndex < nextHistory.length) {
              nextHistory[t.historyIndex] = targetUrl;
            }
            return { ...t, url: targetUrl, history: nextHistory };
          })
        );
      }

      const blockCheck = shouldBlockUrl(targetUrl, shieldEnabled, trackerRules);
      if (blockCheck.blocked && blockCheck.matchedRule) {
        setBlockedEvents((prev) =>
          [
            {
              id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              host: blockCheck.matchedRule!,
              pageUrl: targetUrl,
              timestamp: Date.now(),
            },
            ...prev,
          ].slice(0, 200)
        );
        setPageCache((prev) => ({
          ...prev,
          [tabId]: {
            url: targetUrl,
            finalUrl: targetUrl,
            title: `Blocked (${blockCheck.matchedRule})`,
            status: 403,
            bytesTransferred: 0,
            elapsedMs: 1,
            effectiveKbps: 0,
            blockedTrackers: [blockCheck.matchedRule!],
            blockedByShield: true,
            matchedRule: blockCheck.matchedRule!,
            sanitizedHtml: '',
          },
        }));
        setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
        setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
        return;
      }

      if (isRustNativeShell()) {
        rustNavigateTab(tabId, targetUrl, {
          isPrivate: options?.isPrivate,
          background: options?.background,
        });
        setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
        setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
        if (!options?.isPrivate) {
          setHistory((prev) =>
            [
              {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: deriveTitleFromUrl(targetUrl),
                url: targetUrl,
                visitedAt: Date.now(),
              },
              ...prev,
            ].slice(0, 250)
          );
        }
        return;
      }

      // Instant HTTP response cache hit for web preview (bypassed on explicit Reload)
      const cacheKey = `${targetUrl}|${shieldEnabled ? 1 : 0}|${privacyConfig.fingerprintProtection ? 1 : 0}`;
      if (!options?.forceReload && !options?.isPrivate) {
        const cachedPage = urlResponseCacheRef.current.get(cacheKey);
        if (cachedPage) {
          setPageCache((prev) => ({ ...prev, [tabId]: cachedPage }));
          setTabs((prev) =>
            prev.map((t) => (t.id === tabId ? { ...t, title: cachedPage.title } : t))
          );
          setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
          setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
          return;
        }
      }

      setLoadingTabs((prev) => ({ ...prev, [tabId]: true }));
      setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
      setTranslatedTabs((prev) => ({ ...prev, [tabId]: null }));

      try {
        const params = new URLSearchParams({
          url: targetUrl,
          shield: shieldEnabled ? '1' : '0',
          fp: privacyConfig.fingerprintProtection ? '1' : '0',
          stripTrackers: privacyConfig.stripTrackingParams ? '1' : '0',
          limitKbps: limiter.netEnabled ? String(limiter.netLimitKbps) : '0',
          rules: trackerRules.join(','),
        });
        if (options?.forceReload) {
          params.set('refresh', '1');
        }
        const response = await fetch(`/api/browse?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        const loaded: LoadedPageData = {
          url: targetUrl,
          finalUrl: data.finalUrl || targetUrl,
          title: data.title || deriveTitleFromUrl(targetUrl),
          status: data.status ?? 200,
          bytesTransferred: data.bytesTransferred ?? 0,
          elapsedMs: data.elapsedMs ?? 1,
          effectiveKbps: data.effectiveKbps ?? 0,
          blockedTrackers: data.blockedTrackers ?? [],
          blockedByShield: data.blockedByShield,
          matchedRule: data.matchedRule,
          sanitizedHtml: data.sanitizedHtml ?? '',
          readerParagraphs: data.readerParagraphs ?? [],
          upgradedFromHttp: sec.upgradedFromHttp,
          insecureHttpWarning: sec.insecureHttpWarning,
        };

        if (!options?.isPrivate && !loaded.blockedByShield) {
          if (urlResponseCacheRef.current.size >= 40) {
            const oldestKey = urlResponseCacheRef.current.keys().next().value;
            if (oldestKey) urlResponseCacheRef.current.delete(oldestKey);
          }
          urlResponseCacheRef.current.set(cacheKey, loaded);
        }

        setPageCache((prev) => ({ ...prev, [tabId]: loaded }));
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, title: loaded.title } : t))
        );

        if (loaded.blockedTrackers.length > 0) {
          setBlockedEvents((prev) =>
            [
              ...loaded.blockedTrackers.map((host) => ({
                id: `blk-${Date.now()}-${host}-${Math.random().toString(36).slice(2, 6)}`,
                host,
                pageUrl: loaded.finalUrl,
                timestamp: Date.now(),
              })),
              ...prev,
            ].slice(0, 200)
          );
        }

        // Private Browsing: never retain browsing history
        if (!options?.isPrivate) {
          setHistory((prev) =>
            [
              {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: loaded.title,
                url: loaded.finalUrl,
                visitedAt: Date.now(),
              },
              ...prev,
            ].slice(0, 250)
          );
        }
      } catch (err) {
        setErrorTabs((prev) => ({
          ...prev,
          [tabId]: err instanceof Error ? err.message : 'Unable to fetch target URL.',
        }));
      } finally {
        setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
      }
    },
    [
      limiter.netEnabled,
      limiter.netLimitKbps,
      privacyConfig.fingerprintProtection,
      privacyConfig.httpsOnly,
      privacyConfig.safeBrowsing,
      privacyConfig.stripTrackingParams,
      shieldEnabled,
      trackerRules,
    ]
  );

  // Hydrate restored external active tab on initial boot in Web Preview mode
  const webBootHydratedRef = useRef(false);
  useEffect(() => {
    if (webBootHydratedRef.current || isRustNativeShell()) return;
    webBootHydratedRef.current = true;
    const bootActive = restoredSession.tabs.find((t) => t.id === restoredSession.activeTabId);
    if (bootActive && !bootActive.url.startsWith('ferrox://')) {
      void fetchExternalUrl(bootActive.id, bootActive.url, { isPrivate: bootActive.isPrivate });
    }
  }, [fetchExternalUrl, restoredSession]);

  const navigateTab = useCallback(
    (tabId: string, rawInput: string) => {
      const normalized = normalizeAddressInput(rawInput, searchEngine);
      const targetTab = tabs.find((t) => t.id === tabId);
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? tabHistoryNavigate(t, normalized) : t))
      );
      setReaderModeTabs((prev) => ({ ...prev, [tabId]: false }));
      setTranslatedTabs((prev) => ({ ...prev, [tabId]: null }));

      if (!normalized.startsWith('ferrox://')) {
        void fetchExternalUrl(tabId, normalized, { isPrivate: targetTab?.isPrivate });
      } else {
        if (isRustNativeShell()) {
          rustActivateTab(tabId, normalized, Boolean(targetTab?.isPrivate));
        }
        setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
        setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
      }
    },
    [fetchExternalUrl, searchEngine, tabs]
  );

  const handleNewTab = useCallback(
    (
      initialUrl: string = 'ferrox://speed-dial',
      isPrivate: boolean = false,
      background: boolean = false
    ) => {
      const id = `tab-${tabCounterRef.current++}`;
      const newTab = createTab(id, activeWorkspace, initialUrl, Date.now(), { isPrivate });
      setTabs((prev) => [...prev, newTab]);
      if (!background) {
        setActiveTabId(id);
      }
      if (isPrivate && privacyConfig.vpnAutoConnectPrivate && !privacyConfig.vpnEnabled) {
        setPrivacyConfig((prev) => ({ ...prev, vpnEnabled: true }));
      }
      if (!newTab.url.startsWith('ferrox://')) {
        void fetchExternalUrl(id, newTab.url, { isPrivate, background });
      } else if (!background && isRustNativeShell()) {
        rustActivateTab(id, newTab.url, isPrivate);
      }
    },
    [activeWorkspace, fetchExternalUrl, privacyConfig.vpnAutoConnectPrivate, privacyConfig.vpnEnabled]
  );

  const handleOpenUrl = useCallback(
    (rawInput: string) => {
      const normalized = normalizeAddressInput(rawInput, searchEngine);
      if (!activeTab) {
        handleNewTab(normalized, false, false);
        return;
      }
      navigateTab(activeTab.id, rawInput);
    },
    [activeTab, handleNewTab, navigateTab, searchEngine]
  );

  const handleOpenBackgroundTab = useCallback(
    (rawUrl: string) => {
      handleNewTab(rawUrl, false, true);
    },
    [handleNewTab]
  );

  openTabFromNativeRef.current = (url: string, background: boolean) => {
    handleNewTab(url, false, background);
  };

  const handleCloseTab = useCallback(
    (id: string) => {
      const currentTabs = tabsRef.current;
      const closing = currentTabs.find((t) => t.id === id);
      if (closing && !closing.isPrivate) {
        closedTabsRef.current = [...closedTabsRef.current.slice(-24), closing];
        setClosedTabsCount(closedTabsRef.current.length);
      }
      if (isRustNativeShell()) {
        rustCloseTab(id);
      }
      setPageCache((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setTabZooms((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (splitTabId === id) {
        setSplitTabId(null);
      }
      if (pipTabId === id) {
        setPipTabId(null);
      }

      const remaining = currentTabs.filter((t) => t.id !== id);
      const wsRemaining = remaining.filter((t) => t.workspace === activeWorkspace);

      if (wsRemaining.length === 0) {
        setTabs(remaining);
        setActiveTabId('');
        if (isRustNativeShell()) {
          sendToRust('set_active_url', { url: 'ferrox://speed-dial' });
        }
        return;
      }

      setTabs(remaining);
      if (id === activeTabIdRef.current) {
        const fallback = wsRemaining[wsRemaining.length - 1];
        setActiveTabId(fallback.id);
        if (isRustNativeShell()) {
          rustActivateTab(fallback.id, fallback.url, fallback.isPrivate);
        }
      }
    },
    [activeWorkspace, pipTabId, splitTabId]
  );

  const handleReopenClosedTab = useCallback(() => {
    const popped = closedTabsRef.current.pop();
    setClosedTabsCount(closedTabsRef.current.length);
    if (!popped) return;
    const restoredId = `tab-${tabCounterRef.current++}`;
    const restored: Tab = {
      ...popped,
      id: restoredId,
      hibernated: false,
      lastActiveAt: Date.now(),
    };
    setTabs((prev) => [...prev, restored]);
    setActiveWorkspace(restored.workspace);
    setActiveTabId(restoredId);
    if (!restored.url.startsWith('ferrox://')) {
      void fetchExternalUrl(restoredId, restored.url, { isPrivate: false });
    } else if (isRustNativeShell()) {
      rustActivateTab(restoredId, restored.url, false);
    }
  }, [fetchExternalUrl]);

  const handleDuplicateTab = useCallback(
    (sourceId: string) => {
      const source = tabsRef.current.find((t) => t.id === sourceId);
      if (!source) return;
      const newId = `tab-${tabCounterRef.current++}`;
      const cloned = duplicateTab(source, newId);

      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === sourceId);
        if (idx === -1) return [...prev, cloned];
        const next = [...prev];
        next.splice(idx + 1, 0, cloned);
        return next;
      });
      setActiveWorkspace(cloned.workspace);
      setActiveTabId(newId);

      if (!cloned.url.startsWith('ferrox://')) {
        if (isRustNativeShell()) {
          rustNavigateTab(newId, cloned.url, { isPrivate: cloned.isPrivate, background: false });
        } else {
          const cached = pageCacheRef.current[sourceId];
          if (cached) {
            setPageCache((prev) => ({ ...prev, [newId]: cached }));
          } else {
            void fetchExternalUrl(newId, cloned.url, { isPrivate: cloned.isPrivate });
          }
        }
      } else if (isRustNativeShell()) {
        rustActivateTab(newId, cloned.url, cloned.isPrivate);
      }
    },
    [fetchExternalUrl]
  );

  const handleReloadTabById = useCallback(
    (targetId: string) => {
      const target = tabsRef.current.find((t) => t.id === targetId);
      if (!target || target.url.startsWith('ferrox://')) return;
      if (isRustNativeShell()) {
        rustTabReload(target.id);
      } else {
        void fetchExternalUrl(target.id, target.url, {
          isPrivate: target.isPrivate,
          forceReload: true,
        });
      }
    },
    [fetchExternalUrl]
  );

  const handleHibernateTabById = useCallback(
    (tabId: string) => {
      if (tabId === activeTabIdRef.current || tabId === splitTabId) return;
      if (isRustNativeShell()) {
        rustHibernateTab(tabId);
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, hibernated: true, estimatedRamMb: 8, estimatedCpuPercent: 0 } : t
        )
      );
    },
    [splitTabId]
  );

  const handleCloseOtherTabs = useCallback(
    (keepId: string) => {
      const currentTabs = tabsRef.current;
      const toClose = currentTabs.filter(
        (t) => t.workspace === activeWorkspace && t.id !== keepId && !t.pinned
      );
      if (toClose.length === 0) return;

      for (const closing of toClose) {
        if (!closing.isPrivate) {
          closedTabsRef.current = [...closedTabsRef.current.slice(-24), closing];
        }
        if (isRustNativeShell()) {
          rustCloseTab(closing.id);
        }
      }
      setClosedTabsCount(closedTabsRef.current.length);

      const closedIds = new Set(toClose.map((t) => t.id));
      setPageCache((prev) => {
        const next = { ...prev };
        for (const id of closedIds) delete next[id];
        return next;
      });
      setTabZooms((prev) => {
        const next = { ...prev };
        for (const id of closedIds) delete next[id];
        return next;
      });
      if (splitTabId && closedIds.has(splitTabId)) {
        setSplitTabId(null);
      }
      if (pipTabId && closedIds.has(pipTabId)) {
        setPipTabId(null);
      }
      setTabs((prev) => prev.filter((t) => !closedIds.has(t.id)));
      setActiveTabId(keepId);
      const kept = currentTabs.find((t) => t.id === keepId);
      if (kept && isRustNativeShell()) {
        rustActivateTab(kept.id, kept.url, kept.isPrivate);
      }
    },
    [activeWorkspace, pipTabId, splitTabId]
  );

  const handleCloseTabsToRight = useCallback(
    (sourceId: string) => {
      const currentTabs = tabsRef.current;
      const toClose = getTabsToRight(currentTabs, activeWorkspace, sourceId);
      if (toClose.length === 0) return;

      for (const closing of toClose) {
        if (!closing.isPrivate) {
          closedTabsRef.current = [...closedTabsRef.current.slice(-24), closing];
        }
        if (isRustNativeShell()) {
          rustCloseTab(closing.id);
        }
      }
      setClosedTabsCount(closedTabsRef.current.length);

      const closedIds = new Set(toClose.map((t) => t.id));
      setPageCache((prev) => {
        const next = { ...prev };
        for (const id of closedIds) delete next[id];
        return next;
      });
      setTabZooms((prev) => {
        const next = { ...prev };
        for (const id of closedIds) delete next[id];
        return next;
      });
      if (splitTabId && closedIds.has(splitTabId)) {
        setSplitTabId(null);
      }
      if (pipTabId && closedIds.has(pipTabId)) {
        setPipTabId(null);
      }
      setTabs((prev) => prev.filter((t) => !closedIds.has(t.id)));
      if (closedIds.has(activeTabIdRef.current)) {
        setActiveTabId(sourceId);
        const kept = currentTabs.find((t) => t.id === sourceId);
        if (kept && isRustNativeShell()) {
          rustActivateTab(kept.id, kept.url, kept.isPrivate);
        }
      }
    },
    [activeWorkspace, pipTabId, splitTabId]
  );

  const handleToggleMuteTab = useCallback((tabId: string) => {
    const target = tabsRef.current.find((t) => t.id === tabId);
    if (!target) return;
    const nextMuted = !target.muted;
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, muted: nextMuted } : t))
    );
    if (isRustNativeShell()) {
      rustTabMute(tabId, nextMuted);
    }
  }, []);

  const handleReorderTab = useCallback(
    (draggedId: string, targetId: string, position: 'before' | 'after') => {
      setTabs((prev) => reorderTabs(prev, draggedId, targetId, position));
    },
    []
  );

  const handleDetachTab = useCallback(
    (tabId: string, point?: DetachDropPoint) => {
      const currentTabs = tabsRef.current;
      const tab = currentTabs.find((t) => t.id === tabId);
      if (!tab) return;

      if (isRustNativeShell()) {
        rustDetachTabWindow(tab.url, {
          x: point?.screenX,
          y: point?.screenY,
          isPrivate: tab.isPrivate,
        });
        rustCloseTab(tab.id);
      } else {
        const winWidth = Math.min(780, Math.max(480, window.innerWidth - 140));
        const winHeight = Math.min(540, Math.max(360, window.innerHeight - 140));
        const dropX = point ? point.x - Math.round(winWidth / 2) : Math.round((window.innerWidth - winWidth) / 2) + detachedWindows.length * 24;
        const dropY = point ? Math.max(56, point.y - 16) : Math.round((window.innerHeight - winHeight) / 2) + detachedWindows.length * 24;
        const clampedX = Math.max(16, Math.min(window.innerWidth - winWidth - 16, dropX));
        const clampedY = Math.max(48, Math.min(window.innerHeight - winHeight - 16, dropY));
        const windowId = `win-${detachedCounterRef.current++}`;
        const zIndex = ++detachedZRef.current;
        setDetachedWindows((prev) => [
          ...prev,
          {
            windowId,
            tab: { ...tab, pinned: false, hibernated: false, lastActiveAt: Date.now() },
            x: clampedX,
            y: clampedY,
            width: winWidth,
            height: winHeight,
            maximized: false,
            zIndex,
          },
        ]);
      }

      if (splitTabId === tabId) setSplitTabId(null);
      if (pipTabId === tabId) setPipTabId(null);

      const remaining = currentTabs.filter((t) => t.id !== tabId);
      const wsRemaining = remaining.filter((t) => t.workspace === activeWorkspace);
      setTabs(remaining);
      if (wsRemaining.length === 0) {
        setActiveTabId('');
        if (isRustNativeShell()) {
          sendToRust('set_active_url', { url: 'ferrox://speed-dial' });
        }
      } else if (tabId === activeTabIdRef.current) {
        const fallback = wsRemaining[wsRemaining.length - 1];
        setActiveTabId(fallback.id);
        if (isRustNativeShell()) {
          rustActivateTab(fallback.id, fallback.url, fallback.isPrivate);
        }
      }
    },
    [activeWorkspace, detachedWindows.length, pipTabId, splitTabId]
  );

  const handleOpenNewWindow = useCallback(
    (url: string = 'ferrox://speed-dial', isPrivate: boolean = false) => {
      if (isRustNativeShell()) {
        rustOpenNewWindow(url, isPrivate);
        return;
      }
      const tabId = `tab-${tabCounterRef.current++}`;
      const newTab = createTab(tabId, activeWorkspace, url, Date.now(), { isPrivate });
      const winWidth = Math.min(780, Math.max(480, window.innerWidth - 140));
      const winHeight = Math.min(540, Math.max(360, window.innerHeight - 140));
      const offset = detachedWindows.length * 24;
      const windowId = `win-${detachedCounterRef.current++}`;
      const zIndex = ++detachedZRef.current;
      setDetachedWindows((prev) => [
        ...prev,
        {
          windowId,
          tab: newTab,
          x: Math.max(24, Math.min(window.innerWidth - winWidth - 24, 96 + offset)),
          y: Math.max(64, Math.min(window.innerHeight - winHeight - 24, 84 + offset)),
          width: winWidth,
          height: winHeight,
          maximized: false,
          zIndex,
        },
      ]);
      if (!newTab.url.startsWith('ferrox://')) {
        void fetchExternalUrl(tabId, newTab.url, { isPrivate });
      }
    },
    [activeWorkspace, detachedWindows.length, fetchExternalUrl]
  );

  const handleFocusDetachedWindow = useCallback((windowId: string) => {
    const nextZ = ++detachedZRef.current;
    setDetachedWindows((prev) =>
      prev.map((w) => (w.windowId === windowId ? { ...w, zIndex: nextZ } : w))
    );
  }, []);

  const handleMoveDetachedWindow = useCallback((windowId: string, x: number, y: number) => {
    setDetachedWindows((prev) =>
      prev.map((w) => (w.windowId === windowId ? { ...w, x, y } : w))
    );
  }, []);

  const handleResizeDetachedWindow = useCallback((windowId: string, width: number, height: number) => {
    setDetachedWindows((prev) =>
      prev.map((w) => (w.windowId === windowId ? { ...w, width, height } : w))
    );
  }, []);

  const handleToggleMaximizeDetachedWindow = useCallback((windowId: string) => {
    setDetachedWindows((prev) =>
      prev.map((w) => (w.windowId === windowId ? { ...w, maximized: !w.maximized } : w))
    );
  }, []);

  const handleDockDetachedWindow = useCallback(
    (windowId: string) => {
      const targetWin = detachedWindows.find((w) => w.windowId === windowId);
      if (!targetWin) return;
      const dockedTab: Tab = {
        ...targetWin.tab,
        workspace: activeWorkspace,
        hibernated: false,
        lastActiveAt: Date.now(),
      };
      setDetachedWindows((prev) => prev.filter((w) => w.windowId !== windowId));
      setTabs((prev) => [...prev, dockedTab]);
      setActiveTabId(dockedTab.id);
    },
    [activeWorkspace, detachedWindows]
  );

  const handleCloseDetachedWindow = useCallback((windowId: string) => {
    const targetWin = detachedWindows.find((w) => w.windowId === windowId);
    if (targetWin && !targetWin.tab.isPrivate) {
      closedTabsRef.current = [...closedTabsRef.current.slice(-24), targetWin.tab];
      setClosedTabsCount(closedTabsRef.current.length);
    }
    setDetachedWindows((prev) => prev.filter((w) => w.windowId !== windowId));
  }, [detachedWindows]);

  const handleNavigateDetachedWindow = useCallback(
    (windowId: string, rawInput: string) => {
      const targetWin = detachedWindows.find((w) => w.windowId === windowId);
      if (!targetWin) return;
      const normalized = normalizeAddressInput(rawInput, searchEngine);
      const nextTab = tabHistoryNavigate(targetWin.tab, normalized);
      setDetachedWindows((prev) =>
        prev.map((w) => (w.windowId === windowId ? { ...w, tab: nextTab } : w))
      );
      if (!normalized.startsWith('ferrox://')) {
        void fetchExternalUrl(nextTab.id, normalized, { isPrivate: nextTab.isPrivate });
      }
    },
    [detachedWindows, fetchExternalUrl, searchEngine]
  );

  const handleDetachedBack = useCallback(
    (windowId: string) => {
      const targetWin = detachedWindows.find((w) => w.windowId === windowId);
      if (!targetWin || !canGoBack(targetWin.tab)) return;
      const nextTab = stepBack(targetWin.tab);
      setDetachedWindows((prev) =>
        prev.map((w) => (w.windowId === windowId ? { ...w, tab: nextTab } : w))
      );
      if (!nextTab.url.startsWith('ferrox://')) {
        void fetchExternalUrl(nextTab.id, nextTab.url, { isPrivate: nextTab.isPrivate });
      }
    },
    [detachedWindows, fetchExternalUrl]
  );

  const handleDetachedForward = useCallback(
    (windowId: string) => {
      const targetWin = detachedWindows.find((w) => w.windowId === windowId);
      if (!targetWin || !canGoForward(targetWin.tab)) return;
      const nextTab = stepForward(targetWin.tab);
      setDetachedWindows((prev) =>
        prev.map((w) => (w.windowId === windowId ? { ...w, tab: nextTab } : w))
      );
      if (!nextTab.url.startsWith('ferrox://')) {
        void fetchExternalUrl(nextTab.id, nextTab.url, { isPrivate: nextTab.isPrivate });
      }
    },
    [detachedWindows, fetchExternalUrl]
  );

  const handleDetachedReload = useCallback(
    (windowId: string) => {
      const targetWin = detachedWindows.find((w) => w.windowId === windowId);
      if (!targetWin || targetWin.tab.url.startsWith('ferrox://')) return;
      void fetchExternalUrl(targetWin.tab.id, targetWin.tab.url, {
        isPrivate: targetWin.tab.isPrivate,
        forceReload: true,
      });
    },
    [detachedWindows, fetchExternalUrl]
  );

  const handleSelectWorkspace = useCallback(
    (ws: WorkspaceId) => {
      setActiveWorkspace(ws);
      setSplitTabId(null);
      const existing = tabsRef.current.find((t) => t.workspace === ws);
      if (existing) {
        setActiveTabId(existing.id);
        if (isRustNativeShell()) {
          rustActivateTab(existing.id, existing.url, existing.isPrivate);
        } else if (!existing.url.startsWith('ferrox://') && !pageCacheRef.current[existing.id]) {
          void fetchExternalUrl(existing.id, existing.url, { isPrivate: existing.isPrivate });
        }
      } else {
        setActiveTabId('');
        if (isRustNativeShell()) {
          sendToRust('set_active_url', { url: 'ferrox://speed-dial' });
        }
      }
    },
    [fetchExternalUrl]
  );

  const handleSelectTab = useCallback(
    (id: string) => {
      const target = tabsRef.current.find((t) => t.id === id);
      if (target && target.workspace !== activeWorkspace) {
        setActiveWorkspace(target.workspace);
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, hibernated: false, lastActiveAt: Date.now() } : t
        )
      );
      setActiveTabId(id);
      if (target) {
        if (isRustNativeShell()) {
          // Activate existing per-tab WebView WITHOUT reloading it!
          rustActivateTab(target.id, target.url, target.isPrivate);
        } else if (!target.url.startsWith('ferrox://') && !pageCacheRef.current[id]) {
          void fetchExternalUrl(id, target.url, { isPrivate: target.isPrivate });
        }
      }
    },
    [activeWorkspace, fetchExternalUrl]
  );

  const handleBack = useCallback(() => {
    if (!activeTab) return;
    if (isRustNativeShell() && !activeTab.url.startsWith('ferrox://')) {
      if (canGoBack(activeTab)) {
        const nextTab = stepBack(activeTab);
        setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? nextTab : t)));
        if (nextTab.url.startsWith('ferrox://')) {
          rustActivateTab(activeTab.id, nextTab.url, activeTab.isPrivate);
        } else {
          rustTabBack(activeTab.id);
        }
      } else {
        rustTabBack(activeTab.id);
      }
      return;
    }
    if (!canGoBack(activeTab)) return;
    const nextTab = stepBack(activeTab);
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? nextTab : t)));
    if (!nextTab.url.startsWith('ferrox://')) {
      void fetchExternalUrl(activeTab.id, nextTab.url, { isPrivate: activeTab.isPrivate });
    }
  }, [activeTab, fetchExternalUrl]);

  const handleForward = useCallback(() => {
    if (!activeTab) return;
    if (isRustNativeShell() && !activeTab.url.startsWith('ferrox://')) {
      if (canGoForward(activeTab)) {
        const nextTab = stepForward(activeTab);
        setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? nextTab : t)));
        if (nextTab.url.startsWith('ferrox://')) {
          rustActivateTab(activeTab.id, nextTab.url, activeTab.isPrivate);
        } else {
          rustTabForward(activeTab.id);
        }
      } else {
        rustTabForward(activeTab.id);
      }
      return;
    }
    if (!canGoForward(activeTab)) return;
    const nextTab = stepForward(activeTab);
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? nextTab : t)));
    if (!nextTab.url.startsWith('ferrox://')) {
      void fetchExternalUrl(activeTab.id, nextTab.url, { isPrivate: activeTab.isPrivate });
    }
  }, [activeTab, fetchExternalUrl]);

  const handleReload = useCallback(() => {
    if (!activeTab) return;
    if (!activeTab.url.startsWith('ferrox://')) {
      if (isRustNativeShell()) {
        rustTabReload(activeTab.id);
      } else {
        void fetchExternalUrl(activeTab.id, activeTab.url, {
          isPrivate: activeTab.isPrivate,
          forceReload: true,
        });
      }
    }
  }, [activeTab, fetchExternalUrl]);

  const handleAdjustZoom = useCallback(
    (mode: 'in' | 'out' | 'reset') => {
      if (!activeTab) return;
      const current = tabZooms[activeTab.id] ?? 1;
      const next =
        mode === 'reset'
          ? 1
          : clampZoomFactor(current + (mode === 'in' ? 0.1 : -0.1));
      setTabZooms((prev) => ({ ...prev, [activeTab.id]: next }));
      if (isRustNativeShell()) {
        rustTabZoom(activeTab.id, next);
      }
    },
    [activeTab, tabZooms]
  );

  const handleFindStep = useCallback(
    (query: string, backwards: boolean) => {
      if (!activeTab) return;
      if (isRustNativeShell() && !activeTab.url.startsWith('ferrox://')) {
        if (query.trim()) {
          rustTabFind(activeTab.id, query, backwards);
        } else {
          rustTabFindClear(activeTab.id);
        }
      } else if (!activeTab.url.startsWith('ferrox://')) {
        setFindSignal({
          tabId: activeTab.id,
          seq: findCounterRef.current++,
          query,
          backwards,
        });
      } else if (query.trim()) {
        const winWithFind = window as Window & { find?: (...args: unknown[]) => boolean };
        if (typeof winWithFind.find === 'function') {
          winWithFind.find(query, false, backwards, true);
        }
      }
    },
    [activeTab]
  );

  const handleCloseFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery('');
    if (activeTab && isRustNativeShell()) {
      rustTabFindClear(activeTab.id);
    }
  }, [activeTab]);

  executeShortcutRef.current = (cmd: BrowserShortcutCommand) => {
    switch (cmd) {
      case 'new_tab':
        handleNewTab('ferrox://speed-dial', false, false);
        break;
      case 'new_window':
        handleOpenNewWindow('ferrox://speed-dial', false);
        break;
      case 'new_private_tab':
        handleNewTab('ferrox://speed-dial', true, false);
        break;
      case 'close_tab':
        if (activeTab) handleCloseTab(activeTab.id);
        break;
      case 'reopen_tab':
        handleReopenClosedTab();
        break;
      case 'next_tab': {
        const nextId = getNextTabId(workspaceTabs, activeTab?.id ?? null, 1);
        if (nextId) handleSelectTab(nextId);
        break;
      }
      case 'prev_tab': {
        const prevId = getNextTabId(workspaceTabs, activeTab?.id ?? null, -1);
        if (prevId) handleSelectTab(prevId);
        break;
      }
      case 'focus_omnibox':
        omniboxInputRef.current?.focus();
        omniboxInputRef.current?.select();
        break;
      case 'reload':
        handleReload();
        break;
      case 'back':
        handleBack();
        break;
      case 'forward':
        handleForward();
        break;
      case 'find_in_page':
        setFindOpen(true);
        break;
      case 'tab_search':
        setTabSearchOpen((open) => !open);
        break;
      case 'bookmark_page':
        handleToggleBookmark();
        break;
      case 'open_history':
        handleOpenHubSection('history');
        break;
      case 'open_downloads':
        handleOpenHubSection('downloads');
        break;
      case 'toggle_bookmarks_bar':
        setShowBookmarksBar((b) => !b);
        break;
      case 'mute_tab':
        if (activeTab) handleToggleMuteTab(activeTab.id);
        break;
      case 'zoom_in':
        handleAdjustZoom('in');
        break;
      case 'zoom_out':
        handleAdjustZoom('out');
        break;
      case 'zoom_reset':
        handleAdjustZoom('reset');
        break;
      case 'toggle_fullscreen':
        if (isRustNativeShell()) {
          rustToggleFullscreen();
        } else if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        } else {
          void document.documentElement.requestFullscreen?.().catch(() => {});
        }
        break;
      case 'tab_1':
      case 'tab_2':
      case 'tab_3':
      case 'tab_4':
      case 'tab_5':
      case 'tab_6':
      case 'tab_7':
      case 'tab_8': {
        const idx = Number(cmd.slice(4)) - 1;
        const ordered = [...workspaceTabs].sort((a, b) => Number(b.pinned) - Number(a.pinned));
        if (ordered[idx]) handleSelectTab(ordered[idx].id);
        break;
      }
      case 'tab_last': {
        const ordered = [...workspaceTabs].sort((a, b) => Number(b.pinned) - Number(a.pinned));
        if (ordered.length > 0) handleSelectTab(ordered[ordered.length - 1].id);
        break;
      }
    }
  };

  const handleToggleBookmark = useCallback(() => {
    if (!activeTab) return;
    const exists = bookmarks.some((b) => b.url === activeTab.url);
    if (exists) {
      setBookmarks((prev) => prev.filter((b) => b.url !== activeTab.url));
    } else {
      setBookmarks((prev) => [
        ...prev,
        {
          id: `bm-${Date.now()}`,
          title: activeTab.title || deriveTitleFromUrl(activeTab.url),
          url: activeTab.url,
          category: 'Saved',
          pinnedToBar: true,
        },
      ]);
    }
  }, [activeTab, bookmarks]);

  const handleTranslateActiveTab = useCallback(
    async (targetLanguage: string | null) => {
      if (!activeTab) return;
      if (!targetLanguage) {
        setTranslatedTabs((prev) => ({ ...prev, [activeTab.id]: null }));
        return;
      }
      const cached = pageCache[activeTab.id];
      if (!cached) return;

      const paragraphs =
        cached.readerParagraphs && cached.readerParagraphs.length > 0
          ? cached.readerParagraphs
          : [cached.title || cached.finalUrl];

      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: cached.title,
            paragraphs,
            targetLanguage,
          }),
        });
        const data = await res.json();
        setTranslatedTabs((prev) => ({
          ...prev,
          [activeTab.id]: {
            targetLanguage,
            translatedTitle: data.translatedTitle ?? cached.title,
            translatedParagraphs: data.translatedParagraphs ?? paragraphs,
            provider: data.provider ?? 'fallback',
          },
        }));
      } catch {
        // Ignore translate errors silently
      }
    },
    [activeTab, pageCache]
  );

  const handleAddDownload = useCallback((filename: string, url: string) => {
    const scan = scanDownloadFilename(filename);
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newItem: DownloadItem = {
      id,
      filename,
      url,
      bytesReceived: scan.safe ? 20480 : 0,
      totalBytes: 262144,
      status: scan.safe ? 'downloading' : 'blocked',
      warning: scan.warning,
      startedAt: Date.now(),
    };
    setDownloads((prev) => [newItem, ...prev]);
  }, []);

  const handleOpenHubSection = useCallback(
    (section: HubSection) => {
      setHubInitialSection(section);
      handleOpenUrl('ferrox://hub');
    },
    [handleOpenUrl]
  );

  const handleClearData = useCallback(
    (scope: 'cache' | 'cookies' | 'history' | 'storage' | 'all') => {
      if (scope === 'cache' || scope === 'all') {
        setPageCache({});
        urlResponseCacheRef.current.clear();
      }
      if (scope === 'history' || scope === 'all') {
        setHistory([]);
      }
      if (scope === 'cookies' || scope === 'all') {
        setBlockedEvents([]);
      }
      if (scope === 'storage' || scope === 'all') {
        setSitePermissionsMap({});
      }
    },
    []
  );

  const handleImportProfileData = useCallback(
    (data: {
      bookmarks: BookmarkItem[];
      history: HistoryItem[];
      credentials: VaultCredential[];
    }) => {
      let newBookmarks = 0;
      let newHistory = 0;
      if (data.bookmarks.length > 0) {
        const seen = new Set(bookmarksRef.current.map((b) => b.url));
        const uniqueIncoming = data.bookmarks.filter((b) => {
          if (seen.has(b.url)) return false;
          seen.add(b.url);
          return true;
        });
        newBookmarks = uniqueIncoming.length;
        if (uniqueIncoming.length > 0) {
          bookmarksRef.current = [...bookmarksRef.current, ...uniqueIncoming];
          setBookmarks((prev) => {
            const curSeen = new Set(prev.map((b) => b.url));
            const fresh = uniqueIncoming.filter((b) => !curSeen.has(b.url));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      }
      if (data.history.length > 0) {
        const seenHist = new Set(historyRef.current.map((h) => h.url));
        const uniqueHist = data.history.filter((h) => {
          if (seenHist.has(h.url)) return false;
          seenHist.add(h.url);
          return true;
        });
        newHistory = uniqueHist.length;
        if (uniqueHist.length > 0) {
          historyRef.current = [...uniqueHist, ...historyRef.current].slice(0, 250);
          setHistory((prev) => [...uniqueHist, ...prev].slice(0, 250));
        }
      }
      if (data.credentials.length > 0) {
        setPendingImportedCredentials((prev) => [...data.credentials, ...prev]);
      }
      return {
        newBookmarks,
        newHistory,
        newCredentials: data.credentials.length,
      };
    },
    []
  );

  const handleSyncNativeProfile = useCallback((profileId: string) => {
    if (!isRustNativeShell()) return;
    setSyncingProfileId(profileId);
    requestRustImportProfile(profileId);
  }, []);

  const handleRescanProfiles = useCallback(() => {
    if (!isRustNativeShell()) return;
    setRescanningProfiles(true);
    requestRustDetectProfiles();
  }, []);

  const handleTrimMemory = useCallback(() => {
    if (isRustNativeShell()) {
      setLastTrimNotice('Trimming WebView2 working sets...');
      rustTrimMemory();
      return;
    }
    const beforeRam = budget.totalRamMb;
    let sleptCount = 0;
    const nextTabs = tabsRef.current.map((t) => {
      if (t.id !== activeTabIdRef.current && t.id !== splitTabId && !t.pinned && !t.hibernated) {
        sleptCount += 1;
        return { ...t, hibernated: true, estimatedRamMb: 8, estimatedCpuPercent: 0 };
      }
      return t;
    });
    if (sleptCount > 0) {
      setTabs(nextTabs);
    }
    urlResponseCacheRef.current.clear();
    const afterRam = nextTabs.reduce((s, t) => s + t.estimatedRamMb, 0);
    const saved = Math.max(0, beforeRam - afterRam);
    setLastTrimNotice(
      saved > 0
        ? `Trimmed cache & slept ${sleptCount} tab${sleptCount === 1 ? '' : 's'} · ${beforeRam} MB -> ${afterRam} MB (-${saved} MB)`
        : `Flushed page cache · active footprint ${afterRam} MB`
    );
  }, [budget.totalRamMb, splitTabId]);

  const renderTabContent = (tab: Tab, isSplitPane: boolean) => {
    const tabUrl = tab.url;

    if (tabUrl === 'ferrox://speed-dial') {
      return (
        <SpeedDialView
          bookmarks={bookmarks}
          limiter={limiter}
          totalRamMb={rustTelemetry?.ramMb ?? budget.totalRamMb}
          blockedTotal={blockedEvents.length}
          detectedProfilesCount={detectedProfiles.length}
          activeWorkspaceLabel={activeWorkspaceMeta.label}
          workspaceTabCount={workspaceTabs.length}
          onNavigate={(u) => navigateTab(tab.id, u)}
          onOpenBackgroundTab={handleOpenBackgroundTab}
          onHoverUrl={setHoveredUrl}
          onAddBookmark={(title, rawUrl) => {
            const normalized = normalizeAddressInput(rawUrl, searchEngine);
            setBookmarks((prev) => [
              ...prev,
              {
                id: `bm-${Date.now()}`,
                title,
                url: normalized,
                category: 'Custom',
                pinnedToBar: true,
              },
            ]);
          }}
          onOpenLimiter={() => setActiveDrawer('limiter')}
          onOpenShield={() => setActiveDrawer('privacy')}
          onQuickSync={() => {
            if (isRustNativeShell() && detectedProfiles.length > 0) {
              handleSyncNativeProfile('all');
            }
            navigateTab(tab.id, 'ferrox://settings');
          }}
        />
      );
    }

    if (tabUrl === 'ferrox://rust-source') {
      return <RustSourceView />;
    }

    if (tabUrl === 'ferrox://docs') {
      return <DocsView onOpenRustSource={() => navigateTab(tab.id, 'ferrox://rust-source')} />;
    }

    if (tabUrl === 'ferrox://settings') {
      return (
        <SettingsView
          accent={accent}
          customAccentHex={customAccentHex}
          surfaceTheme={surfaceTheme}
          searchEngine={searchEngine}
          hardwareAcceleration={privacyConfig.hardwareAcceleration}
          verticalTabs={verticalTabs}
          showBookmarksBar={showBookmarksBar}
          detectedProfiles={detectedProfiles}
          autoSyncBrowsers={autoSyncBrowsers}
          syncingProfileId={syncingProfileId}
          rescanningProfiles={rescanningProfiles}
          syncedProfileIds={syncedProfileIds}
          lastSyncSummary={lastSyncSummary}
          bookmarksCount={bookmarks.length}
          historyCount={history.length}
          onChangeAccent={setAccent}
          onChangeCustomAccentHex={setCustomAccentHex}
          onChangeSurfaceTheme={setSurfaceTheme}
          onChangeSearchEngine={setSearchEngine}
          onToggleHardwareAcceleration={() =>
            setPrivacyConfig((p) => ({ ...p, hardwareAcceleration: !p.hardwareAcceleration }))
          }
          onToggleVerticalTabs={() => setVerticalTabs((v) => !v)}
          onToggleBookmarksBar={() => setShowBookmarksBar((b) => !b)}
          onToggleAutoSyncBrowsers={() => setAutoSyncBrowsers((a) => !a)}
          onRescanProfiles={handleRescanProfiles}
          onSyncProfile={handleSyncNativeProfile}
          onOpenHubSection={handleOpenHubSection}
          onImportProfileData={handleImportProfileData}
          onClearHistory={() => setHistory([])}
          onResetDefaults={() => {
            setAccent('crimson');
            setCustomAccentHex('#FA1E4E');
            setSurfaceTheme('obsidian');
            setSearchEngine('google');
            setLimiter(DEFAULT_LIMITER_CONFIG);
            setBookmarks(DEFAULT_BOOKMARKS);
            setTrackerRules(DEFAULT_TRACKER_RULES);
            setShieldEnabled(true);
            setPrivacyConfig(DEFAULT_PRIVACY_CONFIG);
          }}
        />
      );
    }

    if (tabUrl === 'ferrox://hub') {
      return (
        <BrowserHubView
          key={hubInitialSection}
          initialSection={hubInitialSection}
          bookmarks={bookmarks}
          history={history}
          downloads={downloads}
          extensions={extensions}
          encryptedVault={encryptedVault}
          pendingImportedCredentials={pendingImportedCredentials}
          passwordSyncEnabled={privacyConfig.passwordSyncEnabled}
          autoUpdatesEnabled={privacyConfig.autoUpdatesEnabled}
          onNavigate={(u) => navigateTab(tab.id, u)}
          onAddBookmark={(bm) =>
            setBookmarks((prev) => [...prev, { ...bm, id: `bm-${Date.now()}` }])
          }
          onImportBookmarks={(items) => setBookmarks((prev) => [...prev, ...items])}
          onRemoveBookmark={(id) =>
            setBookmarks((prev) => prev.filter((b) => b.id !== id))
          }
          onToggleBookmarkBarPin={(id) =>
            setBookmarks((prev) =>
              prev.map((b) =>
                b.id === id ? { ...b, pinnedToBar: b.pinnedToBar === false } : b
              )
            )
          }
          onClearHistory={() => setHistory([])}
          onAddDownload={handleAddDownload}
          onTogglePauseDownload={(id) =>
            setDownloads((prev) =>
              prev.map((d) =>
                d.id === id
                  ? {
                      ...d,
                      status:
                        d.status === 'downloading'
                          ? 'paused'
                          : d.status === 'paused'
                          ? 'downloading'
                          : d.status,
                    }
                  : d
              )
            )
          }
          onRemoveDownload={(id) =>
            setDownloads((prev) => prev.filter((d) => d.id !== id))
          }
          onOpenDownloadFile={(path) => rustOpenDownloadFile(path)}
          onShowDownloadInFolder={(path) => rustShowDownloadInFolder(path)}
          onToggleExtension={(id) =>
            setExtensions((prev) =>
              prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
            )
          }
          onAddExtension={(ext) =>
            setExtensions((prev) => [...prev, { ...ext, id: `ext-${Date.now()}` }])
          }
          onRemoveExtension={(id) =>
            setExtensions((prev) => prev.filter((e) => e.id !== id))
          }
          onSaveEncryptedVault={(payload) => {
            setEncryptedVault(payload);
            try {
              localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(payload));
            } catch {
              // Ignore quota
            }
          }}
          onClearPendingImportedCredentials={() => setPendingImportedCredentials([])}
          onTogglePasswordSync={() =>
            setPrivacyConfig((p) => ({ ...p, passwordSyncEnabled: !p.passwordSyncEnabled }))
          }
          onToggleAutoUpdates={() =>
            setPrivacyConfig((p) => ({ ...p, autoUpdatesEnabled: !p.autoUpdatesEnabled }))
          }
          onAutofillActiveTab={(username, password) => {
            const target = tabs.find((t) => !t.url.startsWith('ferrox://')) ?? tab;
            setAutofillSignal({
              tabId: target.id,
              seq: autofillCounterRef.current++,
              username,
              password,
            });
            if (target.id !== tab.id) {
              handleSelectTab(target.id);
            }
          }}
        />
      );
    }

    return (
      <WebViewport
        url={tab.url}
        hibernated={tab.hibernated}
        loading={Boolean(loadingTabs[tab.id])}
        error={errorTabs[tab.id] ?? null}
        pageData={pageCache[tab.id] ?? null}
        readerMode={Boolean(readerModeTabs[tab.id])}
        translation={translatedTabs[tab.id] ?? null}
        extensions={extensions}
        zoomFactor={tabZooms[tab.id] ?? 1}
        autofillSignal={
          autofillSignal && autofillSignal.tabId === tab.id ? autofillSignal : null
        }
        findSignal={findSignal && findSignal.tabId === tab.id ? findSignal : null}
        onWakeTab={() => {
          if (isSplitPane) {
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tab.id ? { ...t, hibernated: false, lastActiveAt: Date.now() } : t
              )
            );
          } else {
            handleSelectTab(tab.id);
          }
        }}
        onRetry={() =>
          void fetchExternalUrl(tab.id, tab.url, {
            isPrivate: tab.isPrivate,
            forceReload: true,
          })
        }
        onNavigateUrl={(nextUrl) => navigateTab(tab.id, nextUrl)}
        onOpenBackgroundTab={handleOpenBackgroundTab}
        onOpenSpeedDial={() => navigateTab(tab.id, 'ferrox://speed-dial')}
        onProceedUnsafe={() =>
          void fetchExternalUrl(tab.id, tab.url, {
            bypassSafeBrowsing: true,
            isPrivate: tab.isPrivate,
          })
        }
        onExitReaderMode={() =>
          setReaderModeTabs((prev) => ({ ...prev, [tab.id]: false }))
        }
        onClearTranslation={() =>
          setTranslatedTabs((prev) => ({ ...prev, [tab.id]: null }))
        }
      />
    );
  };

  const activeOrigin = activeTab ? getOriginFromUrl(activeTab.url) : 'ferrox://internal';
  const activePageData = activeTab ? pageCache[activeTab.id] : undefined;
  const isBookmarked = Boolean(activeTab && bookmarks.some((b) => b.url === activeTab.url));
  const pipTab = pipTabId ? budget.tabs.find((t) => t.id === pipTabId) ?? null : null;
  const shelfDownload = downloadShelfId
    ? downloads.find((d) => d.id === downloadShelfId) ?? null
    : null;
  const mountedExternalTabs = useMemo(
    () =>
      budget.tabs.filter(
        (t) =>
          !t.url.startsWith('ferrox://') &&
          !t.hibernated &&
          t.id !== splitTab?.id &&
          (t.id === activeTab?.id || Boolean(pageCache[t.id]))
      ),
    [activeTab?.id, budget.tabs, pageCache, splitTab?.id]
  );

  const handleNewDefaultTab = useCallback(() => handleNewTab('ferrox://speed-dial', false), [handleNewTab]);
  const handleNewPrivateTab = useCallback(() => handleNewTab('ferrox://speed-dial', true), [handleNewTab]);
  const handleTogglePin = useCallback((id: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
  }, []);
  const handleToggleSplit = useCallback((id: string) => {
    setSplitTabId((curr) => (curr === id ? null : id === activeTabIdRef.current ? null : id));
  }, []);
  const handleToggleGroupCollapse = useCallback((groupId: string) => {
    setTabGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
    );
  }, []);
  const handleOpenTabSearch = useCallback(() => setTabSearchOpen(true), []);
  const handleToggleVerticalTabs = useCallback(() => setVerticalTabs((v) => !v), []);
  const handleToggleQuickSettings = useCallback(() => setQuickSettingsOpen((o) => !o), []);
  const handleCloseQuickSettings = useCallback(() => setQuickSettingsOpen(false), []);
  const handleToggleHardwareAcceleration = useCallback(() => {
    setPrivacyConfig((p) => ({ ...p, hardwareAcceleration: !p.hardwareAcceleration }));
  }, []);
  const handleToggleBookmarksBar = useCallback(() => setShowBookmarksBar((b) => !b), []);
  const handleOpenFullSettings = useCallback(() => handleOpenUrl('ferrox://settings'), [handleOpenUrl]);
  const handleResetZoom = useCallback(() => handleAdjustZoom('reset'), [handleAdjustZoom]);
  const handleChangeSitePermission = useCallback(
    (origin: string, key: keyof SitePermissions, val: PermissionValue) => {
      setSitePermissionsMap((prev) => ({
        ...prev,
        [origin]: { ...(prev[origin] ?? DEFAULT_SITE_PERMISSIONS), [key]: val },
      }));
    },
    []
  );
  const handleHome = useCallback(() => handleOpenUrl('ferrox://speed-dial'), [handleOpenUrl]);
  const handleToggleReaderMode = useCallback(() => {
    const id = activeTabIdRef.current;
    if (!id) return;
    setReaderModeTabs((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const handleTranslateToolbar = useCallback(
    (lang: string | null) => void handleTranslateActiveTab(lang),
    [handleTranslateActiveTab]
  );
  const handleTogglePip = useCallback(() => {
    const id = activeTabIdRef.current;
    if (!id) return;
    setPipTabId((curr) => (curr === id ? null : id));
  }, []);
  const handleOpenDownloads = useCallback(() => handleOpenHubSection('downloads'), [handleOpenHubSection]);
  const handleOpenExtensions = useCallback(() => handleOpenHubSection('extensions'), [handleOpenHubSection]);
  const handleOpenBookmarksManager = useCallback(() => handleOpenHubSection('bookmarks'), [handleOpenHubSection]);
  const handleOpenShield = useCallback(() => {
    setActiveDrawer((d) => (d === 'privacy' ? null : 'privacy'));
  }, []);
  const handleOpenLimiter = useCallback(() => {
    setActiveDrawer((d) => (d === 'limiter' ? null : 'limiter'));
  }, []);
  const handleUnpinFromBar = useCallback((id: string) => {
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, pinnedToBar: false } : b))
    );
  }, []);
  const handleToggleDrawer = useCallback((drawer: Exclude<DrawerTab, null>) => {
    setActiveDrawer((curr) => (curr === drawer ? null : drawer));
  }, []);

  const activeDownloadsCount = useMemo(
    () => downloads.filter((d) => d.status === 'downloading').length,
    [downloads]
  );
  const enabledExtensionsCount = useMemo(
    () => extensions.filter((e) => e.enabled).length,
    [extensions]
  );

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden text-[#ECEFF4]"
      style={{ backgroundColor: 'var(--fx-bg)' }}
    >
      {/* Top Tab Bar (Top-left strictly tabs only) */}
      <TabStrip
        tabs={workspaceTabs}
        tabGroups={tabGroups}
        activeTabId={activeTab?.id ?? null}
        splitTabId={splitTab?.id ?? null}
        activeWorkspaceLabel={activeWorkspaceMeta.label}
        verticalTabs={verticalTabs}
        quickSettingsOpen={quickSettingsOpen}
        canReopenClosedTab={closedTabsCount > 0}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onDuplicateTab={handleDuplicateTab}
        onReloadTab={handleReloadTabById}
        onHibernateTab={handleHibernateTabById}
        onCloseOtherTabs={handleCloseOtherTabs}
        onCloseTabsToRight={handleCloseTabsToRight}
        onToggleMuteTab={handleToggleMuteTab}
        onReorderTab={handleReorderTab}
        onDetachTab={handleDetachTab}
        onReopenClosedTab={handleReopenClosedTab}
        onNewTab={handleNewDefaultTab}
        onNewPrivateTab={handleNewPrivateTab}
        onTogglePin={handleTogglePin}
        onToggleSplit={handleToggleSplit}
        onToggleGroupCollapse={handleToggleGroupCollapse}
        onOpenTabSearch={handleOpenTabSearch}
        onToggleVerticalTabs={handleToggleVerticalTabs}
        onToggleQuickSettings={handleToggleQuickSettings}
        onContextMenuOpenChange={setTabContextMenuOpen}
        onDragOverlayChange={setTabDragOverlayOpen}
        onHoverUrl={setHoveredUrl}
      />

      <QuickSettingsPopover
        open={quickSettingsOpen}
        accent={accent}
        customAccentHex={customAccentHex}
        surfaceTheme={surfaceTheme}
        hardwareAcceleration={privacyConfig.hardwareAcceleration}
        verticalTabs={verticalTabs}
        showBookmarksBar={showBookmarksBar}
        onClose={handleCloseQuickSettings}
        onChangeAccent={setAccent}
        onChangeCustomAccentHex={setCustomAccentHex}
        onChangeSurfaceTheme={setSurfaceTheme}
        onToggleHardwareAcceleration={handleToggleHardwareAcceleration}
        onToggleVerticalTabs={handleToggleVerticalTabs}
        onToggleBookmarksBar={handleToggleBookmarksBar}
        onOpenFullSettings={handleOpenFullSettings}
      />

      {/* Address & Control Toolbar */}
      <AddressToolbar
        currentUrl={activeTab?.url ?? 'ferrox://speed-dial'}
        isPrivateTab={Boolean(activeTab?.isPrivate)}
        canBack={Boolean(activeTab && (canGoBack(activeTab) || (isRustNativeShell() && !activeTab.url.startsWith('ferrox://'))))}
        canForward={Boolean(activeTab && (canGoForward(activeTab) || (isRustNativeShell() && !activeTab.url.startsWith('ferrox://'))))}
        isLoading={Boolean(activeTab && loadingTabs[activeTab.id])}
        isBookmarked={isBookmarked}
        showBookmarksBar={showBookmarksBar}
        readerModeActive={Boolean(activeTab && readerModeTabs[activeTab.id])}
        translatedLang={
          activeTab ? translatedTabs[activeTab.id]?.targetLanguage ?? null : null
        }
        pipActive={Boolean(pipTab)}
        shieldEnabled={shieldEnabled}
        vpnEnabled={privacyConfig.vpnEnabled}
        vpnPingMs={currentVpnServer?.latencyMs}
        vpnRegion={privacyConfig.vpnRegion}
        httpsOnly={privacyConfig.httpsOnly}
        upgradedFromHttp={activePageData?.upgradedFromHttp}
        insecureHttp={activePageData?.insecureHttpWarning}
        blockedCount={blockedEvents.length}
        activeDownloadsCount={activeDownloadsCount}
        enabledExtensionsCount={enabledExtensionsCount}
        totalRamMb={rustTelemetry?.ramMb ?? budget.totalRamMb}
        ramLimitMb={limiter.ramLimitMb}
        ramLimiterEnabled={limiter.ramEnabled}
        sitePermissions={sitePermissionsMap[activeOrigin] ?? DEFAULT_SITE_PERMISSIONS}
        omniboxInputRef={omniboxInputRef}
        zoomFactor={activeTab ? tabZooms[activeTab.id] ?? 1 : 1}
        onResetZoom={handleResetZoom}
        onChangeSitePermission={handleChangeSitePermission}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onHome={handleHome}
        onNavigate={handleOpenUrl}
        onToggleBookmark={handleToggleBookmark}
        onToggleBookmarksBar={handleToggleBookmarksBar}
        onToggleReaderMode={handleToggleReaderMode}
        onTranslatePage={handleTranslateToolbar}
        onTogglePip={handleTogglePip}
        onOpenDownloads={handleOpenDownloads}
        onOpenExtensions={handleOpenExtensions}
        onOpenShield={handleOpenShield}
        onOpenLimiter={handleOpenLimiter}
        onPopoverOpenChange={setToolbarPopoverOpen}
      />

      {/* Optional Slim Bookmarks Bar */}
      {showBookmarksBar && (
        <BookmarksBar
          bookmarks={bookmarks}
          onNavigate={handleOpenUrl}
          onOpenBackgroundTab={handleOpenBackgroundTab}
          onHoverUrl={setHoveredUrl}
          onUnpinFromBar={handleUnpinFromBar}
          onOpenManager={handleOpenBookmarksManager}
        />
      )}

      {/* Slim Find-in-Page Bar (positioned above mainViewportRef so native WebView2 HWND shifts smoothly beneath it) */}
      <FindInPageBar
        open={findOpen}
        query={findQuery}
        onChangeQuery={(q) => {
          setFindQuery(q);
          handleFindStep(q, false);
        }}
        onFindNext={() => handleFindStep(findQuery, false)}
        onFindPrev={() => handleFindStep(findQuery, true)}
        onClose={handleCloseFind}
      />

      {/* Main Browser Body: Minimal 5-icon Sidebar + Optional Vertical Tab Rail + Optional Drawer + Viewport / Split Viewport */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <BrowserSidebar
          activeDrawer={activeDrawer}
          activeUrl={activeTab?.url ?? ''}
          vpnEnabled={privacyConfig.vpnEnabled}
          vpnPingMs={currentVpnServer?.latencyMs}
          activeWorkspaceLabel={activeWorkspaceMeta.label}
          activeWorkspaceTabCount={workspaceTabs.length}
          onToggleDrawer={handleToggleDrawer}
          onNavigateInternal={handleOpenUrl}
        />

        {verticalTabs && (
          <VerticalTabRail
            tabs={workspaceTabs}
            tabGroups={tabGroups}
            activeTabId={activeTab?.id ?? null}
            splitTabId={splitTab?.id ?? null}
            canReopenClosedTab={closedTabsCount > 0}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onDuplicateTab={handleDuplicateTab}
            onReloadTab={handleReloadTabById}
            onHibernateTab={handleHibernateTabById}
            onCloseOtherTabs={handleCloseOtherTabs}
            onCloseTabsToRight={handleCloseTabsToRight}
            onToggleMuteTab={handleToggleMuteTab}
            onReorderTab={handleReorderTab}
            onDetachTab={handleDetachTab}
            onReopenClosedTab={handleReopenClosedTab}
            onNewTab={handleNewDefaultTab}
            onNewPrivateTab={handleNewPrivateTab}
            onTogglePin={handleTogglePin}
            onToggleSplit={handleToggleSplit}
            onToggleGroupCollapse={handleToggleGroupCollapse}
            onOpenTabSearch={handleOpenTabSearch}
            onContextMenuOpenChange={setTabContextMenuOpen}
            onDragOverlayChange={setTabDragOverlayOpen}
            onHoverUrl={setHoveredUrl}
          />
        )}

        <Drawers
          activeDrawer={activeDrawer}
          limiter={limiter}
          tabs={budget.tabs}
          workspaceTabs={workspaceTabs}
          tabGroups={tabGroups}
          activeTabId={activeTab?.id ?? null}
          splitTabId={splitTab?.id ?? null}
          activeWorkspace={activeWorkspace}
          verticalTabs={verticalTabs}
          totalRamMb={rustTelemetry?.ramMb ?? budget.totalRamMb}
          totalCpuPercent={rustTelemetry?.cpuPercent ?? budget.totalCpuPercent}
          processCount={rustTelemetry?.processCount}
          lastTrimNotice={lastTrimNotice}
          shieldEnabled={shieldEnabled}
          trackerRules={trackerRules}
          blockedEvents={blockedEvents}
          privacyConfig={privacyConfig}
          userGeo={userGeo}
          vpnServers={vpnServers}
          vpnPinging={vpnPinging}
          onRefreshVpnPing={handleRefreshVpnPing}
          onClose={() => setActiveDrawer(null)}
          onUpdateLimiter={setLimiter}
          onTrimMemory={handleTrimMemory}
          onHibernateInactive={() => {
            if (isRustNativeShell()) {
              sendToRust('hibernate_inactive');
            }
            setTabs((prev) =>
              prev.map((t) =>
                t.id !== activeTab?.id && t.id !== splitTab?.id && !t.pinned
                  ? { ...t, hibernated: true, estimatedRamMb: 8, estimatedCpuPercent: 0 }
                  : t
              )
            );
          }}
          onHibernateTab={(tabId) => {
            if (tabId === activeTab?.id || tabId === splitTab?.id) return;
            if (isRustNativeShell()) {
              rustHibernateTab(tabId);
            }
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tabId
                  ? { ...t, hibernated: true, estimatedRamMb: 8, estimatedCpuPercent: 0 }
                  : t
              )
            );
          }}
          onSelectTab={handleSelectTab}
          onSelectWorkspace={handleSelectWorkspace}
          onToggleVerticalTabs={() => setVerticalTabs((v) => !v)}
          onSetSplitTab={(id) => setSplitTabId(id)}
          onCreateTabGroup={(name: string, color: TabGroupColor, assignActive: boolean) => {
            const gid = `grp-${Date.now()}`;
            setTabGroups((prev) => [...prev, { id: gid, name, color, collapsed: false }]);
            if (assignActive && activeTab) {
              setTabs((prev) =>
                prev.map((t) => (t.id === activeTab.id ? { ...t, groupId: gid } : t))
              );
            }
          }}
          onAssignTabGroup={(tabId, groupId) =>
            setTabs((prev) =>
              prev.map((t) => (t.id === tabId ? { ...t, groupId } : t))
            )
          }
          onToggleGroupCollapse={(groupId) =>
            setTabGroups((prev) =>
              prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
            )
          }
          onToggleShield={() => setShieldEnabled((s) => !s)}
          onAddTrackerRule={(domain) =>
            setTrackerRules((prev) => (prev.includes(domain) ? prev : [domain, ...prev]))
          }
          onRemoveTrackerRule={(domain) =>
            setTrackerRules((prev) => prev.filter((r) => r !== domain))
          }
          onUpdatePrivacyConfig={setPrivacyConfig}
          onNewPrivateTab={() => handleNewTab('ferrox://speed-dial', true)}
          onOpenUrl={(url) => handleOpenUrl(url)}
          onClearData={handleClearData}
        />

        <main
          ref={mainViewportRef}
          className="flex flex-1 min-w-0 min-h-0 overflow-hidden"
          style={{ backgroundColor: 'var(--fx-bg)' }}
        >
          {/* Keep live external tab viewports mounted (hidden when inactive) so scroll & DOM state stay cached across tab switches */}
          {mountedExternalTabs.map((extTab) => (
            <div
              key={extTab.id}
              className={
                activeTab?.id === extTab.id
                  ? 'flex-1 min-w-0 min-h-0 overflow-hidden'
                  : 'hidden'
              }
            >
              {renderTabContent(extTab, false)}
            </div>
          ))}

          {/* Render internal ferrox:// views or hibernated external tab */}
          {activeTab && (activeTab.url.startsWith('ferrox://') || activeTab.hibernated) && (
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
              {renderTabContent(activeTab, false)}
            </div>
          )}

          {/* Render Speed Dial cockpit cleanly when active workspace has 0 tabs open */}
          {!activeTab && (
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
              <SpeedDialView
                bookmarks={bookmarks}
                limiter={limiter}
                totalRamMb={rustTelemetry?.ramMb ?? budget.totalRamMb}
                blockedTotal={blockedEvents.length}
                detectedProfilesCount={detectedProfiles.length}
                activeWorkspaceLabel={activeWorkspaceMeta.label}
                workspaceTabCount={0}
                onNavigate={handleOpenUrl}
                onOpenBackgroundTab={handleOpenBackgroundTab}
                onHoverUrl={setHoveredUrl}
                onAddBookmark={(title, rawUrl) => {
                  const normalized = normalizeAddressInput(rawUrl, searchEngine);
                  setBookmarks((prev) => [
                    ...prev,
                    {
                      id: `bm-${Date.now()}`,
                      title,
                      url: normalized,
                      category: 'Custom',
                      pinnedToBar: true,
                    },
                  ]);
                }}
                onOpenLimiter={() => setActiveDrawer('limiter')}
                onOpenShield={() => setActiveDrawer('privacy')}
                onQuickSync={() => {
                  if (isRustNativeShell() && detectedProfiles.length > 0) {
                    handleSyncNativeProfile('all');
                  }
                  handleOpenUrl('ferrox://settings');
                }}
              />
            </div>
          )}

          {splitTab && (
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden border-l border-white/15 flex flex-col">
              <div
                className="flex items-center justify-between px-3 h-8 border-b border-white/10 text-xs shrink-0"
                style={{ backgroundColor: 'var(--fx-panel)' }}
              >
                <span className="truncate text-slate-300 font-medium">
                  Split Pane: {splitTab.title}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSelectTab(splitTab.id)}
                    className="text-[11px] text-sky-400 hover:underline"
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitTabId(null)}
                    className="text-[11px] text-slate-400 hover:text-white"
                  >
                    Close Split
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {renderTabContent(splitTab, true)}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Slim Native Download Shelf (outside mainViewportRef so WebView2 resizes cleanly above it) */}
      {shelfDownload && (
        <div
          className="flex items-center justify-between gap-3 h-9 px-4 border-t border-white/10 shrink-0 text-xs"
          style={{ backgroundColor: 'var(--fx-panel)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <DownloadIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-white truncate">{shelfDownload.filename}</span>
            <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
              {shelfDownload.status === 'downloading'
                ? 'Downloading...'
                : shelfDownload.status === 'completed'
                ? 'Completed'
                : 'Flagged'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {shelfDownload.status === 'completed' && shelfDownload.savedPath && (
              <>
                <button
                  type="button"
                  onClick={() => rustOpenDownloadFile(shelfDownload.savedPath!)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/18 text-[11px] text-white"
                >
                  <ExternalLink className="w-3 h-3" /> Open
                </button>
                <button
                  type="button"
                  onClick={() => rustShowDownloadInFolder(shelfDownload.savedPath!)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/8 hover:bg-white/14 text-[11px] text-slate-200"
                >
                  <FolderOpen className="w-3 h-3" /> Show in Folder
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setDownloadShelfId(null);
                handleOpenHubSection('downloads');
              }}
              className="px-2 py-1 rounded bg-white/6 hover:bg-white/12 text-[11px] text-slate-300 hover:text-white"
            >
              All Downloads
            </button>
            <button
              type="button"
              onClick={() => setDownloadShelfId(null)}
              aria-label="Dismiss download bar"
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tab Search Modal (Ctrl+K) */}
      <TabSearchModal
        open={tabSearchOpen}
        tabs={budget.tabs}
        activeTabId={activeTab?.id ?? null}
        onClose={() => setTabSearchOpen(false)}
        onSelectTab={(tab) => handleSelectTab(tab.id)}
        onSplitWithTab={(tab) => setSplitTabId(tab.id)}
      />

      {/* Floating Picture-in-Picture Window */}
      <PipWindow
        tab={pipTab}
        pageData={pipTab ? pageCache[pipTab.id] ?? null : null}
        onRestoreTab={(id) => handleSelectTab(id)}
        onClose={() => setPipTabId(null)}
      />

      {/* Detached Browser Windows (dragged out from tab strip or Ctrl+N) */}
      {detachedWindows.map((win) => (
        <DetachedWindow
          key={win.windowId}
          win={win}
          canBack={canGoBack(win.tab)}
          canForward={canGoForward(win.tab)}
          isLoading={Boolean(loadingTabs[win.tab.id])}
          onFocus={handleFocusDetachedWindow}
          onMove={handleMoveDetachedWindow}
          onResize={handleResizeDetachedWindow}
          onToggleMaximize={handleToggleMaximizeDetachedWindow}
          onDockBack={handleDockDetachedWindow}
          onClose={handleCloseDetachedWindow}
          onNavigate={handleNavigateDetachedWindow}
          onBack={handleDetachedBack}
          onForward={handleDetachedForward}
          onReload={handleDetachedReload}
        >
          {win.tab.url === 'ferrox://speed-dial' ? (
            <SpeedDialView
              bookmarks={bookmarks}
              limiter={limiter}
              totalRamMb={rustTelemetry?.ramMb ?? budget.totalRamMb}
              blockedTotal={blockedEvents.length}
              detectedProfilesCount={detectedProfiles.length}
              activeWorkspaceLabel="New Window"
              workspaceTabCount={1}
              onNavigate={(u) => handleNavigateDetachedWindow(win.windowId, u)}
              onOpenBackgroundTab={handleOpenBackgroundTab}
              onHoverUrl={setHoveredUrl}
              onAddBookmark={(title, rawUrl) => {
                const normalized = normalizeAddressInput(rawUrl, searchEngine);
                setBookmarks((prev) => [
                  ...prev,
                  {
                    id: `bm-${Date.now()}`,
                    title,
                    url: normalized,
                    category: 'Custom',
                    pinnedToBar: true,
                  },
                ]);
              }}
              onOpenLimiter={() => setActiveDrawer('limiter')}
              onOpenShield={() => setActiveDrawer('privacy')}
            />
          ) : (
            renderTabContent(win.tab, false)
          )}
        </DetachedWindow>
      ))}

      {/* Classic Browser Hover URL Status Bar Pill */}
      {hoveredUrl && (
        <div
          aria-live="off"
          className="fixed left-14 bottom-2 z-40 max-w-[460px] px-2.5 py-1 rounded-md border border-white/12 bg-[#0E1118]/92 backdrop-blur-md text-[11px] font-mono-tabular text-slate-300 truncate pointer-events-none shadow-lg"
        >
          {hoveredUrl}
        </div>
      )}
    </div>
  );
}
