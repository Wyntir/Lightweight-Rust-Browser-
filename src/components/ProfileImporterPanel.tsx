import { ChangeEvent, useState } from 'react';
import {
  CheckCircle2,
  FolderInput,
  FolderOpen,
  Info,
  RefreshCw,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import { BookmarkItem, HistoryItem } from '../lib/browserEngine';
import {
  BROWSER_PROFILE_SOURCES,
  BrowserSourceId,
  getSampleProfileData,
  ImportedProfilePreview,
  parseProfilePayload,
} from '../lib/profileImporter';
import { DetectedBrowserProfile, isRustNativeShell } from '../lib/rustBridge';
import { VaultCredential } from '../lib/vaultCrypto';

export interface SyncSummary {
  message: string;
  notes: string[];
}

interface ProfileImporterPanelProps {
  detectedProfiles: DetectedBrowserProfile[];
  autoSyncBrowsers: boolean;
  syncingProfileId: string | null;
  lastSyncSummary: SyncSummary | null;
  onToggleAutoSync: () => void;
  onRescanProfiles: () => void;
  onSyncProfile: (profileId: string) => void;
  onImportProfileData: (data: {
    bookmarks: BookmarkItem[];
    history: HistoryItem[];
    credentials: VaultCredential[];
  }) => void;
}

const SUPPORTED_FOLDER_FILE_RE =
  /(^|\/)(bookmarks|bookmarks\.html|bookmarks\.json|bookmarks-[^/]+\.json|logins\.csv|passwords\.csv|opera passwords\.csv|chrome passwords\.csv)$/i;

export function ProfileImporterPanel({
  detectedProfiles,
  autoSyncBrowsers,
  syncingProfileId,
  lastSyncSummary,
  onToggleAutoSync,
  onRescanProfiles,
  onSyncProfile,
  onImportProfileData,
}: ProfileImporterPanelProps) {
  const nativeShell = isRustNativeShell();
  const [source, setSource] = useState<BrowserSourceId>('operagx');
  const [preview, setPreview] = useState<ImportedProfilePreview | null>(null);
  const [includeBookmarks, setIncludeBookmarks] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includePasswords, setIncludePasswords] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [folderNotes, setFolderNotes] = useState<string[]>([]);

  const meta = BROWSER_PROFILE_SOURCES[source];

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
    setStatusMessage(null);
    setFolderNotes([]);
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
        const inferredSource: BrowserSourceId =
          lower.includes('firefox') || lower.includes('mozilla') || lower.includes('bookmarkbackups')
            ? 'firefox'
            : 'operagx';
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

    if (mergedBookmarks.length > 0 || mergedHistory.length > 0 || mergedCredentials.length > 0) {
      onImportProfileData({
        bookmarks: mergedBookmarks,
        history: mergedHistory,
        credentials: mergedCredentials,
      });
      setStatusMessage(
        `Synced ${mergedBookmarks.length} bookmarks, ${mergedHistory.length} history entries, and ${mergedCredentials.length} logins from selected folder.`
      );
    } else {
      setStatusMessage('No plain-text bookmark/CSV files found in that folder.');
    }
    setFolderNotes(notes);
    e.target.value = '';
  };

  const handleQuickDemoSync = (targetSource: BrowserSourceId) => {
    const sample = getSampleProfileData(targetSource);
    onImportProfileData({
      bookmarks: sample.bookmarks,
      history: sample.history,
      credentials: sample.credentials,
    });
    setStatusMessage(
      `Synced ${sample.bookmarks.length} bookmarks, ${sample.history.length} history entries, and ${sample.credentials.length} logins from ${BROWSER_PROFILE_SOURCES[targetSource].name}.`
    );
    setFolderNotes([]);
    setPreview(null);
  };

  const handleLoadSample = () => {
    setPreview(getSampleProfileData(source));
    setStatusMessage(null);
    setFolderNotes([]);
  };

  const handleConfirmImport = () => {
    if (!preview) return;
    const bookmarks = includeBookmarks ? preview.bookmarks : [];
    const history = includeHistory ? preview.history : [];
    const credentials = includePasswords ? preview.credentials : [];
    onImportProfileData({ bookmarks, history, credentials });
    setStatusMessage(
      `Imported ${bookmarks.length} bookmarks, ${history.length} history entries, and ${credentials.length} logins from ${meta.name}.`
    );
    setFolderNotes([]);
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
              Instant Browser Sync (Opera GX, Opera &amp; Firefox)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Immediately pull bookmarks, history, and exported passwords from installed browsers so switching is painless.
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
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                {isSyncingAll
                  ? 'Syncing All Browsers...'
                  : `Sync All Detected (${detectedProfiles.length})`}
              </button>
              <button
                type="button"
                onClick={onRescanProfiles}
                disabled={syncingProfileId !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 disabled:opacity-45"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Rescan PC
              </button>
            </div>

            {detectedProfiles.length > 0 ? (
              <div className="space-y-2">
                {detectedProfiles.map((profile) => {
                  const isBusy = syncingProfileId === profile.id || isSyncingAll;
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
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>{profile.estimatedBookmarks} bookmarks</span>
                          <span>{profile.estimatedHistory} history items</span>
                          {profile.hasLoginsFile && (
                            <span className="text-slate-500">Logins detected</span>
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
                        {isBusy ? 'Syncing...' : 'Sync Now'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-black/25 border border-white/8 text-xs text-slate-400">
                No Opera GX, Opera, or Mozilla Firefox profiles were found in default system directories yet. Click{' '}
                <strong className="text-slate-200">Rescan PC</strong> or import exported files manually below.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-black/25 border border-white/8 text-xs text-slate-300 leading-relaxed">
              In the compiled Windows/macOS/Linux desktop binary, FerroX automatically reads live{' '}
              <code className="font-mono-tabular text-white">Opera GX / Opera</code> and{' '}
              <code className="font-mono-tabular text-white">Firefox places.sqlite</code> profiles (even while they are open). In this web preview, pick a profile folder or test 1-click sync below:
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <label
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--fx-accent)' }}
              >
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

              <button
                type="button"
                onClick={() => handleQuickDemoSync('operagx')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200"
              >
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                1-Click Sync Opera GX
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoSync('firefox')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200"
              >
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                1-Click Sync Firefox
              </button>
            </div>
          </div>
        )}

        {lastSyncSummary && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{lastSyncSummary.message}</span>
            </div>
            {lastSyncSummary.notes.map((note, idx) => (
              <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-400 pl-6">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" aria-hidden="true" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        )}

        {statusMessage && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{statusMessage}</span>
            </div>
            {folderNotes.map((note, idx) => (
              <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-400 pl-6">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" aria-hidden="true" />
                <span>{note}</span>
              </div>
            ))}
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
              Drop exported <code className="font-mono-tabular text-slate-300">logins.csv</code>,{' '}
              <code className="font-mono-tabular text-slate-300">Opera Passwords.csv</code>, or bookmark backup files directly.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(['operagx', 'firefox'] as BrowserSourceId[]).map((id) => {
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
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
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
