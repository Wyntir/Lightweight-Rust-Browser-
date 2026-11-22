import { useEffect, useState } from 'react';
import { Check, Copy, Cpu, Download, FileCode2, Shield, Terminal } from 'lucide-react';
import { isRustNativeShell } from '../lib/rustBridge';

interface RustFileEntry {
  path: string;
  language: string;
  sizeBytes: number;
  content: string;
}

const NATIVE_CRATE_MODULES = [
  { path: 'src/main.rs', desc: 'Dual-WebView desktop host (wry + tao), IPC router & telemetry ticker' },
  { path: 'src/browser.rs', desc: 'Persistent config.json store, omnibox normalizer & bookmarks' },
  { path: 'src/limiter.rs', desc: 'Live sysinfo process RAM/CPU sampling & auto-hibernation engine' },
  { path: 'src/tabs.rs', desc: 'Workspace isolation, tab pins, back/forward stacks & hibernation' },
  { path: 'src/adblock.rs', desc: 'Host matcher + WebView2 cosmetic element-hiding init script' },
  { path: 'src/security.rs', desc: 'HTTPS-Only upgrade & Safe Browsing malicious URL screening' },
  { path: 'src/privacy.rs', desc: 'Anti-fingerprinting WebGL/canvas noise & VPN routing state' },
  { path: 'src/vault.rs', desc: 'AES-256-GCM / OS keychain credential vault architecture' },
  { path: 'src/extensions.rs', desc: 'Sandboxed JS user-script extension host' },
  { path: 'src/downloads.rs', desc: 'Download queue & executable filename safety scanner' },
  { path: 'src/theme.rs', desc: 'Accent preset & color palette definitions' },
];

export function RustSourceView() {
  const nativeShell = isRustNativeShell();
  const [files, setFiles] = useState<RustFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('Cargo.toml');
  const [loading, setLoading] = useState(!nativeShell);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);

  useEffect(() => {
    if (nativeShell) return;
    let active = true;
    setLoading(true);
    fetch('/api/rust-files')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load Rust crate files');
        return res.json();
      })
      .then((data: { files: RustFileEntry[] }) => {
        if (!active) return;
        setFiles(data.files);
        if (data.files.length > 0 && !data.files.some((f) => f.path === selectedPath)) {
          setSelectedPath(data.files[0].path);
        }
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to read crate files');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nativeShell]);

  if (nativeShell) {
    return (
      <div className="h-full overflow-y-auto px-6 py-8" style={{ backgroundColor: 'var(--fx-bg)' }}>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="pb-4 border-b border-white/8 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-white">
                FerroX Native Desktop Binary
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Running inside compiled Rust + WebView2 (wry/tao) desktop process with live sysinfo telemetry.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-medium text-emerald-300">
              <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
              Native Mode Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {NATIVE_CRATE_MODULES.map((mod) => (
              <div
                key={mod.path}
                className="p-3.5 rounded-xl border border-white/8 space-y-1"
                style={{ backgroundColor: 'var(--fx-panel)' }}
              >
                <div className="flex items-center gap-2 text-xs font-mono-tabular font-semibold text-white">
                  <FileCode2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                  {mod.path}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{mod.desc}</p>
              </div>
            ))}
          </div>

          <div
            className="p-4 rounded-xl border border-white/8 flex items-start gap-3 text-xs text-slate-300"
            style={{ backgroundColor: 'var(--fx-card)' }}
          >
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              Settings, theme palettes, hardware acceleration flags, and VPN defaults persist locally via{' '}
              <code className="font-mono-tabular text-white">BrowserConfig::save()</code> in your OS config folder under{' '}
              <code className="font-mono-tabular text-white">ferrox-browser/config.json</code>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentFile = files.find((f) => f.path === selectedPath) ?? files[0] ?? null;

  const handleCopy = async () => {
    if (!currentFile) return;
    try {
      await navigator.clipboard.writeText(currentFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0D12]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-[#12151E] border-b border-white/8">
        <div>
          <h1 className="font-display text-xl font-semibold text-white">
            FerroX Desktop Crate (Rust)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete Cargo workspace · wry/tao dual-WebView · sysinfo process limiter · single-file React chrome
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <code className="hidden md:inline-block px-3 py-1.5 rounded-lg bg-[#0B0D12] border border-white/10 font-mono-tabular text-xs text-slate-300">
            cargo run --release
          </code>
          <a
            href="/api/rust-crate.zip"
            download="ferrox-browser-rust.zip"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
            style={{ backgroundColor: 'var(--fx-accent)' }}
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Rust Project (.zip)
          </a>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-slate-400">Loading Rust source tree...</div>
      ) : error ? (
        <div className="p-6 text-sm text-rose-400">{error}</div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* File Tree */}
          <nav
            className="w-56 bg-[#0E1118] border-r border-white/8 overflow-y-auto p-3 space-y-1 shrink-0"
            aria-label="Rust project files"
          >
            <div className="px-2 py-1 text-xs font-semibold text-slate-400">
              ferrox-browser/
            </div>
            {files.map((file) => {
              const active = file.path === currentFile?.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                    active
                      ? 'bg-[#181E2C] text-white border border-white/12'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileCode2
                      className="w-3.5 h-3.5 shrink-0"
                      style={active ? { color: 'var(--fx-accent)' } : undefined}
                      aria-hidden="true"
                    />
                    <span className="font-mono-tabular truncate">{file.path}</span>
                  </span>
                  <span className="font-mono-tabular text-[11px] text-slate-500 shrink-0">
                    {(file.sizeBytes / 1024).toFixed(1)}K
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0B0D12]">
            {currentFile && (
              <>
                <div className="flex items-center justify-between h-11 px-4 border-b border-white/8 bg-[#12151E]/60 shrink-0">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Terminal className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <span className="font-mono-tabular font-medium text-white">
                      {currentFile.path}
                    </span>
                    <span className="text-slate-500" aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-slate-400">
                      {currentFile.content.split('\n').length} lines
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWrapLines((w) => !w)}
                      aria-pressed={wrapLines}
                      className="px-2.5 py-1 rounded-md bg-white/8 hover:bg-white/14 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      {wrapLines ? 'Wrap: On' : 'Wrap: Off'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/8 hover:bg-white/14 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          Copy File
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  <pre className={`font-mono-tabular text-xs leading-6 text-slate-200 ${wrapLines ? '' : 'min-w-max'}`}>
                    <code>
                      {currentFile.content.split('\n').map((line, i) => (
                        <div key={i} className="flex gap-4 hover:bg-white/[0.03] px-2 rounded">
                          <span className="w-8 text-right text-slate-600 select-none shrink-0">
                            {i + 1}
                          </span>
                          <span className={wrapLines ? 'whitespace-pre-wrap break-words min-w-0 flex-1' : 'whitespace-pre'}>
                            {line}
                          </span>
                        </div>
                      ))}
                    </code>
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
