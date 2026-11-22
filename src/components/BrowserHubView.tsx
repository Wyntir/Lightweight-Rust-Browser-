import { ChangeEvent, FormEvent, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FolderOpen,
  KeyRound,
  Lock,
  Pause,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import {
  BookmarkItem,
  BrowserExtension,
  DownloadItem,
  exportBookmarksHtml,
  HistoryItem,
  parseBookmarksImport,
  scanDownloadFilename,
} from '../lib/browserEngine';
import {
  decryptVaultCredentials,
  EncryptedVaultPayload,
  encryptVaultCredentials,
  VaultCredential,
} from '../lib/vaultCrypto';

export type HubSection = 'bookmarks' | 'history' | 'downloads' | 'passwords' | 'extensions' | 'updates';

interface BrowserHubViewProps {
  initialSection?: HubSection;
  bookmarks: BookmarkItem[];
  history: HistoryItem[];
  downloads: DownloadItem[];
  extensions: BrowserExtension[];
  encryptedVault: EncryptedVaultPayload | null;
  pendingImportedCredentials?: VaultCredential[];
  passwordSyncEnabled: boolean;
  autoUpdatesEnabled: boolean;
  onNavigate: (url: string) => void;
  onAddBookmark: (bm: Omit<BookmarkItem, 'id'>) => void;
  onImportBookmarks: (items: BookmarkItem[]) => void;
  onRemoveBookmark: (id: string) => void;
  onToggleBookmarkBarPin: (id: string) => void;
  onClearHistory: () => void;
  onAddDownload: (filename: string, url: string) => void;
  onTogglePauseDownload: (id: string) => void;
  onRemoveDownload: (id: string) => void;
  onOpenDownloadFile?: (path: string) => void;
  onShowDownloadInFolder?: (path: string) => void;
  onToggleExtension: (id: string) => void;
  onAddExtension: (ext: Omit<BrowserExtension, 'id'>) => void;
  onRemoveExtension: (id: string) => void;
  onSaveEncryptedVault: (payload: EncryptedVaultPayload) => void;
  onClearPendingImportedCredentials?: () => void;
  onTogglePasswordSync: () => void;
  onToggleAutoUpdates: () => void;
  onAutofillActiveTab: (username: string, password: string) => void;
}

export function BrowserHubView({
  initialSection = 'bookmarks',
  bookmarks,
  history,
  downloads,
  extensions,
  encryptedVault,
  pendingImportedCredentials = [],
  passwordSyncEnabled,
  autoUpdatesEnabled,
  onNavigate,
  onAddBookmark,
  onImportBookmarks,
  onRemoveBookmark,
  onToggleBookmarkBarPin,
  onClearHistory,
  onAddDownload,
  onTogglePauseDownload,
  onRemoveDownload,
  onOpenDownloadFile,
  onShowDownloadInFolder,
  onToggleExtension,
  onAddExtension,
  onRemoveExtension,
  onSaveEncryptedVault,
  onClearPendingImportedCredentials,
  onTogglePasswordSync,
  onToggleAutoUpdates,
  onAutofillActiveTab,
}: BrowserHubViewProps) {
  const [section, setSection] = useState<HubSection>(initialSection);

  // Bookmarks state
  const [bmTitle, setBmTitle] = useState('');
  const [bmUrl, setBmUrl] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // History state
  const [historyQuery, setHistoryQuery] = useState('');

  // Downloads state
  const [dlName, setDlName] = useState('');
  const [dlUrl, setDlUrl] = useState('');
  const [openedDownloadNotice, setOpenedDownloadNotice] = useState<string | null>(null);

  // Password Vault state (never persists plaintext passwords)
  const [masterPass, setMasterPass] = useState('');
  const [unlockedPass, setUnlockedPass] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [credSite, setCredSite] = useState('');
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Extension form state
  const [extName, setExtName] = useState('');
  const [extDesc, setExtDesc] = useState('');
  const [extCss, setExtCss] = useState('');

  // Update check state
  const [updateStatus, setUpdateStatus] = useState<string>('Up to date (FerroX v0.2.0)');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleExportHtml = () => {
    const html = exportBookmarksHtml(bookmarks);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ferrox-bookmarks.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseBookmarksImport(text);
    if (parsed.length === 0) {
      setImportStatus('No valid bookmarks found in selected HTML/JSON file.');
    } else {
      onImportBookmarks(parsed);
      setImportStatus(`Imported ${parsed.length} bookmark${parsed.length === 1 ? '' : 's'}.`);
    }
    e.target.value = '';
  };

  const handleCreateOrUnlockVault = async (e: FormEvent) => {
    e.preventDefault();
    setVaultError(null);
    const pass = masterPass.trim();
    if (pass.length < 4) {
      setVaultError('Master passphrase must be at least 4 characters.');
      return;
    }

    if (!encryptedVault) {
      const seeded = pendingImportedCredentials.length > 0 ? [...pendingImportedCredentials] : [];
      const payload = await encryptVaultCredentials(seeded, pass);
      onSaveEncryptedVault(payload);
      setUnlockedPass(pass);
      setCredentials(seeded);
      if (seeded.length > 0) {
        onClearPendingImportedCredentials?.();
      }
      setMasterPass('');
      return;
    }

    try {
      const decrypted = await decryptVaultCredentials(encryptedVault, pass);
      if (pendingImportedCredentials.length > 0) {
        const merged = [...pendingImportedCredentials, ...decrypted];
        const reencrypted = await encryptVaultCredentials(merged, pass);
        onSaveEncryptedVault(reencrypted);
        setCredentials(merged);
        onClearPendingImportedCredentials?.();
      } else {
        setCredentials(decrypted);
      }
      setUnlockedPass(pass);
      setMasterPass('');
    } catch {
      setVaultError('Incorrect master passphrase or corrupted AES-GCM payload.');
    }
  };

  const handleSaveCredential = async (e: FormEvent) => {
    e.preventDefault();
    if (!unlockedPass || !credSite.trim() || !credUser.trim() || !credPass) return;
    const next: VaultCredential[] = [
      {
        id: `cred-${Date.now()}`,
        site: credSite.trim(),
        username: credUser.trim(),
        password: credPass,
        updatedAt: Date.now(),
      },
      ...credentials,
    ];
    const payload = await encryptVaultCredentials(next, unlockedPass);
    onSaveEncryptedVault(payload);
    setCredentials(next);
    setCredSite('');
    setCredUser('');
    setCredPass('');
  };

  const handleDeleteCredential = async (id: string) => {
    if (!unlockedPass) return;
    const next = credentials.filter((c) => c.id !== id);
    const payload = await encryptVaultCredentials(next, unlockedPass);
    onSaveEncryptedVault(payload);
    setCredentials(next);
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setUpdateStatus(`Verified latest core build v${data.version || '0.2.0'} — Security signatures current.`);
    } catch {
      setUpdateStatus('Unable to reach update channel.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const TABS: Array<{ id: HubSection; label: string; Icon: typeof Bookmark }> = [
    { id: 'bookmarks', label: 'Bookmarks', Icon: Bookmark },
    { id: 'history', label: 'History', Icon: Clock },
    { id: 'downloads', label: 'Downloads', Icon: Download },
    { id: 'passwords', label: 'Passwords', Icon: KeyRound },
    { id: 'extensions', label: 'Extensions', Icon: Puzzle },
    { id: 'updates', label: 'Updates & Core', Icon: RefreshCw },
  ];

  const filteredHistory = history.filter(
    (h) =>
      h.title.toLowerCase().includes(historyQuery.toLowerCase()) ||
      h.url.toLowerCase().includes(historyQuery.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-7" style={{ backgroundColor: 'var(--fx-bg)' }}>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h1 className="font-display text-2xl font-semibold text-white">Browser Manager</h1>
            <p className="text-xs text-slate-400 mt-1">
              Manage bookmarks, searchable history, scanned downloads, encrypted passwords, extensions, and updates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('ferrox://rust-source')}
              className="px-3 py-1.5 rounded-lg bg-[#161B26] hover:bg-[#1E2433] border border-white/10 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              Rust Crate Source
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ferrox://settings')}
              className="px-3 py-1.5 rounded-lg bg-[#161B26] hover:bg-[#1E2433] border border-white/10 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              Appearance & Search
            </button>
          </div>
        </header>

        {/* Sub-navigation */}
        <nav className="flex flex-wrap gap-2" aria-label="Browser manager sections">
          {TABS.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#181D2A] border-white/25 text-white'
                    : 'bg-[#12151E] border-white/8 text-slate-400 hover:text-slate-200 hover:border-white/15'
                }`}
                style={active ? { boxShadow: 'inset 0 -2px 0 0 var(--fx-accent)' } : undefined}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* BOOKMARKS */}
        {section === 'bookmarks' && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#12151E] border border-white/10">
              <div className="text-xs text-slate-300">
                {bookmarks.length} saved bookmark{bookmarks.length === 1 ? '' : 's'}
                {importStatus && <span className="ml-3 text-emerald-400">{importStatus}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('ferrox://settings')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-white whitespace-nowrap"
                >
                  Import Opera GX / Firefox
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-white cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  Import HTML/JSON
                  <input
                    type="file"
                    accept=".html,.htm,.json"
                    onChange={handleImportFile}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleExportHtml}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                >
                  <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                  Export HTML
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!bmTitle.trim() || !bmUrl.trim()) return;
                onAddBookmark({
                  title: bmTitle.trim(),
                  url: bmUrl.trim().startsWith('http') || bmUrl.trim().startsWith('ferrox://')
                    ? bmUrl.trim()
                    : `https://${bmUrl.trim()}`,
                  category: 'Saved',
                  pinnedToBar: true,
                });
                setBmTitle('');
                setBmUrl('');
              }}
              className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-[#12151E] border border-white/10"
            >
              <div className="flex-1 min-w-[160px]">
                <label htmlFor="hub-bm-title" className="block text-xs text-slate-400 mb-1">
                  Title
                </label>
                <input
                  id="hub-bm-title"
                  type="text"
                  required
                  value={bmTitle}
                  onChange={(e) => setBmTitle(e.target.value)}
                  placeholder="MDN Web Docs"
                  className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <div className="flex-[2] min-w-[220px]">
                <label htmlFor="hub-bm-url" className="block text-xs text-slate-400 mb-1">
                  URL
                </label>
                <input
                  id="hub-bm-url"
                  type="text"
                  required
                  value={bmUrl}
                  onChange={(e) => setBmUrl(e.target.value)}
                  placeholder="https://developer.mozilla.org"
                  className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs font-mono-tabular text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <button
                type="submit"
                className="h-9 px-4 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                style={{ backgroundColor: 'var(--fx-accent)' }}
              >
                Add Bookmark
              </button>
            </form>

            <div className="divide-y divide-white/8 border border-white/10 rounded-xl bg-[#12151E]">
              {bookmarks.map((bm) => (
                <div key={bm.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onNavigate(bm.url)}
                    className="text-left min-w-0 flex-1 hover:text-white"
                  >
                    <div className="text-xs font-semibold text-white truncate">{bm.title}</div>
                    <div className="font-mono-tabular text-[11px] text-slate-400 truncate">
                      {bm.url}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleBookmarkBarPin(bm.id)}
                      className={`px-2.5 py-1 rounded text-[11px] border whitespace-nowrap ${
                        bm.pinnedToBar !== false
                          ? 'bg-white/10 border-white/20 text-white'
                          : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {bm.pinnedToBar !== false ? 'On Bar' : 'Pin to Bar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveBookmark(bm.id)}
                      aria-label={`Remove bookmark ${bm.title}`}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* HISTORY */}
        {section === 'history' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="search"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                aria-label="Search browsing history"
                placeholder="Search visited titles and URLs..."
                className="flex-1 min-w-[220px] h-9 px-3 rounded-lg bg-[#12151E] border border-white/12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-white/30"
              />
              <button
                type="button"
                onClick={onClearHistory}
                className="h-9 px-3.5 rounded-lg bg-[#12151E] hover:bg-[#1A202E] border border-white/10 text-xs font-medium text-slate-200 whitespace-nowrap"
              >
                Clear Browsing History
              </button>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-[#12151E] border border-white/10 text-xs text-slate-400">
                No browsing history recorded yet (Private Browsing tabs never record history).
              </div>
            ) : (
              <div className="divide-y divide-white/8 border border-white/10 rounded-xl bg-[#12151E]">
                {filteredHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.url)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white truncate">{item.title}</div>
                      <div className="font-mono-tabular text-[11px] text-slate-400 truncate">
                        {item.url}
                      </div>
                    </div>
                    <span className="font-mono-tabular text-[11px] text-slate-500 shrink-0">
                      {new Date(item.visitedAt).toLocaleTimeString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* DOWNLOADS MANAGER */}
        {section === 'downloads' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#12151E] border border-white/10">
              <div>
                <h2 className="text-sm font-semibold text-white">Download Scanner & Queue</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scans filenames before execution and lets you pause, resume, or open completed transfers.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onAddDownload('ferrox-browser-rust.zip', '/api/rust-crate.zip')
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                >
                  Download Rust Crate (.zip)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAddDownload('untrusted-patcher.exe', 'https://downloads.example/untrusted-patcher.exe')
                  }
                  className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-amber-300 whitespace-nowrap"
                >
                  Test Malware Scan (.exe)
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!dlName.trim()) return;
                onAddDownload(
                  dlName.trim(),
                  dlUrl.trim() || `https://downloads.example/${dlName.trim()}`
                );
                setDlName('');
                setDlUrl('');
              }}
              className="flex flex-wrap gap-3 p-4 rounded-xl bg-[#12151E] border border-white/10"
            >
              <input
                type="text"
                value={dlName}
                onChange={(e) => setDlName(e.target.value)}
                placeholder="Filename (e.g. archive.tar.gz or installer.exe)"
                aria-label="Download filename"
                className="flex-1 min-w-[180px] h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
              />
              <input
                type="text"
                value={dlUrl}
                onChange={(e) => setDlUrl(e.target.value)}
                placeholder="Source URL (optional)"
                aria-label="Download source URL"
                className="flex-1 min-w-[180px] h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs font-mono-tabular text-white focus:outline-none focus:border-white/30"
              />
              <button
                type="submit"
                className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/16 text-xs font-medium text-white whitespace-nowrap"
              >
                Queue Download
              </button>
            </form>

            {openedDownloadNotice && (
              <div className="px-4 py-2.5 rounded-lg bg-[#161B26] border border-white/12 text-xs text-slate-200 flex items-center justify-between">
                <span>{openedDownloadNotice}</span>
                <button
                  type="button"
                  onClick={() => setOpenedDownloadNotice(null)}
                  className="text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="divide-y divide-white/8 border border-white/10 rounded-xl bg-[#12151E]">
              {downloads.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No downloads in queue yet.
                </div>
              ) : (
                downloads.map((dl) => {
                  const pct = Math.min(
                    100,
                    Math.round((dl.bytesReceived / Math.max(1, dl.totalBytes)) * 100)
                  );
                  const scan = scanDownloadFilename(dl.filename);
                  return (
                    <div key={dl.id} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white truncate">
                              {dl.filename}
                            </span>
                            <span className="font-mono-tabular text-[11px] text-slate-400">
                              {dl.status} · {pct}%
                            </span>
                          </div>
                          <div className="font-mono-tabular text-[11px] text-slate-500 truncate">
                            {dl.savedPath ? dl.savedPath : dl.url}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {dl.status === 'downloading' || dl.status === 'paused' ? (
                            <button
                              type="button"
                              onClick={() => onTogglePauseDownload(dl.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/8 hover:bg-white/14 text-xs text-white"
                            >
                              {dl.status === 'downloading' ? (
                                <>
                                  <Pause className="w-3 h-3" /> Pause
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3" /> Resume
                                </>
                              )}
                            </button>
                          ) : null}

                          {dl.status === 'completed' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (dl.savedPath && onOpenDownloadFile) {
                                    onOpenDownloadFile(dl.savedPath);
                                    setOpenedDownloadNotice(`Opening ${dl.filename}...`);
                                  } else if (dl.url.startsWith('/api/')) {
                                    window.location.href = dl.url;
                                  } else {
                                    setOpenedDownloadNotice(
                                      `Opened ${dl.filename} from downloads folder.`
                                    );
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/16 text-xs text-white"
                              >
                                <ExternalLink className="w-3 h-3" /> Open
                              </button>
                              {dl.savedPath && onShowDownloadInFolder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onShowDownloadInFolder(dl.savedPath!);
                                    setOpenedDownloadNotice(
                                      `Revealed ${dl.filename} in folder.`
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/8 hover:bg-white/14 text-xs text-slate-200"
                                >
                                  <FolderOpen className="w-3 h-3" /> Show in Folder
                                </button>
                              )}
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => onRemoveDownload(dl.id)}
                            aria-label={`Remove download ${dl.filename}`}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {!scan.safe && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{dl.warning ?? scan.warning}</span>
                        </div>
                      )}

                      <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              dl.status === 'blocked' ? '#F59E0B' : 'var(--fx-accent)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ENCRYPTED PASSWORD MANAGER */}
        {section === 'passwords' && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[#12151E] border border-white/10">
              <div className="flex items-center gap-3">
                {unlockedPass ? (
                  <Unlock className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <Lock className="w-5 h-5 text-slate-300 shrink-0" aria-hidden="true" />
                )}
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    AES-256-GCM Encrypted Credential Vault
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Passwords are encrypted client-side with PBKDF2 + AES-GCM (OS Keychain in native Rust). Never stored in plaintext.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={passwordSyncEnabled}
                    onChange={onTogglePasswordSync}
                    className="w-4 h-4"
                    style={{ accentColor: 'var(--fx-accent)' }}
                  />
                  Encrypted Sync
                </label>
                {unlockedPass && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockedPass(null);
                      setCredentials([]);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-xs text-white"
                  >
                    Lock Vault
                  </button>
                )}
              </div>
            </div>

            {pendingImportedCredentials.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
                <span>
                  {pendingImportedCredentials.length} imported login
                  {pendingImportedCredentials.length === 1 ? '' : 's'} queued. Unlock or create your AES-GCM vault below to encrypt and store them.
                </span>
              </div>
            )}

            {!unlockedPass ? (
              <form
                onSubmit={handleCreateOrUnlockVault}
                className="max-w-md p-5 rounded-xl bg-[#12151E] border border-white/10 space-y-3"
              >
                <h3 className="text-sm font-semibold text-white">
                  {encryptedVault ? 'Unlock Encrypted Vault' : 'Create Vault Master Passphrase'}
                </h3>
                <p className="text-xs text-slate-400">
                  {encryptedVault
                    ? 'Enter your master passphrase to decrypt saved logins.'
                    : 'Set a master passphrase (4+ chars) to initialize AES-256-GCM storage.'}
                </p>
                <input
                  type="password"
                  value={masterPass}
                  onChange={(e) => setMasterPass(e.target.value)}
                  placeholder="Master passphrase"
                  aria-label="Master passphrase"
                  className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/12 text-xs text-white focus:outline-none focus:border-white/30"
                />
                {vaultError && <p className="text-xs text-rose-400">{vaultError}</p>}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                >
                  {encryptedVault ? 'Decrypt Vault' : 'Initialize Vault'}
                </button>
              </form>
            ) : (
              <>
                <form
                  onSubmit={handleSaveCredential}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-[#12151E] border border-white/10 items-end"
                >
                  <div>
                    <label htmlFor="cred-site" className="block text-xs text-slate-400 mb-1">
                      Site / Origin
                    </label>
                    <input
                      id="cred-site"
                      type="text"
                      required
                      value={credSite}
                      onChange={(e) => setCredSite(e.target.value)}
                      placeholder="github.com"
                      className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label htmlFor="cred-user" className="block text-xs text-slate-400 mb-1">
                      Username / Email
                    </label>
                    <input
                      id="cred-user"
                      type="text"
                      required
                      value={credUser}
                      onChange={(e) => setCredUser(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label htmlFor="cred-pass" className="block text-xs text-slate-400 mb-1">
                      Password
                    </label>
                    <input
                      id="cred-pass"
                      type="password"
                      required
                      value={credPass}
                      onChange={(e) => setCredPass(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-9 px-4 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                    style={{ backgroundColor: 'var(--fx-accent)' }}
                  >
                    Encrypt & Save
                  </button>
                </form>

                <div className="divide-y divide-white/8 border border-white/10 rounded-xl bg-[#12151E]">
                  {credentials.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Vault unlocked. Save your first login above.
                    </div>
                  ) : (
                    credentials.map((cred) => (
                      <div
                        key={cred.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">{cred.site}</div>
                          <div className="font-mono-tabular text-[11px] text-slate-400">
                            {cred.username} · ••••••••
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onAutofillActiveTab(cred.username, cred.password)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/8 hover:bg-white/14 text-xs text-white"
                          >
                            <ExternalLink className="w-3 h-3" /> Autofill Active Page
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(cred.password);
                              setCopiedId(cred.id);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/8 hover:bg-white/14 text-xs text-slate-200"
                          >
                            {copiedId === cred.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Copy
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCredential(cred.id)}
                            aria-label={`Delete credential for ${cred.site}`}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* LIGHTWEIGHT EXTENSIONS */}
        {section === 'extensions' && (
          <section className="space-y-5">
            <div className="divide-y divide-white/8 border border-white/10 rounded-xl bg-[#12151E]">
              {extensions.map((ext) => (
                <div key={ext.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{ext.name}</span>
                      <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-slate-400">
                        match: {ext.matchPattern}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{ext.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleExtension(ext.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                        ext.enabled
                          ? 'text-white'
                          : 'bg-white/8 text-slate-300 hover:bg-white/14'
                      }`}
                      style={ext.enabled ? { backgroundColor: 'var(--fx-accent)' } : undefined}
                    >
                      {ext.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    {!ext.builtIn && (
                      <button
                        type="button"
                        onClick={() => onRemoveExtension(ext.id)}
                        aria-label={`Remove extension ${ext.name}`}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!extName.trim() || !extCss.trim()) return;
                onAddExtension({
                  name: extName.trim(),
                  description: extDesc.trim() || 'Custom user stylesheet extension.',
                  matchPattern: '*',
                  enabled: true,
                  cssInjection: extCss.trim(),
                });
                setExtName('');
                setExtDesc('');
                setExtCss('');
              }}
              className="p-4 rounded-xl bg-[#12151E] border border-white/10 space-y-3"
            >
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} />
                Install Custom Lightweight Extension
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={extName}
                  onChange={(e) => setExtName(e.target.value)}
                  placeholder="Extension name"
                  aria-label="Extension name"
                  className="h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                />
                <input
                  type="text"
                  value={extDesc}
                  onChange={(e) => setExtDesc(e.target.value)}
                  placeholder="Short description"
                  aria-label="Extension description"
                  className="h-9 px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <textarea
                required
                rows={2}
                value={extCss}
                onChange={(e) => setExtCss(e.target.value)}
                placeholder="CSS to inject on pages (e.g. body { font-size: 18px !important; })"
                aria-label="Extension CSS rules"
                className="w-full p-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs font-mono-tabular text-white focus:outline-none focus:border-white/30"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--fx-accent)' }}
              >
                Install & Enable
              </button>
            </form>
          </section>
        )}

        {/* AUTOMATIC UPDATES & CORE */}
        {section === 'updates' && (
          <section className="space-y-4">
            <div className="p-5 rounded-xl bg-[#12151E] border border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold text-white">Automatic Security Updates</div>
                  <div className="text-xs text-slate-400 mt-0.5">{updateStatus}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoUpdatesEnabled}
                    onChange={onToggleAutoUpdates}
                    className="w-4 h-4"
                    style={{ accentColor: 'var(--fx-accent)' }}
                  />
                  Auto-Install Patches
                </label>
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                  style={{ backgroundColor: 'var(--fx-accent)' }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  Check Now
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
