import { ChangeEvent, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Clock,
  FolderInput,
  FolderOpen,
  Info,
  KeyRound,
  RefreshCw,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import { BookmarkItem, HistoryItem } from '../lib/browserEngine';
import {
  ALL_BROWSER_SOURCE_IDS,
  BROWSER_PROFILE_SOURCES,
  BrowserSourceId,
  getSampleProfileData,
  ImportedProfilePreview,
  inferBrowserSourceFromPath,
  parseProfilePayload,
} from '../lib/profileImporter';
import { DetectedBrowserProfile, isRustNativeShell } from '../lib/rustBridge';
import { VaultCredential } from '../lib/vaultCrypto';
import { HubSection } from './BrowserHubView';

export interface SyncProfileReceiptItem {
  profileId: string;
  browserName: string;
  profileName: string;
  bookmarksFound: number;
  bookmarksAdded: number;
  historyFound: number;
  historyAdded: number;
  credentialsFound: number;
}

export interface SyncSummary {
  message: string;
  syncedAt: number;
  totalBookmarksFound: number;
  newBookmarksAdded: number;
  alreadySyncedBookmarks: number;
  totalHistoryFound: number;
  newHistoryAdded: number;
  totalCredentialsFound: number;
  perProfile: SyncProfileReceiptItem[];
  notes: string[];
}

interface ProfileImporterPanelProps {
  detectedProfiles: DetectedBrowserProfile[];
  autoSyncBrowsers: boolean;
  syncingProfileId: string | null;
  rescanningProfiles?: boolean;
  syncedProfileIds?: string[];
  lastSyncSummary: SyncSummary | null;
  bookmarksCount?: number;
  historyCount?: number;
  onToggleAutoSync: () => void;
  onRescanProfiles: () => void;
  onSyncProfile: (profileId: string) => void;
  onOpenHubSection?: (section: HubSection) => void;
  onImportProfileData: (data: {
    bookmarks: BookmarkItem[];
    history: HistoryItem[];
    credentials: VaultCredential[];
  }) => { newBookmarks: number; newHistory: number; newCredentials: number } | void;
}

const SUPPORTED_FOLDER_FILE_RE =
  /(^|\/)(bookmarks|bookmarks\.html|bookmarks\.json|bookmarks\.plist|bookmarks-[^/]+\.json|logins\.csv|passwords\.csv|opera passwords\.csv|chrome passwords\.csv|microsoft edge passwords\.csv|brave passwords\.csv|vivaldi passwords\.csv|safari passwords\.csv)$/i;

function formatSyncTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'just now';
  }
}

export function ProfileImporterPanel({
  detectedProfiles,
  autoSyncBrowsers,
  syncingProfileId,
  rescanningProfiles = false,
  syncedProfileIds = [],
  lastSyncSummary,
  bookmarksCount,
  historyCount,
  onToggleAutoSync,
  onRescanProfiles,
  onSyncProfile,
  onOpenHubSection,
  onImportProfileData,
}: ProfileImporterPanelProps) {
  const nativeShell = isRustNativeShell();
  const [source, setSource] = useState<BrowserSourceId>('operagx');
  const [preview, setPreview] = useState<ImportedProfilePreview | null>(null);
  const [includeBookmarks, setIncludeBookmarks] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includePasswords, setIncludePasswords] = useState(true);
  const [localSyncReceipt, setLocalSyncReceipt] = useState<SyncSummary | null>(null);

  const meta = BROWSER_PROFILE_SOURCES[source];
  const activeReceipt = localSyncReceipt && (!lastSyncSummary || localSyncReceipt.syncedAt >= lastSyncSummary.syncedAt)
    ? localSyncReceipt
    : lastSyncSummary;

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const mergedBookmarks: BookmarkItem[] = [];
    const mergedHistory: HistoryItem[] = [];
    const mergedCredentials: VaultCredential[] = [];
    const formats = new Set<string>();

    for (const file of Array.from(files)) {
      const text = await file.text();
      const parsed = parseProfilePayload(text, file.name, source);
      mergedBookmarks.push(...parsed.bookmarks);
      mergedHistory.push(...parsed.history);
      mergedCredentials.push(...parsed.credentials);
      parsed.detectedFormats.forEach((f) => formats.add(f));
    }

    setPreview({
      source,
      bookmarks: mergedBookmarks,
      history: mergedHistory,
      credentials: mergedCredentials,
      detectedFormats: Array.from(formats),
    });
    e.target.value = '';
  };

  const handleFolderSync = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const mergedBookmarks: BookmarkItem[] = [];
    const mergedHistory: HistoryItem[] = [];
    const mergedCredentials: VaultCredential[] = [];
    const notes: string[] = [];
    let sawSqliteOnly = false;
    let sawEncryptedLogins = false;

    for (const file of Array.from(files)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const lower = rel.toLowerCase();

      if (lower.endsWith('places.sqlite') || lower.endsWith('/history') || lower === 'history') {
        sawSqliteOnly = true;
        continue;
      }
      if (lower.endsWith('logins.json') || lower.endsWith('login data')) {
        sawEncryptedLogins = true;
        continue;
      }

      if (!SUPPORTED_FOLDER_FILE_RE.test(rel) && !/\.(html|htm|json|csv)$/i.test(file.name)) {
        continue;
      }

      if (file.size > 15 * 1024 * 1024) continue;

      try {
        const text = await file.text();
        const inferredSource: BrowserSourceId = inferBrowserSourceFromPath(rel);
        const parsed = parseProfilePayload(text, file.name, inferredSource);
        mergedBookmarks.push(...parsed.bookmarks);
        mergedHistory.push(...parsed.history);
        mergedCredentials.push(...parsed.credentials);
      } catch {
        // Skip unreadable binary files inside browser profile folders
      }
    }

    if (sawSqliteOnly && mergedBookmarks.length === 0 && mergedHistory.length === 0) {
      notes.push(
        'Detected SQLite profile database (places.sqlite / History). Use the native FerroX .exe for direct SQLite syncing, or export bookmarks.html / JSON.'
      );
    }
    if (sawEncryptedLogins && mergedCredentials.length === 0) {
      notes.push(
        'OS-encrypted logins detected. Export passwords as CSV (logins.csv or Opera Passwords.csv) to import into FerroX Vault.'
      );
    }

    const res = onImportProfileData({
      bookmarks: mergedBookmarks,
      history: mergedHistory,
      credentials: mergedCredentials,
    });
    const newBookmarks = res?.newBookmarks ?? mergedBookmarks.length;
    const newHistory = res?.newHistory ?? mergedHistory.length;
    setLocalSyncReceipt({
      message:
        mergedBookmarks.length > 0 || mergedHistory.length > 0 || mergedCredentials.length > 0
          ? `Synced selected profile folder`
          : 'No plain-text bookmark/CSV files found in that folder.',
      syncedAt: Date.now(),
      totalBookmarksFound: mergedBookmarks.length,
      newBookmarksAdded: newBookmarks,
      alreadySyncedBookmarks: Math.max(0, mergedBookmarks.length - newBookmarks),
      totalHistoryFound: mergedHistory.length,
      newHistoryAdded: newHistory,
      totalCredentialsFound: mergedCredentials.length,
      perProfile:
        mergedBookmarks.length > 0 || mergedHistory.length > 0 || mergedCredentials.length > 0
          ? [
              {
                profileId: 'folder',
                browserName: 'Selected Profile Folder',
                profileName: 'Local Files',
                bookmarksFound: mergedBookmarks.length,
                bookmarksAdded: newBookmarks,
                historyFound: mergedHistory.length,
                historyAdded: newHistory,
                credentialsFound: mergedCredentials.length,
              },
            ]
          : [],
      notes,
    });
    e.target.value = '';
  };

  const handleQuickDemoSync = (targetSources: BrowserSourceId[]) => {
    const allBookmarks: BookmarkItem[] = [];
    const allHistory: HistoryItem[] = [];
    const allCreds: VaultCredential[] = [];
    const perProfile: SyncProfileReceiptItem[] = [];

    for (const id of targetSources) {
      const sample = getSampleProfileData(id);
      const res = onImportProfileData({
        bookmarks: sample.bookmarks,
        history: sample.history,
        credentials: sample.credentials,
      });
      const addedBm = res?.newBookmarks ?? sample.bookmarks.length;
      const addedHist = res?.newHistory ?? sample.history.length;
      allBookmarks.push(...sample.bookmarks);
      allHistory.push(...sample.history);
      allCreds.push(...sample.credentials);
      perProfile.push({
        profileId: id,
        browserName: BROWSER_PROFILE_SOURCES[id].name,
        profileName: 'Default',
        bookmarksFound: sample.bookmarks.length,
        bookmarksAdded: addedBm,
        historyFound: sample.history.length,
        historyAdded: addedHist,
        credentialsFound: sample.credentials.length,
      });
    }

    const totalNewBm = perProfile.reduce((s, p) => s + p.bookmarksAdded, 0);
    const totalNewHist = perProfile.reduce((s, p) => s + p.historyAdded, 0);
    setLocalSyncReceipt({
      message:
        targetSources.length === 1
          ? `Synced ${BROWSER_PROFILE_SOURCES[targetSources[0]].name}`
          : `Synced all ${targetSources.length} browsers`,
      syncedAt: Date.now(),
      totalBookmarksFound: allBookmarks.length,
      newBookmarksAdded: totalNewBm,
      alreadySyncedBookmarks: Math.max(0, allBookmarks.length - totalNewBm),
      totalHistoryFound: allHistory.length,
      newHistoryAdded: totalNewHist,
      totalCredentialsFound: allCreds.length,
      perProfile,
      notes: [],
    });
    setPreview(null);
  };

  const handleLoadSample = () => {
    setPreview(getSampleProfileData(source));
  };

  const handleConfirmImport = () => {
    if (!preview) return;
    const bookmarks = includeBookmarks ? preview.bookmarks : [];
    const history = includeHistory ? preview.history : [];
    const credentials = includePasswords ? preview.credentials : [];
    const res = onImportProfileData({ bookmarks, history, credentials });
    const addedBm = res?.newBookmarks ?? bookmarks.length;
    const addedHist = res?.newHistory ?? history.length;
    setLocalSyncReceipt({
      message: `Imported data from ${meta.name}`,
      syncedAt: Date.now(),
      totalBookmarksFound: bookmarks.length,
      newBookmarksAdded: addedBm,
      alreadySyncedBookmarks: Math.max(0, bookmarks.length - addedBm),
      totalHistoryFound: history.length,
      newHistoryAdded: addedHist,
      totalCredentialsFound: credentials.length,
      perProfile: [
        {
          profileId: source,
          browserName: meta.name,
          profileName: 'Manual Import',
          bookmarksFound: bookmarks.length,
          bookmarksAdded: addedBm,
          historyFound: history.length,
          historyAdded: addedHist,
          credentialsFound: credentials.length,
        },
      ],
      notes: [],
    });
    setPreview(null);
  };

  const isSyncingAll = syncingProfileId === 'all';
  const folderInputAttrs = { webkitdirectory: '', directory: '' } as Record<string, string>;

  return (
    <div className="space-y-5">
      {/* Instant 1-Click Sync Panel */}
      <div
        className="space-y-4 p-5 rounded-xl border border-white/10"
        style={{ backgroundColor: 'var(--fx-panel)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
              Instant Browser Sync (All Major Browsers)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Immediately pull bookmarks, history, and exported passwords from Chrome, Edge, Brave, Opera GX, Opera, Firefox, Vivaldi, Arc, LibreWolf &amp; Safari.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/25 border border-white/10 text-xs text-slate-200 cursor-pointer shrink-0">
            <span>Auto-sync on launch</span>
            <input
              type="checkbox"
              checked={autoSyncBrowsers}
              onChange={onToggleAutoSync}
              className="w-4 h-4"
              style={{ accentColor: 'var(--fx-accent)' }}
            />
          </label>
        </div>

        {nativeShell ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onSyncProfile('all')}
                disabled={detectedProfiles.length === 0 || syncingProfileId !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-45 transition-opacity"
                style={{ backgroundColor: 'var(--fx-accent)' }}
              >
                <Zap className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-pulse' : ''}`} aria-hidden="true" />
                {isSyncingAll
                  ? `Syncing ${detectedProfiles.length} Profile${detectedProfiles.length === 1 ? '' : 's'}...`
                  : `Sync All Detected (${detectedProfiles.length})`}
              </button>
              <button
                type="button"
                onClick={onRescanProfiles}
                disabled={syncingProfileId !== null || rescanningProfiles}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 disabled:opacity-45"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rescanningProfiles ? 'animate-spin' : ''}`} aria-hidden="true" />
                {rescanningProfiles ? 'Scanning PC...' : 'Rescan PC'}
              </button>
              {activeReceipt && (
                <span className="text-[11px] font-mono-tabular text-emerald-400">
                  Last synced {formatSyncTime(activeReceipt.syncedAt)}
                </span>
              )}
            </div>

            {/* Literal, Unmistakable Sync Receipt right below the Sync button */}
            {activeReceipt && (
              <div
                className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-2.5"
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>{activeReceipt.message}</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-emerald-300/80">
                    {formatSyncTime(activeReceipt.syncedAt)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-black/30 border border-white/8">
                    <div className="text-slate-400">Bookmarks</div>
                    <div className="font-mono-tabular font-semibold text-white mt-0.5">
                      +{activeReceipt.newBookmarksAdded} new
                    </div>
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      {activeReceipt.totalBookmarksFound} found · {activeReceipt.alreadySyncedBookmarks} already in FerroX
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-white/8">
                    <div className="text-slate-400">History</div>
                    <div className="font-mono-tabular font-semibold text-white mt-0.5">
                      +{activeReceipt.newHistoryAdded} new
                    </div>
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      {activeReceipt.totalHistoryFound} items scanned
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-white/8">
                    <div className="text-slate-400">Passwords</div>
                    <div className="font-mono-tabular font-semibold text-white mt-0.5">
                      {activeReceipt.totalCredentialsFound} imported
                    </div>
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      {activeReceipt.totalCredentialsFound > 0 ? 'Ready for Vault' : 'Export CSV for logins'}
                    </div>
                  </div>
                </div>

                {activeReceipt.perProfile.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-emerald-500/15">
                    {activeReceipt.perProfile.map((item) => (
                      <div
                        key={`${item.profileId}-${item.profileName}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="text-slate-200 font-medium">
                          {item.browserName} · <span className="text-slate-400 font-normal">{item.profileName}</span>
                        </span>
                        <span className="font-mono-tabular text-emerald-300/90">
                          {item.bookmarksFound} bm ({item.bookmarksAdded > 0 ? `+${item.bookmarksAdded} new` : 'up to date'}) · {item.historyFound} history ({item.historyAdded > 0 ? `+${item.historyAdded} new` : 'up to date'})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {onOpenHubSection && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenHubSection('bookmarks')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/16 text-[11px] font-medium text-white"
                    >
                      <Bookmark className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                      View Bookmarks{typeof bookmarksCount === 'number' ? ` (${bookmarksCount})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenHubSection('history')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/16 text-[11px] font-medium text-white"
                    >
                      <Clock className="w-3 h-3 text-sky-400" aria-hidden="true" />
                      View History{typeof historyCount === 'number' ? ` (${historyCount})` : ''}
                    </button>
                    {activeReceipt.totalCredentialsFound > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenHubSection('passwords')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/16 text-[11px] font-medium text-white"
                      >
                        <KeyRound className="w-3 h-3 text-amber-300" aria-hidden="true" />
                        Open Password Vault
                      </button>
                    )}
                  </div>
                )}

                {activeReceipt.notes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-300">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}

            {detectedProfiles.length > 0 ? (
              <div className="space-y-2">
                {detectedProfiles.map((profile) => {
                  const isBusy = syncingProfileId === profile.id || isSyncingAll;
                  const wasSynced = syncedProfileIds.includes(profile.id);
                  return (
                    <div
                      key={profile.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-black/25 border border-white/8"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <span>{profile.browserName}</span>
                          <span className="text-slate-500 font-normal">·</span>
                          <span className="text-slate-300 font-normal truncate">
                            {profile.profileName}
                          </span>
                          {wasSynced && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-medium">
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              Synced
                            </span>
                          )}
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>{profile.estimatedBookmarks} bookmarks</span>
                          <span>{profile.estimatedHistory} history items</span>
                          {profile.hasLoginsFile && (
                            <span className="text-slate-500">Logins file found</span>
                          )}
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-500 truncate mt-0.5">
                          {profile.profilePath}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSyncProfile(profile.id)}
                        disabled={syncingProfileId !== null}
                        className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/16 border border-white/12 text-xs font-medium text-white whitespace-nowrap disabled:opacity-45 shrink-0"
                      >
                        {isBusy ? 'Syncing...' : wasSynced ? 'Sync Again' : 'Sync Now'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-black/25 border border-white/8 text-xs text-slate-400">
                No Chrome, Edge, Brave, Opera GX, Opera, Firefox, Vivaldi, Arc, or Safari profiles were found in default system directories yet. Click{' '}
                <strong className="text-slate-200">Rescan PC</strong> or import exported files manually below.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-black/25 border border-white/8 text-xs text-slate-300 leading-relaxed">
              In the compiled Windows/macOS/Linux desktop binary, FerroX automatically scans and syncs{' '}
              <code className="font-mono-tabular text-white">Chrome, Edge, Brave, Opera GX, Opera, Vivaldi, Arc, Firefox, LibreWolf, Waterfox, Floorp &amp; Safari</code>{' '}
              (including Opera GX Default &amp; GX Profiles, even while open). In this web preview, pick any browser profile folder or test 1-click sync below:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleQuickDemoSync(['operagx', 'chrome', 'edge', 'brave', 'firefox', 'safari'])
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--fx-accent)' }}
              >
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                Sync All Detected (6)
              </button>

              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/16 border border-white/12 text-xs font-medium text-white cursor-pointer">
                <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Select Browser Profile Folder
                <input
                  type="file"
                  multiple
                  {...folderInputAttrs}
                  onChange={handleFolderSync}
                  className="sr-only"
                />
              </label>

              {(['operagx', 'chrome', 'edge', 'brave', 'firefox', 'safari'] as BrowserSourceId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleQuickDemoSync([id])}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200"
                >
                  <Zap className="w-3 h-3" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                  Sync {BROWSER_PROFILE_SOURCES[id].name}
                </button>
              ))}
            </div>

            {activeReceipt && (
              <div
                className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-2.5"
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>{activeReceipt.message}</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-emerald-300/80">
                    {formatSyncTime(activeReceipt.syncedAt)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-black/30 border border-white/8">
                    <div className="text-slate-400">Bookmarks</div>
                    <div className="font-mono-tabular font-semibold text-white mt-0.5">
                      +{activeReceipt.newBookmarksAdded} new
                    </div>
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      {activeReceipt.totalBookmarksFound} found · {activeReceipt.alreadySyncedBookmarks} already in FerroX
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-white/8">
                    <div className="text-slate-400">History</div>
                    <div className="font-mono-tabular font-semibold text-white mt-0.5">
                      +{activeReceipt.newHistoryAdded} new
                    </div>
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      {activeReceipt.totalHistoryFound} items scanned
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-white/8">
                    <div className="text-slate-400">Passwords</div>
                    <div className="font-mono-tabular font-semibold text-white mt-0.5">
                      {activeReceipt.totalCredentialsFound} imported
                    </div>
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      {activeReceipt.totalCredentialsFound > 0 ? 'Ready for Vault' : 'Export CSV for logins'}
                    </div>
                  </div>
                </div>

                {activeReceipt.perProfile.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-emerald-500/15">
                    {activeReceipt.perProfile.map((item) => (
                      <div
                        key={`${item.profileId}-${item.profileName}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="text-slate-200 font-medium">
                          {item.browserName} · <span className="text-slate-400 font-normal">{item.profileName}</span>
                        </span>
                        <span className="font-mono-tabular text-emerald-300/90">
                          {item.bookmarksFound} bm ({item.bookmarksAdded > 0 ? `+${item.bookmarksAdded} new` : 'up to date'}) · {item.historyFound} history ({item.historyAdded > 0 ? `+${item.historyAdded} new` : 'up to date'})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {onOpenHubSection && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenHubSection('bookmarks')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/16 text-[11px] font-medium text-white"
                    >
                      <Bookmark className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                      View Bookmarks{typeof bookmarksCount === 'number' ? ` (${bookmarksCount})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenHubSection('history')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/16 text-[11px] font-medium text-white"
                    >
                      <Clock className="w-3 h-3 text-sky-400" aria-hidden="true" />
                      View History{typeof historyCount === 'number' ? ` (${historyCount})` : ''}
                    </button>
                    {activeReceipt.totalCredentialsFound > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenHubSection('passwords')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/16 text-[11px] font-medium text-white"
                      >
                        <KeyRound className="w-3 h-3 text-amber-300" aria-hidden="true" />
                        Open Password Vault
                      </button>
                    )}
                  </div>
                )}

                {activeReceipt.notes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-300">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual File Import (Passwords CSV / Custom Backups) */}
      <div
        className="space-y-4 p-5 rounded-xl border border-white/10"
        style={{ backgroundColor: 'var(--fx-panel)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
              <FolderInput className="w-4 h-4" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
              Manual File Import (Passwords CSV, HTML &amp; JSON)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Drop exported <code className="font-mono-tabular text-slate-300">Chrome Passwords.csv</code>,{' '}
              <code className="font-mono-tabular text-slate-300">logins.csv</code>,{' '}
              <code className="font-mono-tabular text-slate-300">Bookmarks</code>, or{' '}
              <code className="font-mono-tabular text-slate-300">bookmarks.html</code> from any browser.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {ALL_BROWSER_SOURCE_IDS.map((id) => {
              const active = source === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSource(id);
                    setPreview(null);
                  }}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'text-white border-white/25'
                      : 'bg-black/20 border-white/8 text-slate-400 hover:text-white'
                  }`}
                  style={active ? { backgroundColor: 'var(--fx-accent)' } : undefined}
                >
                  {BROWSER_PROFILE_SOURCES[id].name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-black/25 border border-white/8 text-xs space-y-1">
          <div className="text-slate-300 font-medium">{meta.name} Profile Files</div>
          <div className="font-mono-tabular text-[11px] text-slate-400 break-all">
            Windows: {meta.windowsPath}
          </div>
          <div className="text-[11px] text-slate-500">
            Supported: {meta.supportedFiles}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/16 border border-white/12 text-xs font-medium text-white cursor-pointer">
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            Select {meta.name} File(s)
            <input
              type="file"
              multiple
              accept=".json,.html,.htm,.csv,*"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200"
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
            Preview Sample {meta.name} Data
          </button>
        </div>

        {preview && (
          <div className="p-4 rounded-lg bg-black/30 border border-white/12 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                Ready to import from {meta.name}
              </span>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {preview.detectedFormats.join(' · ') || 'No supported entries found'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <label className="flex items-center justify-between p-2.5 rounded bg-white/5 border border-white/8 cursor-pointer">
                <span className="text-slate-200">Bookmarks ({preview.bookmarks.length})</span>
                <input
                  type="checkbox"
                  checked={includeBookmarks}
                  onChange={(e) => setIncludeBookmarks(e.target.checked)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded bg-white/5 border border-white/8 cursor-pointer">
                <span className="text-slate-200">History ({preview.history.length})</span>
                <input
                  type="checkbox"
                  checked={includeHistory}
                  onChange={(e) => setIncludeHistory(e.target.checked)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded bg-white/5 border border-white/8 cursor-pointer">
                <span className="text-slate-200">Passwords ({preview.credentials.length})</span>
                <input
                  type="checkbox"
                  checked={includePasswords}
                  onChange={(e) => setIncludePasswords(e.target.checked)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--fx-accent)' }}
              >
                Import Selected Data
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
