import { AccentThemeId, LimiterConfig, SearchEngineId, SurfaceThemeId } from './browserEngine';

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
  cpuPercent: number;
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
}

export interface RustContentUpdatePayload {
  url?: string;
  title?: string;
}

declare global {
  interface Window {
    ipc?: {
      postMessage: (message: string) => void;
    };
    __ferroxSync?: (payload: RustSyncPayload) => void;
    __ferroxContentUpdate?: (payload: RustContentUpdatePayload) => void;
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
    cpuEnabled: limiter.cpuEnabled,
    cpuLimitPercent: limiter.cpuLimitPercent,
    netEnabled: limiter.netEnabled,
    netLimitKbps: limiter.netLimitKbps,
  });
}

export function syncRustSearchEngine(engine: SearchEngineId): void {
  sendToRust('set_search_engine', { engine });
}
