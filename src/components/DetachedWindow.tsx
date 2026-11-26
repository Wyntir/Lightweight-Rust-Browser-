import { FormEvent, memo, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  EyeOff,
  Globe,
  Maximize2,
  Minimize2,
  PanelTop,
  RotateCw,
  Shield,
  X,
} from 'lucide-react';
import { Tab } from '../lib/browserEngine';

export interface DetachedWindowState {
  windowId: string;
  tab: Tab;
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  zIndex: number;
}

interface DetachedWindowProps {
  win: DetachedWindowState;
  canBack: boolean;
  canForward: boolean;
  isLoading: boolean;
  onFocus: (windowId: string) => void;
  onMove: (windowId: string, x: number, y: number) => void;
  onResize: (windowId: string, width: number, height: number) => void;
  onToggleMaximize: (windowId: string) => void;
  onDockBack: (windowId: string) => void;
  onClose: (windowId: string) => void;
  onNavigate: (windowId: string, rawInput: string) => void;
  onBack: (windowId: string) => void;
  onForward: (windowId: string) => void;
  onReload: (windowId: string) => void;
  children: ReactNode;
}

export const DetachedWindow = memo(function DetachedWindow({
  win,
  canBack,
  canForward,
  isLoading,
  onFocus,
  onMove,
  onResize,
  onToggleMaximize,
  onDockBack,
  onClose,
  onNavigate,
  onBack,
  onForward,
  onReload,
  children,
}: DetachedWindowProps) {
  const [draft, setDraft] = useState(
    win.tab.url === 'ferrox://speed-dial' ? '' : win.tab.url
  );
  const dragOriginRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    setDraft(win.tab.url === 'ferrox://speed-dial' ? '' : win.tab.url);
  }, [win.tab.url]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      if (origin.mode === 'move') {
        const nextX = Math.max(0, Math.min(window.innerWidth - 180, origin.origX + dx));
        const nextY = Math.max(8, Math.min(window.innerHeight - 64, origin.origY + dy));
        onMove(win.windowId, nextX, nextY);
      } else {
        const nextW = Math.max(420, Math.min(window.innerWidth - origin.origX - 8, origin.origW + dx));
        const nextH = Math.max(300, Math.min(window.innerHeight - origin.origY - 8, origin.origH + dy));
        onResize(win.windowId, nextW, nextH);
      }
    };
    const onPointerUp = () => {
      dragOriginRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onMove, onResize, win.windowId]);

  const startMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || win.maximized) return;
    if ((e.target as HTMLElement).closest('button')) return;
    onFocus(win.windowId);
    dragOriginRef.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origX: win.x,
      origY: win.y,
      origW: win.width,
      origH: win.height,
    };
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || win.maximized) return;
    e.stopPropagation();
    onFocus(win.windowId);
    dragOriginRef.current = {
      mode: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      origX: win.x,
      origY: win.y,
      origW: win.width,
      origH: win.height,
    };
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onNavigate(win.windowId, draft.trim() || 'ferrox://speed-dial');
  };

  const style = win.maximized
    ? {
        left: 12,
        top: 12,
        width: 'calc(100vw - 24px)',
        height: 'calc(100vh - 24px)',
        zIndex: win.zIndex,
        backgroundColor: 'var(--fx-bg)',
      }
    : {
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
        backgroundColor: 'var(--fx-bg)',
      };

  return (
    <section
      role="dialog"
      aria-label={`Detached window: ${win.tab.title}`}
      onPointerDown={() => onFocus(win.windowId)}
      className="fx-pop-in fixed flex flex-col rounded-xl border border-white/18 shadow-[0_24px_70px_rgba(0,0,0,0.72)] overflow-hidden"
      style={style}
    >
      {/* Draggable Window Titlebar */}
      <div
        onPointerDown={startMove}
        onDoubleClick={() => onToggleMaximize(win.windowId)}
        className="flex items-center justify-between gap-2 h-9 px-3 border-b border-white/10 select-none cursor-grab active:cursor-grabbing shrink-0"
        style={{
          backgroundColor: 'var(--fx-chrome)',
          boxShadow: 'inset 0 2px 0 0 var(--fx-accent)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {win.tab.isPrivate ? (
            <EyeOff className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />
          ) : win.tab.url.startsWith('ferrox://') ? (
            <Shield className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          )}
          <span className="text-xs font-medium text-white truncate">{win.tab.title}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono-tabular text-slate-400 shrink-0">
            New Window
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onDockBack(win.windowId)}
            aria-label={`Dock Tab ${win.tab.title}`}
            title="Dock tab back into main window"
            className="flex items-center gap-1 h-6 px-2 rounded bg-white/8 hover:bg-white/15 text-[11px] font-medium text-slate-200 hover:text-white transition-colors"
          >
            <PanelTop className="w-3 h-3" aria-hidden="true" />
            <span>Dock Tab</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleMaximize(win.windowId)}
            aria-label={win.maximized ? 'Restore detached window size' : 'Maximize detached window'}
            title={win.maximized ? 'Restore' : 'Maximize'}
            className="flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {win.maximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={() => onClose(win.windowId)}
            aria-label={`Close detached window ${win.tab.title}`}
            title="Close window"
            className="flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-rose-500/25 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compact Address & Navigation Bar */}
      <div
        className="flex items-center gap-1.5 h-9 px-2.5 border-b border-white/8 shrink-0"
        style={{ backgroundColor: 'var(--fx-panel)' }}
      >
        <button
          type="button"
          onClick={() => onBack(win.windowId)}
          disabled={!canBack}
          aria-label="Detached window back"
          className="flex items-center justify-center w-6 h-6 rounded text-slate-300 hover:bg-white/10 disabled:opacity-30"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onForward(win.windowId)}
          disabled={!canForward}
          aria-label="Detached window forward"
          className="flex items-center justify-center w-6 h-6 rounded text-slate-300 hover:bg-white/10 disabled:opacity-30"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onReload(win.windowId)}
          aria-label="Detached window reload"
          className="flex items-center justify-center w-6 h-6 rounded text-slate-300 hover:bg-white/10"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        <form onSubmit={handleSubmit} className="flex-1 min-w-0">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Detached window address bar"
            placeholder="Search Google or type a URL"
            className="w-full h-6.5 px-2.5 rounded-md bg-[#0B0D12] border border-white/10 focus:border-white/30 text-xs font-mono-tabular text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        </form>
      </div>

      {/* Window Content */}
      <div className="flex-1 min-h-0 overflow-hidden relative">{children}</div>

      {/* Bottom-right resize handle */}
      {!win.maximized && (
        <div
          onPointerDown={startResize}
          aria-hidden="true"
          className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.22) 62%, transparent 62%, transparent 74%, rgba(255,255,255,0.22) 74%)',
          }}
        />
      )}
    </section>
  );
});
