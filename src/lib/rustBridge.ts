import { AccentThemeId, LimiterConfig, SearchEngineId, SurfaceThemeId } from './browserEngine';

export interface DetectedBrowserProfile {
  id: string;
  browser: string;
  browserName: string;
  profileName: string;
  profilePath: string;
  hasBookmarks: boolean;
  hasHistory: boolean;
  hasLoginsFile: boolean;
  estimatedBookmarks: number;
  estimatedHistory: number;
}

export interface NativeImportedBookmark {
  title: string;
  url: string;
  category: string;
  pinnedToBar: boolean;
}

export interface NativeImportedHistoryItem {
  title: string;
  url: string;
  visitedAt: number;
}

export interface NativeImportedCredential {
  site: string;
  username: string;
  password: string;
}

export interface NativeProfileImportResult {
  profileId: string;
  browser: string;
  browserName: string;
  profileName?: string;
  bookmarks: NativeImportedBookmark[];
  history: NativeImportedHistoryItem[];
  credentials: NativeImportedCredential[];
  notes: string[];
}

export interface RustSyncPayload {
  workspace: string;
  activeTabId: number | null;
  activeUrl: string;
  tabs: Array<{
    id: number;
    title: string;
    url: string;
    pinned: boolean;
    hibernated: boolean;
  }>;
  bookmarks: Array<{
    title: string;
    url: string;
  }>;
  ramMb: number;
  ramLimitMb: number;
  ramEnabled: boolean;
  autoHibernateEnabled?: boolean;
  autoHibernateMinutes?: number;
  cpuEnabled?: boolean;
  cpuLimitPercent?: number;
  netEnabled?: boolean;
  netLimitKbps?: number;
  cpuPercent: number;
  processCount?: number;
  shieldEnabled: boolean;
  blockedCount: number;
  accentHex: string;
  accentPreset?: string;
  customAccentHex?: string;
  surfaceTheme?: string;
  hardwareAcceleration?: boolean;
  searchEngine?: string;
  verticalTabs?: boolean;
  showBookmarksBar?: boolean;
  privateMode: boolean;
  httpsOnly: boolean;
  vpnEnabled?: boolean;
  vpnRegion?: string;
  vaultCount: number;
  autoSyncBrowsers?: boolean;
}

export interface RustContentUpdatePayload {
  tabId?: string;
  url?: string;
  title?: string;
}

export interface RustTelemetryPayload {
  ramMb: number;
  cpuPercent: number;
  processCount?: number;
}

export interface RustMemoryTrimmedPayload {
  beforeMb: number;
  afterMb: number;
  processesTrimmed: number;
}

export interface RustOpenTabPayload {
  url: string;
  background?: boolean;
}

export interface RustDownloadEventPayload {
  phase: 'started' | 'completed';
  id?: string;
  filename?: string;
  url: string;
  savedPath?: string;
  warning?: string | null;
  success: boolean;
}

export interface RustAdBlockedPayload {
  host: string;
  url: string;
}

export type BrowserShortcutCommand =
  | 'new_tab'
  | 'close_tab'
  | 'reopen_tab'
  | 'next_tab'
  | 'prev_tab'
  | 'focus_omnibox'
  | 'reload'
  | 'back'
  | 'forward'
  | 'find_in_page'
  | 'tab_search'
  | 'zoom_in'
  | 'zoom_out'
  | 'zoom_reset'
  | 'toggle_fullscreen';

declare global {
  interface Window {
    ipc?: {
      postMessage: (message: string) => void;
    };
    __ferroxSync?: (payload: RustSyncPayload) => void;
    __ferroxTelemetry?: (payload: RustTelemetryPayload) => void;
    __ferroxContentUpdate?: (payload: RustContentUpdatePayload) => void;
    __ferroxOpenTab?: (payload: RustOpenTabPayload) => void;
    __ferroxShortcut?: (command: BrowserShortcutCommand) => void;
    __ferroxDownloadEvent?: (payload: RustDownloadEventPayload) => void;
    __ferroxAdBlocked?: (payload: RustAdBlockedPayload) => void;
    __ferroxFullscreenChanged?: (isFullscreen: boolean) => void;
    __ferroxProfilesDetected?: (profiles: DetectedBrowserProfile[]) => void;
    __ferroxProfileImported?: (results: NativeProfileImportResult[]) => void;
    __ferroxTabHibernated?: (tabId: string) => void;
    __ferroxMemoryTrimmed?: (payload: RustMemoryTrimmedPayload) => void;
  }
}

export function isRustNativeShell(): boolean {
  return typeof window !== 'undefined' && typeof window.ipc?.postMessage === 'function';
}

export function sendToRust(action: string, payload: Record<string, unknown> = {}): void {
  if (!isRustNativeShell()) return;
  try {
    window.ipc!.postMessage(JSON.stringify({ action, ...payload }));
  } catch {
    // Ignore IPC errors when running outside native WebView
  }
}

export function rustNavigateTab(
  tabId: string,
  url: string,
  options?: { isPrivate?: boolean; background?: boolean }
): void {
  sendToRust('navigate_tab', {
    tabId,
    url,
    isPrivate: Boolean(options?.isPrivate),
    visible: options?.background ? false : true,
  });
}

export function rustActivateTab(tabId: string, url: string, isPrivate: boolean = false): void {
  sendToRust('activate_tab', { tabId, url, isPrivate });
}

export function rustCloseTab(tabId: string): void {
  sendToRust('close_tab', { tabId });
}

export function rustHibernateTab(tabId: string): void {
  sendToRust('hibernate_tab', { tabId });
}

export function rustTabBack(tabId: string): void {
  sendToRust('tab_back', { tabId });
}

export function rustTabForward(tabId: string): void {
  sendToRust('tab_forward', { tabId });
}

export function rustTabReload(tabId: string): void {
  sendToRust('tab_reload', { tabId });
}

export function rustTabZoom(tabId: string, factor: number): void {
  sendToRust('tab_zoom', { tabId, factor });
}

export function rustTabFind(tabId: string, query: string, backwards: boolean = false): void {
  sendToRust('tab_find', { tabId, query, backwards });
}

export function rustTabFindClear(tabId: string): void {
  sendToRust('tab_find_clear', { tabId });
}

export function rustToggleFullscreen(): void {
  sendToRust('toggle_fullscreen');
}

export function rustOpenDownloadFile(path: string): void {
  sendToRust('open_download_file', { path });
}

export function rustShowDownloadInFolder(path: string): void {
  sendToRust('show_download_in_folder', { path });
}

export function syncRustTheme(
  accent: AccentThemeId,
  customAccentHex: string,
  surfaceTheme: SurfaceThemeId
): void {
  sendToRust('set_theme', {
    accent: accent === 'custom' ? 'crimson' : accent,
    accentPreset: accent,
    customHex: customAccentHex,
    surfaceTheme,
  });
}

export function syncRustLimiter(limiter: LimiterConfig): void {
  sendToRust('set_limiter', {
    ramEnabled: limiter.ramEnabled,
    ramLimitMb: limiter.ramLimitMb,
    autoHibernateEnabled: limiter.autoHibernateEnabled,
    autoHibernateMinutes: limiter.autoHibernateMinutes,
    cpuEnabled: limiter.cpuEnabled,
    cpuLimitPercent: limiter.cpuLimitPercent,
    netEnabled: limiter.netEnabled,
    netLimitKbps: limiter.netLimitKbps,
  });
}

export function rustTrimMemory(): void {
  sendToRust('trim_memory');
}

export function syncRustSearchEngine(engine: SearchEngineId): void {
  sendToRust('set_search_engine', { engine });
}

export function requestRustDetectProfiles(): void {
  sendToRust('detect_profiles');
}

export function requestRustImportProfile(profileId: string = 'all'): void {
  sendToRust('import_profile', { profileId });
}

export function syncRustAutoSync(enabled: boolean): void {
  sendToRust('set_auto_sync', { enabled });
}

export function syncRustShield(enabled: boolean, rules: string[]): void {
  sendToRust('set_shield', { enabled, rules });
}

