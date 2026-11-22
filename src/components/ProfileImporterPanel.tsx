import { ChangeEvent, useState } from 'react';
import { CheckCircle2, FolderInput, Sparkles, Upload } from 'lucide-react';
import { BookmarkItem, HistoryItem } from '../lib/browserEngine';
import {
  BROWSER_PROFILE_SOURCES,
  BrowserSourceId,
  getSampleProfileData,
  ImportedProfilePreview,
  parseProfilePayload,
} from '../lib/profileImporter';
import { VaultCredential } from '../lib/vaultCrypto';

interface ProfileImporterPanelProps {
  onImportProfileData: (data: {
    bookmarks: BookmarkItem[];
    history: HistoryItem[];
    credentials: VaultCredential[];
  }) => void;
}

export function ProfileImporterPanel({ onImportProfileData }: ProfileImporterPanelProps) {
  const [source, setSource] = useState<BrowserSourceId>('operagx');
  const [preview, setPreview] = useState<ImportedProfilePreview | null>(null);
  const [includeBookmarks, setIncludeBookmarks] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includePasswords, setIncludePasswords] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
    e.target.value = '';
  };

  const handleLoadSample = () => {
    setPreview(getSampleProfileData(source));
    setStatusMessage(null);
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
    setPreview(null);
  };

  return (
    <div className="space-y-4 p-5 rounded-xl border border-white/10" style={{ backgroundColor: 'var(--fx-panel)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <FolderInput className="w-4 h-4" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
            Import Browser Profile &amp; Data
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Migrate bookmarks, browsing history, and exported logins from Opera GX or Mozilla Firefox.
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
                  setStatusMessage(null);
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

      {/* Profile Path Hint */}
      <div className="p-3 rounded-lg bg-black/25 border border-white/8 text-xs space-y-1">
        <div className="text-slate-300 font-medium">{meta.name} Profile Files</div>
        <div className="font-mono-tabular text-[11px] text-slate-400 break-all">
          Windows: {meta.windowsPath}
        </div>
        <div className="text-[11px] text-slate-500">
          Supported: {meta.supportedFiles}
        </div>
      </div>

      {/* Upload or Sample Trigger */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/16 border border-white/12 text-xs font-medium text-white cursor-pointer">
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          Select {meta.name} Profile File(s)
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
          Load Sample {meta.name} Profile
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

      {statusMessage && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
}
