import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCENT_THEMES,
  AccentThemeId,
  BlockedEvent,
  BookmarkItem,
  BrowserExtension,
  canGoBack,
  canGoForward,
  createTab,
  DEFAULT_BOOKMARKS,
  DEFAULT_EXTENSIONS,
  DEFAULT_LIMITER_CONFIG,
  DEFAULT_PRIVACY_CONFIG,
  DEFAULT_SITE_PERMISSIONS,
  DEFAULT_TRACKER_RULES,
  deriveTitleFromUrl,
  DownloadItem,
  evaluateResourceBudget,
  evaluateUrlSecurity,
  getOriginFromUrl,
  hexToRgbaSoft,
  HistoryItem,
  LimiterConfig,
  normalizeAddressInput,
  PermissionValue,
  PrivacySecurityConfig,
  scanDownloadFilename,
  SearchEngineId,
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
  WorkspaceId,
} from './lib/browserEngine';
import { EncryptedVaultPayload, VaultCredential } from './lib/vaultCrypto';
import { TabStrip, VerticalTabRail } from './components/TabStrip';
import { AddressToolbar } from './components/AddressToolbar';
import { BookmarksBar } from './components/BookmarksBar';
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
import { QuickSettingsPopover } from './components/QuickSettingsPopover';
import {
  isRustNativeShell,
  RustSyncPayload,
  sendToRust,
  syncRustLimiter,
  syncRustSearchEngine,
  syncRustTheme,
} from './lib/rustBridge';

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
  privacyConfig: PrivacySecurityConfig;
  sitePermissionsMap: Record<string, SitePermissions>;
  extensions: BrowserExtension[];
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
    initialSaved.searchEngine ?? 'duckduckgo'
  );
  const [limiter, setLimiter] = useState<LimiterConfig>(
    initialSaved.limiter ?? DEFAULT_LIMITER_CONFIG
  );
  const [shieldEnabled, setShieldEnabled] = useState<boolean>(
    initialSaved.shieldEnabled ?? true
  );
  const [trackerRules, setTrackerRules] = useState<string[]>(
    initialSaved.trackerRules ?? DEFAULT_TRACKER_RULES
  );
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(
    initialSaved.bookmarks ?? DEFAULT_BOOKMARKS
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

  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('personal');
  const [tabs, setTabs] = useState<Tab[]>(() => [
    createTab('tab-1', 'personal', 'ferrox://speed-dial'),
  ]);
  const [tabGroups, setTabGroups] = useState<TabGroup[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<DrawerTab>(null);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [toolbarPopoverOpen, setToolbarPopoverOpen] = useState(false);
  const [pendingImportedCredentials, setPendingImportedCredentials] = useState<VaultCredential[]>([]);
  const [tabSearchOpen, setTabSearchOpen] = useState(false);
  const [hubInitialSection, setHubInitialSection] = useState<HubSection>('bookmarks');

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

  const [rustTelemetry, setRustTelemetry] = useState<{ ramMb: number; cpuPercent: number } | null>(
    null
  );

  const tabCounterRef = useRef(2);
  const autofillCounterRef = useRef(1);
  const mainViewportRef = useRef<HTMLElement>(null);
  const rustInitializedRef = useRef(false);
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

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

  // Global Ctrl+K / Cmd+K shortcut for Tab Search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setTabSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Persist user preferences, permissions, extensions, and non-private history
  useEffect(() => {
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
        privacyConfig,
        sitePermissionsMap,
        extensions,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
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
    privacyConfig,
    sitePermissionsMap,
    extensions,
  ]);

  // Native Rust desktop shell sync (live sysinfo telemetry + persisted config.json hydration)
  useEffect(() => {
    if (!isRustNativeShell()) return;
    window.__ferroxSync = (payload: RustSyncPayload) => {
      setRustTelemetry({
        ramMb: payload.ramMb ?? 0,
        cpuPercent: Number((payload.cpuPercent ?? 0).toFixed(1)),
      });
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
          payload.searchEngine === 'duckduckgo' ||
          payload.searchEngine === 'wikipedia' ||
          payload.searchEngine === 'crates'
        ) {
          setSearchEngine(payload.searchEngine);
        }
        if (typeof payload.verticalTabs === 'boolean') {
          setVerticalTabs(payload.verticalTabs);
        }
        if (typeof payload.showBookmarksBar === 'boolean') {
          setShowBookmarksBar(payload.showBookmarksBar);
        }
        setPrivacyConfig((prev) => ({
          ...prev,
          hardwareAcceleration: payload.hardwareAcceleration ?? prev.hardwareAcceleration,
          vpnEnabled: payload.vpnEnabled ?? prev.vpnEnabled,
          vpnRegion: payload.vpnRegion ?? prev.vpnRegion,
        }));
      }
    };
    window.__ferroxContentUpdate = (update) => {
      const currentId = activeTabIdRef.current;
      if (!currentId) return;
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== currentId || t.url.startsWith('ferrox://')) return t;
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
          return { ...t, url: nextUrl, title: nextTitle };
        })
      );
    };
    sendToRust('ready');
    return () => {
      delete window.__ferroxSync;
      delete window.__ferroxContentUpdate;
    };
  }, []);

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
    sendToRust('set_privacy', {
      httpsOnly: privacyConfig.httpsOnly,
      safeBrowsing: privacyConfig.safeBrowsing,
      fingerprintProtection: privacyConfig.fingerprintProtection,
      vpnEnabled: privacyConfig.vpnEnabled,
      vpnRegion: privacyConfig.vpnRegion,
    });
  }, [
    privacyConfig.httpsOnly,
    privacyConfig.safeBrowsing,
    privacyConfig.fingerprintProtection,
    privacyConfig.vpnEnabled,
    privacyConfig.vpnRegion,
  ]);

  // Progress active downloads smoothly
  useEffect(() => {
    const hasDownloading = downloads.some((d) => d.status === 'downloading');
    if (!hasDownloading) return;
    const timer = setInterval(() => {
      setDownloads((prev) =>
        prev.map((d) => {
          if (d.status !== 'downloading') return d;
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
  }, [downloads]);

  const budget = useMemo(
    () => evaluateResourceBudget(tabs, activeTabId, limiter, splitTabId),
    [tabs, activeTabId, limiter, splitTabId]
  );

  // Apply automatic hibernation when RAM limit triggers
  useEffect(() => {
    if (budget.hibernatedIds.length > 0) {
      setTabs(budget.tabs);
    }
  }, [budget.hibernatedIds, budget.tabs]);

  const workspaceTabs = useMemo(
    () => budget.tabs.filter((t) => t.workspace === activeWorkspace),
    [budget.tabs, activeWorkspace]
  );

  const activeTab = useMemo(
    () => budget.tabs.find((t) => t.id === activeTabId) ?? workspaceTabs[0] ?? null,
    [budget.tabs, activeTabId, workspaceTabs]
  );

  const splitTab = useMemo(
    () => (splitTabId && splitTabId !== activeTab?.id ? budget.tabs.find((t) => t.id === splitTabId) ?? null : null),
    [budget.tabs, splitTabId, activeTab?.id]
  );

  // Keep native Rust content_webview aligned with the active viewport pane & hidden behind overlays/ferrox:// routes
  useEffect(() => {
    if (!isRustNativeShell()) return;
    if (activeTab?.url.startsWith('ferrox://')) {
      sendToRust('set_active_url', { url: activeTab.url });
    }
    const syncLayout = () => {
      const container = (mainViewportRef.current?.firstElementChild as HTMLElement | null) ?? mainViewportRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const isExternal = Boolean(
        activeTab && !activeTab.url.startsWith('ferrox://') && !activeTab.hibernated
      );
      const overlayBlocks =
        quickSettingsOpen || tabSearchOpen || toolbarPopoverOpen || Boolean(pipTabId);
      sendToRust('layout', {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        visible: isExternal && !overlayBlocks,
      });
    };
    syncLayout();
    const observer =
      typeof ResizeObserver !== 'undefined' && mainViewportRef.current
        ? new ResizeObserver(syncLayout)
        : null;
    if (observer && mainViewportRef.current) {
      observer.observe(mainViewportRef.current);
    }
    window.addEventListener('resize', syncLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncLayout);
    };
  }, [
    activeTab,
    activeDrawer,
    pipTabId,
    quickSettingsOpen,
    showBookmarksBar,
    splitTab,
    tabSearchOpen,
    toolbarPopoverOpen,
    verticalTabs,
  ]);

  const fetchExternalUrl = useCallback(
    async (tabId: string, url: string, options?: { bypassSafeBrowsing?: boolean; isPrivate?: boolean }) => {
      if (url.startsWith('ferrox://')) return;

      const sec = evaluateUrlSecurity(
        url,
        privacyConfig.httpsOnly,
        options?.bypassSafeBrowsing ? false : privacyConfig.safeBrowsing
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
      if (sec.upgradedFromHttp) {
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, url: targetUrl } : t))
        );
      }

      const blockCheck = shouldBlockUrl(targetUrl, shieldEnabled, trackerRules);
      if (blockCheck.blocked && blockCheck.matchedRule) {
        setBlockedEvents((prev) => [
          {
            id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            host: blockCheck.matchedRule!,
            pageUrl: targetUrl,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
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
        sendToRust('navigate', { url: targetUrl });
        setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
        setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
        if (!options?.isPrivate) {
          setHistory((prev) => [
            {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: deriveTitleFromUrl(targetUrl),
              url: targetUrl,
              visitedAt: Date.now(),
            },
            ...prev,
          ]);
        }
        return;
      }

      setLoadingTabs((prev) => ({ ...prev, [tabId]: true }));
      setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
      setTranslatedTabs((prev) => ({ ...prev, [tabId]: null }));

      try {
        const params = new URLSearchParams({
          url: targetUrl,
          shield: shieldEnabled ? '1' : '0',
          fp: privacyConfig.fingerprintProtection ? '1' : '0',
          limitKbps: limiter.netEnabled ? String(limiter.netLimitKbps) : '0',
          rules: trackerRules.join(','),
        });
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

        setPageCache((prev) => ({ ...prev, [tabId]: loaded }));
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, title: loaded.title } : t))
        );

        if (loaded.blockedTrackers.length > 0) {
          setBlockedEvents((prev) => [
            ...loaded.blockedTrackers.map((host) => ({
              id: `blk-${Date.now()}-${host}-${Math.random().toString(36).slice(2, 6)}`,
              host,
              pageUrl: loaded.finalUrl,
              timestamp: Date.now(),
            })),
            ...prev,
          ]);
        }

        // Private Browsing: never retain browsing history
        if (!options?.isPrivate) {
          setHistory((prev) => [
            {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: loaded.title,
              url: loaded.finalUrl,
              visitedAt: Date.now(),
            },
            ...prev,
          ]);
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
      shieldEnabled,
      trackerRules,
    ]
  );

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
        setErrorTabs((prev) => ({ ...prev, [tabId]: null }));
        setLoadingTabs((prev) => ({ ...prev, [tabId]: false }));
      }
    },
    [fetchExternalUrl, searchEngine, tabs]
  );

  const handleOpenUrl = useCallback(
    (rawInput: string) => {
      if (!activeTab) return;
      navigateTab(activeTab.id, rawInput);
    },
    [activeTab, navigateTab]
  );

  const handleNewTab = useCallback(
    (initialUrl: string = 'ferrox://speed-dial', isPrivate: boolean = false) => {
      const id = `tab-${tabCounterRef.current++}`;
      const newTab = createTab(id, activeWorkspace, initialUrl, Date.now(), { isPrivate });
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      if (isPrivate && privacyConfig.vpnAutoConnectPrivate && !privacyConfig.vpnEnabled) {
        setPrivacyConfig((prev) => ({ ...prev, vpnEnabled: true }));
      }
      if (!newTab.url.startsWith('ferrox://')) {
        void fetchExternalUrl(id, newTab.url, { isPrivate });
      }
    },
    [activeWorkspace, fetchExternalUrl, privacyConfig.vpnAutoConnectPrivate, privacyConfig.vpnEnabled]
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      const closing = tabs.find((t) => t.id === id);
      if (closing?.isPrivate) {
        // Purge private tab cache immediately on close
        setPageCache((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      if (splitTabId === id) {
        setSplitTabId(null);
      }
      if (pipTabId === id) {
        setPipTabId(null);
      }

      if (id === activeTabId) {
        const wsRemaining = tabs.filter((t) => t.id !== id && t.workspace === activeWorkspace);
        const fallback = wsRemaining[wsRemaining.length - 1];
        if (fallback && !fallback.url.startsWith('ferrox://') && isRustNativeShell()) {
          sendToRust('navigate', { url: fallback.url });
        }
      }

      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        const wsRemaining = remaining.filter((t) => t.workspace === activeWorkspace);

        if (wsRemaining.length === 0) {
          const replacement = createTab(
            `tab-${tabCounterRef.current++}`,
            activeWorkspace,
            'ferrox://speed-dial'
          );
          setActiveTabId(replacement.id);
          return [...remaining, replacement];
        }

        if (id === activeTabId) {
          setActiveTabId(wsRemaining[wsRemaining.length - 1].id);
        }
        return remaining;
      });
    },
    [activeTabId, activeWorkspace, pipTabId, splitTabId, tabs]
  );

  const handleSelectWorkspace = useCallback(
    (ws: WorkspaceId) => {
      setActiveWorkspace(ws);
      setSplitTabId(null);
      const existing = tabs.find((t) => t.workspace === ws);
      if (existing) {
        setActiveTabId(existing.id);
        if (!existing.url.startsWith('ferrox://') && isRustNativeShell()) {
          sendToRust('navigate', { url: existing.url });
        }
      } else {
        const fresh = createTab(`tab-${tabCounterRef.current++}`, ws, 'ferrox://speed-dial');
        setTabs((prev) => [...prev, fresh]);
        setActiveTabId(fresh.id);
      }
    },
    [tabs]
  );

  const handleSelectTab = useCallback(
    (id: string) => {
      const target = tabs.find((t) => t.id === id);
      if (target && target.workspace !== activeWorkspace) {
        setActiveWorkspace(target.workspace);
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, hibernated: false, lastActiveAt: Date.now() } : t
        )
      );
      setActiveTabId(id);
      if (target && !target.url.startsWith('ferrox://')) {
        if (isRustNativeShell()) {
          sendToRust('navigate', { url: target.url });
        } else if (!pageCache[id]) {
          void fetchExternalUrl(id, target.url, { isPrivate: target.isPrivate });
        }
      }
    },
    [activeWorkspace, fetchExternalUrl, pageCache, tabs]
  );

  const handleBack = useCallback(() => {
    if (!activeTab || !canGoBack(activeTab)) return;
    const nextTab = stepBack(activeTab);
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? nextTab : t)));
    if (!nextTab.url.startsWith('ferrox://')) {
      void fetchExternalUrl(activeTab.id, nextTab.url, { isPrivate: activeTab.isPrivate });
    }
  }, [activeTab, fetchExternalUrl]);

  const handleForward = useCallback(() => {
    if (!activeTab || !canGoForward(activeTab)) return;
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
        sendToRust('reload');
      } else {
        void fetchExternalUrl(activeTab.id, activeTab.url, { isPrivate: activeTab.isPrivate });
      }
    }
  }, [activeTab, fetchExternalUrl]);

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
      if (data.bookmarks.length > 0) {
        setBookmarks((prev) => {
          const seen = new Set(prev.map((b) => b.url));
          const uniqueIncoming = data.bookmarks.filter((b) => !seen.has(b.url));
          return [...prev, ...uniqueIncoming];
        });
      }
      if (data.history.length > 0) {
        setHistory((prev) => [...data.history, ...prev].slice(0, 200));
      }
      if (data.credentials.length > 0) {
        setPendingImportedCredentials((prev) => [...data.credentials, ...prev]);
      }
    },
    []
  );

  const renderTabContent = (tab: Tab, isSplitPane: boolean) => {
    const tabUrl = tab.url;

    if (tabUrl === 'ferrox://speed-dial') {
      return (
        <SpeedDialView
          bookmarks={bookmarks}
          limiter={limiter}
          totalRamMb={rustTelemetry?.ramMb ?? budget.totalRamMb}
          blockedTotal={blockedEvents.length}
          onNavigate={(u) => navigateTab(tab.id, u)}
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
          onChangeAccent={setAccent}
          onChangeCustomAccentHex={setCustomAccentHex}
          onChangeSurfaceTheme={setSurfaceTheme}
          onChangeSearchEngine={setSearchEngine}
          onToggleHardwareAcceleration={() =>
            setPrivacyConfig((p) => ({ ...p, hardwareAcceleration: !p.hardwareAcceleration }))
          }
          onToggleVerticalTabs={() => setVerticalTabs((v) => !v)}
          onToggleBookmarksBar={() => setShowBookmarksBar((b) => !b)}
          onImportProfileData={handleImportProfileData}
          onClearHistory={() => setHistory([])}
          onResetDefaults={() => {
            setAccent('crimson');
            setCustomAccentHex('#FA1E4E');
            setSurfaceTheme('obsidian');
            setSearchEngine('duckduckgo');
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
        autofillSignal={
          autofillSignal && autofillSignal.tabId === tab.id ? autofillSignal : null
        }
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
        onRetry={() => void fetchExternalUrl(tab.id, tab.url, { isPrivate: tab.isPrivate })}
        onNavigateUrl={(nextUrl) => navigateTab(tab.id, nextUrl)}
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
        verticalTabs={verticalTabs}
        quickSettingsOpen={quickSettingsOpen}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={() => handleNewTab('ferrox://speed-dial', false)}
        onNewPrivateTab={() => handleNewTab('ferrox://speed-dial', true)}
        onTogglePin={(id) =>
          setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)))
        }
        onToggleSplit={(id) =>
          setSplitTabId((curr) => (curr === id ? null : id === activeTab?.id ? null : id))
        }
        onToggleGroupCollapse={(groupId) =>
          setTabGroups((prev) =>
            prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
          )
        }
        onOpenTabSearch={() => setTabSearchOpen(true)}
        onToggleVerticalTabs={() => setVerticalTabs((v) => !v)}
        onToggleQuickSettings={() => setQuickSettingsOpen((o) => !o)}
      />

      <QuickSettingsPopover
        open={quickSettingsOpen}
        accent={accent}
        customAccentHex={customAccentHex}
        surfaceTheme={surfaceTheme}
        hardwareAcceleration={privacyConfig.hardwareAcceleration}
        verticalTabs={verticalTabs}
        showBookmarksBar={showBookmarksBar}
        onClose={() => setQuickSettingsOpen(false)}
        onChangeAccent={setAccent}
        onChangeCustomAccentHex={setCustomAccentHex}
        onChangeSurfaceTheme={setSurfaceTheme}
        onToggleHardwareAcceleration={() =>
          setPrivacyConfig((p) => ({ ...p, hardwareAcceleration: !p.hardwareAcceleration }))
        }
        onToggleVerticalTabs={() => setVerticalTabs((v) => !v)}
        onToggleBookmarksBar={() => setShowBookmarksBar((b) => !b)}
        onOpenFullSettings={() => handleOpenUrl('ferrox://settings')}
      />

      {/* Address & Control Toolbar */}
      <AddressToolbar
        currentUrl={activeTab?.url ?? 'ferrox://speed-dial'}
        isPrivateTab={Boolean(activeTab?.isPrivate)}
        canBack={Boolean(activeTab && canGoBack(activeTab))}
        canForward={Boolean(activeTab && canGoForward(activeTab))}
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
        httpsOnly={privacyConfig.httpsOnly}
        upgradedFromHttp={activePageData?.upgradedFromHttp}
        insecureHttp={activePageData?.insecureHttpWarning}
        blockedCount={blockedEvents.length}
        activeDownloadsCount={downloads.filter((d) => d.status === 'downloading').length}
        enabledExtensionsCount={extensions.filter((e) => e.enabled).length}
        totalRamMb={rustTelemetry?.ramMb ?? budget.totalRamMb}
        ramLimitMb={limiter.ramLimitMb}
        ramLimiterEnabled={limiter.ramEnabled}
        sitePermissions={sitePermissionsMap[activeOrigin] ?? DEFAULT_SITE_PERMISSIONS}
        onChangeSitePermission={(origin, key: keyof SitePermissions, val: PermissionValue) =>
          setSitePermissionsMap((prev) => ({
            ...prev,
            [origin]: { ...(prev[origin] ?? DEFAULT_SITE_PERMISSIONS), [key]: val },
          }))
        }
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onHome={() => handleOpenUrl('ferrox://speed-dial')}
        onNavigate={handleOpenUrl}
        onToggleBookmark={handleToggleBookmark}
        onToggleBookmarksBar={() => setShowBookmarksBar((b) => !b)}
        onToggleReaderMode={() => {
          if (!activeTab) return;
          setReaderModeTabs((prev) => ({ ...prev, [activeTab.id]: !prev[activeTab.id] }));
        }}
        onTranslatePage={(lang) => void handleTranslateActiveTab(lang)}
        onTogglePip={() => {
          if (!activeTab) return;
          setPipTabId((curr) => (curr === activeTab.id ? null : activeTab.id));
        }}
        onOpenDownloads={() => handleOpenHubSection('downloads')}
        onOpenExtensions={() => handleOpenHubSection('extensions')}
        onOpenShield={() =>
          setActiveDrawer((d) => (d === 'privacy' ? null : 'privacy'))
        }
        onOpenLimiter={() =>
          setActiveDrawer((d) => (d === 'limiter' ? null : 'limiter'))
        }
        onPopoverOpenChange={setToolbarPopoverOpen}
      />

      {/* Optional Slim Bookmarks Bar */}
      {showBookmarksBar && (
        <BookmarksBar
          bookmarks={bookmarks}
          onNavigate={handleOpenUrl}
          onUnpinFromBar={(id) =>
            setBookmarks((prev) =>
              prev.map((b) => (b.id === id ? { ...b, pinnedToBar: false } : b))
            )
          }
          onOpenManager={() => handleOpenHubSection('bookmarks')}
        />
      )}

      {/* Main Browser Body: Minimal 5-icon Sidebar + Optional Vertical Tab Rail + Optional Drawer + Viewport / Split Viewport */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <BrowserSidebar
          activeDrawer={activeDrawer}
          activeUrl={activeTab?.url ?? ''}
          vpnEnabled={privacyConfig.vpnEnabled}
          onToggleDrawer={(drawer) =>
            setActiveDrawer((curr) => (curr === drawer ? null : drawer))
          }
          onNavigateInternal={(url) => handleOpenUrl(url)}
        />

        {verticalTabs && (
          <VerticalTabRail
            tabs={workspaceTabs}
            tabGroups={tabGroups}
            activeTabId={activeTab?.id ?? null}
            splitTabId={splitTab?.id ?? null}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewTab={() => handleNewTab('ferrox://speed-dial', false)}
            onNewPrivateTab={() => handleNewTab('ferrox://speed-dial', true)}
            onTogglePin={(id) =>
              setTabs((prev) =>
                prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
              )
            }
            onToggleSplit={(id) =>
              setSplitTabId((curr) => (curr === id ? null : id === activeTab?.id ? null : id))
            }
            onToggleGroupCollapse={(groupId) =>
              setTabGroups((prev) =>
                prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
              )
            }
            onOpenTabSearch={() => setTabSearchOpen(true)}
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
          shieldEnabled={shieldEnabled}
          trackerRules={trackerRules}
          blockedEvents={blockedEvents}
          privacyConfig={privacyConfig}
          onClose={() => setActiveDrawer(null)}
          onUpdateLimiter={setLimiter}
          onHibernateInactive={() =>
            setTabs((prev) =>
              prev.map((t) =>
                t.id !== activeTab?.id && t.id !== splitTab?.id && !t.pinned
                  ? { ...t, hibernated: true, estimatedRamMb: 8, estimatedCpuPercent: 0 }
                  : t
              )
            )
          }
          onHibernateTab={(tabId) => {
            if (tabId === activeTab?.id || tabId === splitTab?.id) return;
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
          {activeTab && (
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
              {renderTabContent(activeTab, false)}
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
    </div>
  );
}
