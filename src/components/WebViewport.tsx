import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Languages,
  PauseCircle,
  RotateCw,
  ShieldAlert,
  ShieldX,
  Zap,
} from 'lucide-react';
import { BrowserExtension } from '../lib/browserEngine';
import { isRustNativeShell } from '../lib/rustBridge';

export interface LoadedPageData {
  url: string;
  finalUrl: string;
  title: string;
  status: number;
  bytesTransferred: number;
  elapsedMs: number;
  effectiveKbps: number;
  blockedTrackers: string[];
  blockedByShield?: boolean;
  matchedRule?: string;
  sanitizedHtml: string;
  readerParagraphs?: string[];
  upgradedFromHttp?: boolean;
  insecureHttpWarning?: boolean;
  safeBrowsingThreat?: {
    threatType: 'phishing' | 'malware';
    reason: string;
  } | null;
}

export interface TranslationData {
  targetLanguage: string;
  translatedTitle: string;
  translatedParagraphs: string[];
  provider: string;
}

interface WebViewportProps {
  url: string;
  hibernated: boolean;
  loading: boolean;
  error: string | null;
  pageData: LoadedPageData | null;
  readerMode: boolean;
  translation: TranslationData | null;
  extensions: BrowserExtension[];
  zoomFactor?: number;
  autofillSignal?: { seq: number; username: string; password: string } | null;
  findSignal?: { seq: number; query: string; backwards: boolean } | null;
  onWakeTab: () => void;
  onRetry: () => void;
  onNavigateUrl: (url: string) => void;
  onOpenBackgroundTab?: (url: string) => void;
  onOpenSpeedDial: () => void;
  onProceedUnsafe: () => void;
  onExitReaderMode: () => void;
  onClearTranslation: () => void;
}

export const WebViewport = memo(function WebViewport({
  url,
  hibernated,
  loading,
  error,
  pageData,
  readerMode,
  translation,
  extensions,
  zoomFactor = 1,
  autofillSignal,
  findSignal,
  onWakeTab,
  onRetry,
  onNavigateUrl,
  onOpenBackgroundTab,
  onOpenSpeedDial,
  onProceedUnsafe,
  onExitReaderMode,
  onClearTranslation,
}: WebViewportProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [readerFontSize, setReaderFontSize] = useState<'base' | 'lg'>('base');

  // Listen for intercepted link clicks strictly from THIS tab's sandboxed iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current?.contentWindow || event.source !== iframeRef.current.contentWindow) {
        return;
      }
      if (!event.data || typeof event.data !== 'object') return;
      const nextUrl = event.data.url;
      if (typeof nextUrl !== 'string') return;
      if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) return;

      if (event.data.type === 'ferrox:navigate') {
        onNavigateUrl(nextUrl);
      } else if (event.data.type === 'ferrox:open-bg-tab') {
        if (onOpenBackgroundTab) {
          onOpenBackgroundTab(nextUrl);
        } else {
          onNavigateUrl(nextUrl);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNavigateUrl, onOpenBackgroundTab]);

  // Forward autofill credentials to iframe document when requested
  useEffect(() => {
    if (!autofillSignal || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'ferrox:autofill',
        username: autofillSignal.username,
        password: autofillSignal.password,
      },
      '*'
    );
  }, [autofillSignal]);

  // Forward Find-in-Page requests to iframe document when requested
  useEffect(() => {
    if (!findSignal || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'ferrox:find',
        query: findSignal.query,
        backwards: findSignal.backwards,
      },
      '*'
    );
  }, [findSignal]);

  // Inject enabled extensions' CSS into the sandboxed srcDoc
  const augmentedHtml = useMemo(() => {
    if (!pageData?.sanitizedHtml) return '';
    const activeCss = extensions
      .filter((e) => e.enabled && e.cssInjection)
      .map((e) => `/* ${e.name} */\n${e.cssInjection}`)
      .join('\n');
    if (!activeCss) return pageData.sanitizedHtml;
    const styleTag = `<style data-ferrox-extensions="true">${activeCss}</style>`;
    if (/<\/head>/i.test(pageData.sanitizedHtml)) {
      return pageData.sanitizedHtml.replace(/<\/head>/i, `${styleTag}</head>`);
    }
    return `${styleTag}${pageData.sanitizedHtml}`;
  }, [extensions, pageData?.sanitizedHtml]);

  if (hibernated) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-[#0B0D12]">
        <div className="max-w-md p-6 rounded-xl bg-[#12151E] border border-white/10 space-y-4">
          <PauseCircle className="w-8 h-8 mx-auto text-slate-300" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-white">Tab Hibernated</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            FerroX suspended <span className="font-mono-tabular text-slate-200">{url}</span> to keep active memory inside your RAM limit.
          </p>
          <button
            type="button"
            onClick={onWakeTab}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
            style={{ backgroundColor: 'var(--fx-accent)' }}
          >
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            Wake Tab
          </button>
        </div>
      </div>
    );
  }

  if (pageData?.safeBrowsingThreat) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-[#180A0E]">
        <div className="max-w-lg p-7 rounded-xl bg-[#140B0F] border border-rose-500/40 space-y-4 shadow-2xl">
          <ShieldX className="w-10 h-10 mx-auto text-rose-400" aria-hidden="true" />
          <h2 className="font-display text-xl font-semibold text-white">
            Deceptive or Malware Site Blocked
          </h2>
          <p className="text-xs text-rose-200/85 leading-relaxed">
            FerroX Safe Browsing flagged{' '}
            <span className="font-mono-tabular text-white">{pageData.finalUrl}</span> as{' '}
            <span className="font-semibold uppercase">{pageData.safeBrowsingThreat.threatType}</span>.{' '}
            {pageData.safeBrowsingThreat.reason}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onOpenSpeedDial}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 whitespace-nowrap"
            >
              Back to Safety
            </button>
            <button
              type="button"
              onClick={onProceedUnsafe}
              className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-slate-300 whitespace-nowrap"
            >
              Ignore Warning (Unsafe)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isRustNativeShell()) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full px-6 text-center"
        style={{ backgroundColor: 'var(--fx-bg)' }}
      >
        <div
          className="max-w-md p-5 rounded-xl border border-white/10 space-y-2"
          style={{ backgroundColor: 'var(--fx-panel)' }}
        >
          <div className="text-xs font-semibold text-white">Native WebView2 Surface</div>
          <p className="font-mono-tabular text-[11px] text-slate-400 break-all">{url}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full p-6 bg-[#0B0D12] space-y-4" aria-busy="true" aria-label="Loading page">
        <div className="h-5 w-64 rounded bg-white/8" />
        <div className="h-4 w-96 rounded bg-white/6" />
        <div className="h-64 w-full rounded-xl bg-white/5 border border-white/8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-[#0B0D12]">
        <div className="max-w-md p-6 rounded-xl bg-[#12151E] border border-white/10 space-y-4">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-400" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-white">Unable to Load Page</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
              style={{ backgroundColor: 'var(--fx-accent)' }}
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              Retry
            </button>
            <button
              type="button"
              onClick={onOpenSpeedDial}
              className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              Speed Dial
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pageData?.blockedByShield) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-[#0B0D12]">
        <div className="max-w-md p-6 rounded-xl bg-[#12151E] border border-white/10 space-y-4">
          <ShieldAlert className="w-8 h-8 mx-auto text-emerald-400" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-white">Blocked by Ad & Tracker Shield</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            FerroX prevented navigation to{' '}
            <span className="font-mono-tabular text-slate-200">{pageData.finalUrl}</span> because it
            matched filter rule <span className="font-mono-tabular text-emerald-400">{pageData.matchedRule}</span>.
          </p>
          <button
            type="button"
            onClick={onOpenSpeedDial}
            className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-white whitespace-nowrap"
          >
            Return to Speed Dial
          </button>
        </div>
      </div>
    );
  }

  if (!pageData) {
    return null;
  }

  if (readerMode || translation) {
    const paragraphs = translation
      ? translation.translatedParagraphs
      : pageData.readerParagraphs && pageData.readerParagraphs.length > 0
      ? pageData.readerParagraphs
      : ['Reader Mode extracted no structured article paragraphs on this page.'];

    const heading = translation ? translation.translatedTitle : pageData.title;

    return (
      <div className="flex flex-col h-full bg-[#101218] text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-[#151822] border-b border-white/10 text-xs">
          <div className="flex items-center gap-2">
            {translation ? (
              <>
                <Languages className="w-4 h-4 text-sky-400" aria-hidden="true" />
                <span className="font-medium text-white">
                  Translated to {translation.targetLanguage}
                </span>
                <span className="text-slate-400">({translation.provider})</span>
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                <span className="font-medium text-white">Reader Mode</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReaderFontSize((s) => (s === 'base' ? 'lg' : 'base'))}
              className="px-2.5 py-1 rounded bg-white/8 hover:bg-white/14 text-xs text-slate-200"
            >
              Text: {readerFontSize === 'base' ? 'Standard' : 'Large'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (translation) onClearTranslation();
                if (readerMode) onExitReaderMode();
              }}
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/18 text-xs text-white"
            >
              Exit View
            </button>
          </div>
        </div>

        <article className="flex-1 overflow-y-auto px-6 py-10">
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="font-mono-tabular text-xs text-slate-400 truncate">
              {pageData.finalUrl}
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold text-white leading-snug">
              {heading}
            </h1>
            <div className="space-y-4 pt-2">
              {paragraphs.map((p, idx) => (
                <p
                  key={idx}
                  className={`text-slate-200 leading-relaxed ${
                    readerFontSize === 'lg' ? 'text-lg' : 'text-base'
                  }`}
                >
                  {p}
                </p>
              ))}
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0B0D12]">
      {/* Compact Security / Transfer Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-[#0E1118] border-b border-white/8 text-[11px] text-slate-400">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono-tabular text-slate-300">HTTP {pageData.status}</span>
          {pageData.upgradedFromHttp && (
            <span className="text-emerald-400 font-medium">HTTPS Upgraded</span>
          )}
          {pageData.insecureHttpWarning && (
            <span className="text-amber-400 font-medium">Insecure HTTP</span>
          )}
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular truncate max-w-md">{pageData.finalUrl}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono-tabular">
          <span>{(pageData.bytesTransferred / 1024).toFixed(1)} KB</span>
          <span aria-hidden="true">·</span>
          <span>{pageData.elapsedMs} ms</span>
          <span aria-hidden="true">·</span>
          <span>{pageData.effectiveKbps} KB/s</span>
          {pageData.blockedTrackers.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">
                {pageData.blockedTrackers.length} tracker{pageData.blockedTrackers.length > 1 ? 's' : ''} stripped
              </span>
            </>
          )}
        </div>
      </div>

      {/* Sandboxed Viewport */}
      <div className="flex-1 w-full overflow-hidden bg-white">
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={augmentedHtml}
          title={pageData.title || pageData.finalUrl}
          className="w-full h-full bg-white border-0 origin-top-left"
          style={
            zoomFactor !== 1
              ? {
                  transform: `scale(${zoomFactor})`,
                  width: `${100 / zoomFactor}%`,
                  height: `${100 / zoomFactor}%`,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
});
