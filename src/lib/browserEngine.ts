export type WorkspaceId = 'personal' | 'work' | 'gaming' | 'development';

export type AccentThemeId = 'crimson' | 'cobalt' | 'amber' | 'emerald' | 'custom';

export interface AccentTheme {
  id: AccentThemeId;
  name: string;
  hex: string;
  softBg: string;
}

export function hexToRgbaSoft(hex: string, alpha: number = 0.14): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `rgba(250, 30, 78, ${alpha})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const ACCENT_THEMES: Record<Exclude<AccentThemeId, 'custom'>, AccentTheme> = {
  crimson: {
    id: 'crimson',
    name: 'GX Crimson',
    hex: '#FA1E4E',
    softBg: 'rgba(250, 30, 78, 0.14)',
  },
  cobalt: {
    id: 'cobalt',
    name: 'Cobalt Ice',
    hex: '#38BDF8',
    softBg: 'rgba(56, 189, 248, 0.14)',
  },
  amber: {
    id: 'amber',
    name: 'Solar Amber',
    hex: '#F59E0B',
    softBg: 'rgba(245, 158, 11, 0.14)',
  },
  emerald: {
    id: 'emerald',
    name: 'Viridian',
    hex: '#10B981',
    softBg: 'rgba(16, 185, 129, 0.14)',
  },
};

export type SurfaceThemeId = 'obsidian' | 'midnight' | 'abyssal' | 'oled' | 'graphite';

export interface SurfaceTheme {
  id: SurfaceThemeId;
  name: string;
  bgHex: string;
  chromeHex: string;
  panelHex: string;
  cardHex: string;
}

export const SURFACE_THEMES: Record<SurfaceThemeId, SurfaceTheme> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian GX',
    bgHex: '#0B0D12',
    chromeHex: '#0E1118',
    panelHex: '#12151E',
    cardHex: '#161B26',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Navy',
    bgHex: '#090F1D',
    chromeHex: '#0C1426',
    panelHex: '#111B33',
    cardHex: '#16223F',
  },
  abyssal: {
    id: 'abyssal',
    name: 'Abyssal Plum',
    bgHex: '#100B16',
    chromeHex: '#150F1E',
    panelHex: '#1A1326',
    cardHex: '#221932',
  },
  oled: {
    id: 'oled',
    name: 'AMOLED Black',
    bgHex: '#020203',
    chromeHex: '#07080B',
    panelHex: '#0C0D12',
    cardHex: '#12141B',
  },
  graphite: {
    id: 'graphite',
    name: 'Slate Graphite',
    bgHex: '#13161B',
    chromeHex: '#181C23',
    panelHex: '#1D222B',
    cardHex: '#242A35',
  },
};

export interface WorkspaceMeta {
  id: WorkspaceId;
  label: string;
  description: string;
}

export const WORKSPACES: WorkspaceMeta[] = [
  { id: 'personal', label: 'Personal', description: 'Daily reading, media, and home bookmarks' },
  { id: 'work', label: 'Work', description: 'Docs, email, and project dashboards' },
  { id: 'gaming', label: 'Gaming', description: 'Wikis, patch notes, and streams' },
  { id: 'development', label: 'Development', description: 'Rust docs, crates, and architecture' },
];

export type TabGroupColor = '#FA1E4E' | '#38BDF8' | '#10B981' | '#F59E0B' | '#A78BFA';

export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
}

export interface Tab {
  id: string;
  workspace: WorkspaceId;
  groupId: string | null;
  title: string;
  url: string;
  history: string[];
  historyIndex: number;
  pinned: boolean;
  hibernated: boolean;
  isPrivate: boolean;
  estimatedRamMb: number;
  estimatedCpuPercent: number;
  lastActiveAt: number;
}

export interface LimiterConfig {
  ramEnabled: boolean;
  ramLimitMb: number;
  autoHibernateEnabled: boolean;
  autoHibernateMinutes: number;
  cpuEnabled: boolean;
  cpuLimitPercent: number;
  netEnabled: boolean;
  netLimitKbps: number;
}

export const DEFAULT_LIMITER_CONFIG: LimiterConfig = {
  ramEnabled: true,
  ramLimitMb: 512,
  autoHibernateEnabled: true,
  autoHibernateMinutes: 5,
  cpuEnabled: false,
  cpuLimitPercent: 60,
  netEnabled: false,
  netLimitKbps: 512,
};

export function findIdleTabsToHibernate(
  tabs: Tab[],
  activeTabId: string | null,
  splitTabId: string | null,
  limiter: LimiterConfig,
  nowMs: number = Date.now()
): string[] {
  if (!limiter.autoHibernateEnabled || limiter.autoHibernateMinutes <= 0) {
    return [];
  }
  const cutoffMs = limiter.autoHibernateMinutes * 60_000;
  return tabs
    .filter(
      (t) =>
        t.id !== activeTabId &&
        t.id !== splitTabId &&
        !t.pinned &&
        !t.hibernated &&
        !t.url.startsWith('ferrox://') &&
        nowMs - t.lastActiveAt >= cutoffMs
    )
    .map((t) => t.id);
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  category: string;
  pinnedToBar?: boolean;
}

export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface BlockedEvent {
  id: string;
  host: string;
  pageUrl: string;
  timestamp: number;
}

export type DownloadStatus = 'downloading' | 'paused' | 'completed' | 'blocked';

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  savedPath?: string;
  bytesReceived: number;
  totalBytes: number;
  status: DownloadStatus;
  warning: string | null;
  startedAt: number;
}

export type DohProviderId = 'cloudflare' | 'quad9' | 'google' | 'custom';

export const DOH_PROVIDERS: Record<DohProviderId, { label: string; endpoint: string }> = {
  cloudflare: { label: 'Cloudflare (1.1.1.1)', endpoint: 'https://cloudflare-dns.com/dns-query' },
  quad9: { label: 'Quad9 (9.9.9.9)', endpoint: 'https://dns.quad9.net/dns-query' },
  google: { label: 'Google DNS (8.8.8.8)', endpoint: 'https://dns.google/dns-query' },
  custom: { label: 'Custom DoH Resolver', endpoint: '' },
};

export type PermissionValue = 'ask' | 'allow' | 'block';

export interface SitePermissions {
  camera: PermissionValue;
  microphone: PermissionValue;
  notifications: PermissionValue;
  location: PermissionValue;
  clipboard: PermissionValue;
}

export const DEFAULT_SITE_PERMISSIONS: SitePermissions = {
  camera: 'ask',
  microphone: 'ask',
  notifications: 'block',
  location: 'ask',
  clipboard: 'ask',
};

export type VpnProtocolId = 'wireguard' | 'openvpn';

export interface VpnServerMeta {
  region: string;
  label: string;
  virtualIp: string;
  latencyMs: number;
  loadPercent: number;
}

export const VPN_SERVERS: VpnServerMeta[] = [
  { region: 'US East', label: 'New York, US', virtualIp: '198.51.100.42', latencyMs: 18, loadPercent: 24 },
  { region: 'EU Central', label: 'Frankfurt, DE', virtualIp: '203.0.113.88', latencyMs: 36, loadPercent: 31 },
  { region: 'Zurich', label: 'Zurich, CH', virtualIp: '192.0.2.119', latencyMs: 41, loadPercent: 19 },
  { region: 'Tokyo', label: 'Tokyo, JP', virtualIp: '198.51.100.204', latencyMs: 84, loadPercent: 27 },
  { region: 'Singapore', label: 'Singapore, SG', virtualIp: '203.0.113.151', latencyMs: 92, loadPercent: 22 },
];

export interface PrivacySecurityConfig {
  httpsOnly: boolean;
  safeBrowsing: boolean;
  blockThirdPartyCookies: boolean;
  clearCookiesOnExit: boolean;
  fingerprintProtection: boolean;
  webrtcIpProtection: boolean;
  stripTrackingParams: boolean;
  blockCryptominers: boolean;
  globalPrivacyControl: boolean;
  blockHyperlinkAuditing: boolean;
  dohProvider: DohProviderId;
  customDohUrl: string;
  vpnEnabled: boolean;
  vpnRegion: string;
  vpnProtocol: VpnProtocolId;
  vpnKillSwitch: boolean;
  vpnAutoConnectPrivate: boolean;
  vpnBypassDomains: string[];
  autoUpdatesEnabled: boolean;
  passwordSyncEnabled: boolean;
  hardwareAcceleration: boolean;
}

export const DEFAULT_PRIVACY_CONFIG: PrivacySecurityConfig = {
  httpsOnly: true,
  safeBrowsing: true,
  blockThirdPartyCookies: true,
  clearCookiesOnExit: false,
  fingerprintProtection: true,
  webrtcIpProtection: true,
  stripTrackingParams: true,
  blockCryptominers: true,
  globalPrivacyControl: true,
  blockHyperlinkAuditing: true,
  dohProvider: 'cloudflare',
  customDohUrl: '',
  vpnEnabled: false,
  vpnRegion: 'US East',
  vpnProtocol: 'wireguard',
  vpnKillSwitch: true,
  vpnAutoConnectPrivate: false,
  vpnBypassDomains: ['localhost', '127.0.0.1'],
  autoUpdatesEnabled: true,
  passwordSyncEnabled: false,
  hardwareAcceleration: true,
};

export interface BrowserExtension {
  id: string;
  name: string;
  description: string;
  matchPattern: string;
  enabled: boolean;
  cssInjection?: string;
  jsInjection?: string;
  builtIn?: boolean;
}

export const DEFAULT_EXTENSIONS: BrowserExtension[] = [
  {
    id: 'ext-dark-reader',
    name: 'Dark Mode Contrast',
    description: 'Applies low-glare dark styling to bright web pages.',
    matchPattern: '*',
    enabled: false,
    builtIn: true,
    cssInjection:
      'html { filter: invert(0.92) hue-rotate(180deg); background: #0f1218; } img, video { filter: invert(1) hue-rotate(180deg); }',
  },
  {
    id: 'ext-focus-measure',
    name: 'Reading Measure',
    description: 'Centers dense documentation to a comfortable 75ch column.',
    matchPattern: '*',
    enabled: false,
    builtIn: true,
    cssInjection: 'body { max-width: 78ch !important; margin: 24px auto !important; padding: 0 20px !important; }',
  },
  {
    id: 'ext-link-highlight',
    name: 'External Link Marker',
    description: 'Adds subtle underline indicators to outbound hyperlinks.',
    matchPattern: '*',
    enabled: false,
    builtIn: true,
    cssInjection: 'a[href^="http"] { text-decoration: underline !important; text-underline-offset: 3px; }',
  },
];

export const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  { id: 'bm-rust', title: 'Rust Language', url: 'https://www.rust-lang.org', category: 'Development', pinnedToBar: true },
  { id: 'bm-docsrs', title: 'Docs.rs', url: 'https://docs.rs', category: 'Development', pinnedToBar: true },
  { id: 'bm-crates', title: 'Crates.io', url: 'https://crates.io', category: 'Development', pinnedToBar: true },
  { id: 'bm-wiki', title: 'Wikipedia', url: 'https://en.wikipedia.org', category: 'Reference', pinnedToBar: true },
  { id: 'bm-example', title: 'Example Domain', url: 'https://example.com', category: 'Sandbox', pinnedToBar: false },
  { id: 'bm-source', title: 'Rust Crate Source', url: 'ferrox://rust-source', category: 'FerroX', pinnedToBar: true },
];

export const DEFAULT_TRACKER_RULES: string[] = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'static.doubleclick.net',
  'connect.facebook.net',
  'scorecardresearch.com',
  'mixpanel.com',
  'hotjar.com',
  'segment.io',
  'ads.twitter.com',
  'coinhive.com',
  'coin-hive.com',
  'cryptoloot.pro',
  'crypto-loot.com',
  'webminepool.com',
  'minero.cc',
  'jsecoin.com',
];

export const PHISHING_BLOCKLIST: string[] = [
  'malware.testing.google.test',
  'testsafebrowsing.appspot.com',
  'login-verify-account.example',
  'secure-wallet-airdrop.example',
  'paypal-security-check.example',
  'coinhive.com',
  'coin-hive.com',
  'cryptoloot.pro',
  'crypto-loot.com',
  'webminepool.com',
];

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_eid',
  'mc_cid',
  'yclid',
  'igshid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'ref_src',
  'oly_enc_id',
  'oly_anon_id',
  'vero_id',
  'rb_clickid',
  's_cid',
]);

export function stripTrackingQueryParams(rawUrl: string): {
  cleanUrl: string;
  strippedCount: number;
} {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.search) {
      return { cleanUrl: rawUrl, strippedCount: 0 };
    }
    const toDelete: string[] = [];
    parsed.searchParams.forEach((_val, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(lower)) {
        toDelete.push(key);
      }
    });
    if (toDelete.length === 0) {
      return { cleanUrl: rawUrl, strippedCount: 0 };
    }
    for (const k of toDelete) {
      parsed.searchParams.delete(k);
    }
    return { cleanUrl: parsed.toString(), strippedCount: toDelete.length };
  } catch {
    return { cleanUrl: rawUrl, strippedCount: 0 };
  }
}

export type SearchEngineId = 'duckduckgo' | 'wikipedia' | 'crates';

export const SEARCH_ENGINES: Record<SearchEngineId, { label: string; prefix: string }> = {
  duckduckgo: { label: 'DuckDuckGo HTML', prefix: 'https://html.duckduckgo.com/html/?q=' },
  wikipedia: { label: 'Wikipedia', prefix: 'https://en.wikipedia.org/w/index.php?search=' },
  crates: { label: 'Crates.io', prefix: 'https://crates.io/search?q=' },
};

export const INTERNAL_PAGES: Record<string, string> = {
  'ferrox://speed-dial': 'Speed Dial',
  'ferrox://rust-source': 'Rust Desktop Crate',
  'ferrox://hub': 'Browser Manager',
  'ferrox://docs': 'Architecture & Shortcuts',
  'ferrox://settings': 'Browser Settings',
};

export function normalizeAddressInput(
  rawInput: string,
  searchEngine: SearchEngineId = 'duckduckgo'
): string {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return 'ferrox://speed-dial';
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('ferrox://')) {
    return lower in INTERNAL_PAGES ? lower : 'ferrox://speed-dial';
  }
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return trimmed;
  }
  if (lower.startsWith('localhost:') || lower === 'localhost') {
    return `http://${trimmed}`;
  }
  if (!trimmed.includes(' ') && trimmed.includes('.')) {
    try {
      const candidate = new URL(`https://${trimmed}`);
      return candidate.toString();
    } catch {
      // Fallback to search below
    }
  }
  const engine = SEARCH_ENGINES[searchEngine] ?? SEARCH_ENGINES.duckduckgo;
  return `${engine.prefix}${encodeURIComponent(trimmed)}`;
}

export interface SecurityAssessment {
  safe: boolean;
  upgradedUrl: string;
  upgradedFromHttp: boolean;
  insecureHttpWarning: boolean;
  threatType: 'phishing' | 'malware' | null;
  reason: string | null;
  strippedTrackers: number;
}

export function evaluateUrlSecurity(
  rawUrl: string,
  httpsOnly: boolean,
  safeBrowsing: boolean,
  stripTrackingParams: boolean = true
): SecurityAssessment {
  if (rawUrl.startsWith('ferrox://')) {
    return {
      safe: true,
      upgradedUrl: rawUrl,
      upgradedFromHttp: false,
      insecureHttpWarning: false,
      threatType: null,
      reason: null,
      strippedTrackers: 0,
    };
  }

  const trimmedLower = rawUrl.trim().toLowerCase();
  if (
    trimmedLower.startsWith('javascript:') ||
    trimmedLower.startsWith('vbscript:') ||
    trimmedLower.startsWith('data:text/html')
  ) {
    return {
      safe: false,
      upgradedUrl: rawUrl,
      upgradedFromHttp: false,
      insecureHttpWarning: false,
      threatType: 'malware',
      reason: 'Blocked unsafe script or HTML navigation scheme.',
      strippedTrackers: 0,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      safe: false,
      upgradedUrl: rawUrl,
      upgradedFromHttp: false,
      insecureHttpWarning: false,
      threatType: 'malware',
      reason: 'Malformed URL rejected by security parser.',
      strippedTrackers: 0,
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      safe: false,
      upgradedUrl: rawUrl,
      upgradedFromHttp: false,
      insecureHttpWarning: false,
      threatType: 'malware',
      reason: `Blocked non-HTTP(S) navigation scheme: ${parsed.protocol}`,
      strippedTrackers: 0,
    };
  }

  const host = parsed.hostname.toLowerCase();

  if (safeBrowsing) {
    if (parsed.username) {
      return {
        safe: false,
        upgradedUrl: rawUrl,
        upgradedFromHttp: false,
        insecureHttpWarning: false,
        threatType: 'phishing',
        reason: 'Blocked deceptive URL containing embedded login credentials (@-trick).',
        strippedTrackers: 0,
      };
    }

    for (const sig of PHISHING_BLOCKLIST) {
      if (host === sig || host.endsWith(`.${sig}`)) {
        return {
          safe: false,
          upgradedUrl: rawUrl,
          upgradedFromHttp: false,
          insecureHttpWarning: false,
          threatType:
            sig.includes('malware') || sig.includes('coin') || sig.includes('crypto') || sig.includes('mine')
              ? 'malware'
              : 'phishing',
          reason: `Matched Safe Browsing threat signature: ${sig}`,
          strippedTrackers: 0,
        };
      }
    }

    const suspiciousBrand =
      host.includes('login') ||
      host.includes('bank') ||
      host.includes('wallet') ||
      host.includes('verify') ||
      host.includes('account') ||
      host.includes('paypal') ||
      host.includes('apple') ||
      host.includes('microsoft') ||
      host.includes('google');
    if (host.startsWith('xn--') && suspiciousBrand) {
      return {
        safe: false,
        upgradedUrl: rawUrl,
        upgradedFromHttp: false,
        insecureHttpWarning: false,
        threatType: 'phishing',
        reason: 'Suspicious IDN homograph lookalike domain flagged.',
        strippedTrackers: 0,
      };
    }
  }

  let strippedTrackers = 0;
  if (stripTrackingParams) {
    const cleaned = stripTrackingQueryParams(parsed.toString());
    strippedTrackers = cleaned.strippedCount;
    if (strippedTrackers > 0) {
      parsed = new URL(cleaned.cleanUrl);
    }
  }

  if (parsed.protocol === 'http:' && host !== 'localhost' && host !== '127.0.0.1') {
    if (httpsOnly) {
      parsed.protocol = 'https:';
      return {
        safe: true,
        upgradedUrl: parsed.toString(),
        upgradedFromHttp: true,
        insecureHttpWarning: false,
        threatType: null,
        reason: 'Automatically upgraded HTTP connection to HTTPS.',
        strippedTrackers,
      };
    }
    return {
      safe: true,
      upgradedUrl: parsed.toString(),
      upgradedFromHttp: false,
      insecureHttpWarning: true,
      threatType: null,
      reason: 'Unencrypted HTTP connection.',
      strippedTrackers,
    };
  }

  return {
    safe: true,
    upgradedUrl: parsed.toString(),
    upgradedFromHttp: false,
    insecureHttpWarning: false,
    threatType: null,
    reason: null,
    strippedTrackers,
  };
}

export function deriveTitleFromUrl(url: string): string {
  if (url in INTERNAL_PAGES) {
    return INTERNAL_PAGES[url];
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function getOriginFromUrl(url: string): string {
  if (url.startsWith('ferrox://')) return 'ferrox://internal';
  try {
    return new URL(url).origin;
  } catch {
    return 'unknown';
  }
}

export function estimateTabMemoryMb(url: string, hibernated: boolean): number {
  if (hibernated) return 8;
  if (url.startsWith('ferrox://')) return 24;
  return 96;
}

export function estimateTabCpuPercent(url: string, hibernated: boolean, isActive: boolean): number {
  if (hibernated) return 0;
  if (url.startsWith('ferrox://')) return isActive ? 2 : 0.4;
  return isActive ? 7.5 : 1.8;
}

export function createTab(
  id: string,
  workspace: WorkspaceId,
  url: string = 'ferrox://speed-dial',
  now: number = Date.now(),
  options?: { isPrivate?: boolean; groupId?: string | null }
): Tab {
  const normalized = normalizeAddressInput(url);
  return {
    id,
    workspace,
    groupId: options?.groupId ?? null,
    title: deriveTitleFromUrl(normalized),
    url: normalized,
    history: [normalized],
    historyIndex: 0,
    pinned: false,
    hibernated: false,
    isPrivate: Boolean(options?.isPrivate),
    estimatedRamMb: estimateTabMemoryMb(normalized, false),
    estimatedCpuPercent: estimateTabCpuPercent(normalized, false, true),
    lastActiveAt: now,
  };
}

export function duplicateTab(source: Tab, newId: string, now: number = Date.now()): Tab {
  return {
    ...source,
    id: newId,
    history: [...source.history],
    pinned: false,
    hibernated: false,
    estimatedRamMb: estimateTabMemoryMb(source.url, false),
    estimatedCpuPercent: estimateTabCpuPercent(source.url, false, true),
    lastActiveAt: now,
  };
}

export function canGoBack(tab: Tab): boolean {
  return tab.historyIndex > 0;
}

export function canGoForward(tab: Tab): boolean {
  return tab.historyIndex + 1 < tab.history.length;
}

export function tabHistoryNavigate(
  tab: Tab,
  nextUrl: string,
  title?: string,
  now: number = Date.now()
): Tab {
  const trimmedHistory = tab.history.slice(0, tab.historyIndex + 1);
  const last = trimmedHistory[trimmedHistory.length - 1];
  const history = last === nextUrl ? trimmedHistory : [...trimmedHistory, nextUrl];
  const historyIndex = history.length - 1;
  return {
    ...tab,
    url: nextUrl,
    title: title ?? deriveTitleFromUrl(nextUrl),
    history,
    historyIndex,
    hibernated: false,
    estimatedRamMb: estimateTabMemoryMb(nextUrl, false),
    estimatedCpuPercent: estimateTabCpuPercent(nextUrl, false, true),
    lastActiveAt: now,
  };
}

export function stepBack(tab: Tab, now: number = Date.now()): Tab {
  if (!canGoBack(tab)) return tab;
  const nextIndex = tab.historyIndex - 1;
  const nextUrl = tab.history[nextIndex];
  return {
    ...tab,
    url: nextUrl,
    title: deriveTitleFromUrl(nextUrl),
    historyIndex: nextIndex,
    hibernated: false,
    estimatedRamMb: estimateTabMemoryMb(nextUrl, false),
    lastActiveAt: now,
  };
}

export function stepForward(tab: Tab, now: number = Date.now()): Tab {
  if (!canGoForward(tab)) return tab;
  const nextIndex = tab.historyIndex + 1;
  const nextUrl = tab.history[nextIndex];
  return {
    ...tab,
    url: nextUrl,
    title: deriveTitleFromUrl(nextUrl),
    historyIndex: nextIndex,
    hibernated: false,
    estimatedRamMb: estimateTabMemoryMb(nextUrl, false),
    lastActiveAt: now,
  };
}

export function searchTabs(tabs: Tab[], query: string): Tab[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.url.toLowerCase().includes(q) ||
      t.workspace.toLowerCase().includes(q)
  );
}

export interface ResourceBudgetResult {
  tabs: Tab[];
  totalRamMb: number;
  totalCpuPercent: number;
  hibernatedIds: string[];
  overRamBudget: boolean;
}

export function evaluateResourceBudget(
  tabs: Tab[],
  activeTabId: string | null,
  limiter: LimiterConfig,
  splitTabId: string | null = null
): ResourceBudgetResult {
  const updated = tabs.map((tab) => {
    const isActive = tab.id === activeTabId || tab.id === splitTabId;
    const hibernated = isActive ? false : tab.hibernated;
    return {
      ...tab,
      hibernated,
      estimatedRamMb: estimateTabMemoryMb(tab.url, hibernated),
      estimatedCpuPercent: estimateTabCpuPercent(tab.url, hibernated, isActive),
    };
  });

  const sumRam = (list: Tab[]) => list.reduce((acc, t) => acc + t.estimatedRamMb, 0);
  const hibernatedIds: string[] = [];

  if (limiter.ramEnabled) {
    let currentRam = sumRam(updated);
    if (currentRam > limiter.ramLimitMb) {
      const candidates = updated
        .filter(
          (t) =>
            t.id !== activeTabId &&
            t.id !== splitTabId &&
            !t.pinned &&
            !t.hibernated
        )
        .sort((a, b) => a.lastActiveAt - b.lastActiveAt);

      for (const candidate of candidates) {
        if (currentRam <= limiter.ramLimitMb) break;
        const idx = updated.findIndex((t) => t.id === candidate.id);
        if (idx !== -1) {
          const prevRam = updated[idx].estimatedRamMb;
          updated[idx] = {
            ...updated[idx],
            hibernated: true,
            estimatedRamMb: 8,
            estimatedCpuPercent: 0,
          };
          currentRam = currentRam - prevRam + 8;
          hibernatedIds.push(candidate.id);
        }
      }
    }
  }

  const totalRamMb = sumRam(updated);
  const rawCpu = updated.reduce((acc, t) => acc + t.estimatedCpuPercent, 0);
  const totalCpuPercent = limiter.cpuEnabled
    ? Number(Math.min(rawCpu, limiter.cpuLimitPercent).toFixed(1))
    : Number(rawCpu.toFixed(1));

  return {
    tabs: updated,
    totalRamMb,
    totalCpuPercent,
    hibernatedIds,
    overRamBudget: limiter.ramEnabled && totalRamMb > limiter.ramLimitMb,
  };
}

export function shouldBlockUrl(
  rawUrl: string,
  shieldEnabled: boolean,
  rules: string[] = DEFAULT_TRACKER_RULES
): { blocked: boolean; matchedRule: string | null } {
  if (!shieldEnabled) {
    return { blocked: false, matchedRule: null };
  }
  let host = '';
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return { blocked: false, matchedRule: null };
  }
  for (const rule of rules) {
    const cleanRule = rule.trim().toLowerCase();
    if (!cleanRule) continue;
    if (host === cleanRule || host.endsWith(`.${cleanRule}`)) {
      return { blocked: true, matchedRule: cleanRule };
    }
  }
  return { blocked: false, matchedRule: null };
}

export function scanDownloadFilename(filename: string): { safe: boolean; warning: string | null } {
  const lower = filename.trim().toLowerCase();
  const riskyExtensions = ['.exe', '.bat', '.cmd', '.ps1', '.vbs', '.scr', '.msi', '.hta', '.jar'];
  for (const ext of riskyExtensions) {
    if (lower.endsWith(ext)) {
      return {
        safe: false,
        warning: `Potentially dangerous executable file (${ext}) flagged by Download Scanner.`,
      };
    }
  }
  return { safe: true, warning: null };
}

export function exportBookmarksHtml(bookmarks: BookmarkItem[]): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>FerroX Bookmarks</TITLE>',
    '<H1>FerroX Bookmarks</H1>',
    '<DL><p>',
  ];
  for (const bm of bookmarks) {
    const safeUrl = bm.url.replace(/"/g, '&quot;');
    const safeTitle = bm.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    lines.push(`  <DT><A HREF="${safeUrl}">${safeTitle}</A>`);
  }
  lines.push('</DL><p>');
  return lines.join('\n');
}

export function parseBookmarksImport(rawText: string): BookmarkItem[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : parsed.bookmarks;
      if (Array.isArray(arr)) {
        return arr
          .filter((item) => item && typeof item.url === 'string' && typeof item.title === 'string')
          .map((item, idx) => ({
            id: `imp-${Date.now()}-${idx}`,
            title: item.title.trim() || item.url,
            url: item.url.trim(),
            category: typeof item.category === 'string' ? item.category : 'Imported',
            pinnedToBar: Boolean(item.pinnedToBar),
          }));
      }
    } catch {
      // Fallback to HTML parser
    }
  }

  const results: BookmarkItem[] = [];
  const regex = /<A\s+[^>]*HREF=["']([^"']+)["'][^>]*>([\s\S]*?)<\/A>/gi;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(trimmed)) !== null) {
    const url = match[1].trim();
    const title = match[2].replace(/<[^>]+>/g, '').trim() || url;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ferrox://')) {
      results.push({
        id: `imp-html-${Date.now()}-${idx++}`,
        title,
        url,
        category: 'Imported',
        pinnedToBar: false,
      });
    }
  }
  return results;
}

export function clampZoomFactor(factor: number): number {
  if (!Number.isFinite(factor)) return 1;
  const clamped = Math.min(2.5, Math.max(0.5, factor));
  return Math.round(clamped * 100) / 100;
}

export function getNextTabId(tabs: Tab[], activeId: string | null, delta: 1 | -1): string | null {
  if (tabs.length === 0) return null;
  if (!activeId) return tabs[0].id;
  const idx = tabs.findIndex((t) => t.id === activeId);
  if (idx === -1) return tabs[0].id;
  const nextIdx = (idx + delta + tabs.length) % tabs.length;
  return tabs[nextIdx].id;
}

export interface PersistedSessionTab {
  id: string;
  workspace: WorkspaceId;
  groupId: string | null;
  title: string;
  url: string;
  history: string[];
  historyIndex: number;
  pinned: boolean;
}

const VALID_WORKSPACES: ReadonlySet<string> = new Set(['personal', 'work', 'gaming', 'development']);

export function serializeSessionTabs(tabs: Tab[]): PersistedSessionTab[] {
  return tabs
    .filter((t) => !t.isPrivate)
    .slice(0, 50)
    .map((t) => ({
      id: t.id,
      workspace: t.workspace,
      groupId: t.groupId,
      title: t.title,
      url: t.url,
      history: t.history.slice(-20),
      historyIndex: Math.min(t.historyIndex, Math.max(0, t.history.slice(-20).length - 1)),
      pinned: t.pinned,
    }));
}

export function restoreSessionTabs(raw: unknown, now: number = Date.now()): Tab[] {
  if (!Array.isArray(raw)) return [];
  const restored: Tab[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<PersistedSessionTab>;
    const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : '';
    const url = typeof rec.url === 'string' && rec.url.trim() ? rec.url.trim() : '';
    if (!id || !url || seenIds.has(id)) continue;
    const isValidScheme =
      url.startsWith('http://') || url.startsWith('https://') || url in INTERNAL_PAGES;
    if (!isValidScheme) continue;

    seenIds.add(id);
    const workspace: WorkspaceId =
      typeof rec.workspace === 'string' && VALID_WORKSPACES.has(rec.workspace)
        ? (rec.workspace as WorkspaceId)
        : 'personal';
    const cleanHistory =
      Array.isArray(rec.history) && rec.history.length > 0
        ? rec.history.filter(
            (h): h is string =>
              typeof h === 'string' &&
              (h.startsWith('http://') || h.startsWith('https://') || h in INTERNAL_PAGES)
          )
        : [url];
    const history = cleanHistory.length > 0 ? cleanHistory : [url];
    const rawIdx = typeof rec.historyIndex === 'number' ? rec.historyIndex : history.length - 1;
    const historyIndex = Math.max(0, Math.min(history.length - 1, Math.floor(rawIdx)));

    restored.push({
      id,
      workspace,
      groupId: typeof rec.groupId === 'string' ? rec.groupId : null,
      title:
        typeof rec.title === 'string' && rec.title.trim()
          ? rec.title.trim()
          : deriveTitleFromUrl(url),
      url,
      history,
      historyIndex,
      pinned: Boolean(rec.pinned),
      hibernated: false,
      isPrivate: false,
      estimatedRamMb: estimateTabMemoryMb(url, false),
      estimatedCpuPercent: estimateTabCpuPercent(url, false, false),
      lastActiveAt: now,
    });
  }
  return restored;
}

