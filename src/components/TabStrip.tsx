import {
  memo,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowRightToLine,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  ExternalLink,
  EyeOff,
  Globe,
  PanelLeft,
  PauseCircle,
  Pin,
  Plus,
  RotateCw,
  Search,
  Settings,
  Shield,
  Terminal,
  Undo2,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from 'lucide-react';
import { Tab, TabGroup } from '../lib/browserEngine';
import ferroxLogo from '../assets/images/ferrox_logo_icon.png';

export interface DetachDropPoint {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

interface TabBarSharedProps {
  tabs: Tab[];
  tabGroups: TabGroup[];
  activeTabId: string | null;
  splitTabId: string | null;
  activeWorkspaceLabel?: string;
  verticalTabs: boolean;
  quickSettingsOpen: boolean;
  canReopenClosedTab?: boolean;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onDuplicateTab: (id: string) => void;
  onReloadTab: (id: string) => void;
  onHibernateTab: (id: string) => void;
  onCloseOtherTabs: (id: string) => void;
  onCloseTabsToRight: (id: string) => void;
  onToggleMuteTab: (id: string) => void;
  onReorderTab: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
  onDetachTab: (id: string, point?: DetachDropPoint) => void;
  onReopenClosedTab: () => void;
  onNewTab: () => void;
  onNewPrivateTab: () => void;
  onTogglePin: (id: string) => void;
  onToggleSplit: (id: string) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  onOpenTabSearch: () => void;
  onToggleVerticalTabs: () => void;
  onToggleQuickSettings: () => void;
  onContextMenuOpenChange?: (open: boolean) => void;
  onDragOverlayChange?: (active: boolean) => void;
  onHoverUrl?: (url: string | null) => void;
}

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

interface TabDragState {
  tabId: string;
  title: string;
  url: string;
  isPrivate: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  screenX: number;
  screenY: number;
  active: boolean;
  detaching: boolean;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after';
}

function TabContextMenu({
  menu,
  tabs,
  activeTabId,
  splitTabId,
  canReopenClosedTab,
  onCloseMenu,
  onDuplicateTab,
  onDetachTab,
  onReloadTab,
  onToggleMuteTab,
  onTogglePin,
  onToggleSplit,
  onHibernateTab,
  onReopenClosedTab,
  onCloseTab,
  onCloseTabsToRight,
  onCloseOtherTabs,
}: {
  menu: ContextMenuState;
  tabs: Tab[];
  activeTabId: string | null;
  splitTabId: string | null;
  canReopenClosedTab?: boolean;
  onCloseMenu: () => void;
  onDuplicateTab: (id: string) => void;
  onDetachTab: (id: string) => void;
  onReloadTab: (id: string) => void;
  onToggleMuteTab: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleSplit: (id: string) => void;
  onHibernateTab: (id: string) => void;
  onReopenClosedTab: () => void;
  onCloseTab: (id: string) => void;
  onCloseTabsToRight: (id: string) => void;
  onCloseOtherTabs: (id: string) => void;
}) {
  const ordered = sortTabsPinnedFirst(tabs);
  const tabIndex = ordered.findIndex((t) => t.id === menu.tabId);
  const tab = tabIndex >= 0 ? ordered[tabIndex] : undefined;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseMenu();
      }
    };
    const onWindowBlur = () => onCloseMenu();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [onCloseMenu]);

  if (!tab) return null;

  const isActive = tab.id === activeTabId;
  const isSplit = tab.id === splitTabId;
  const canHibernate = !isActive && !isSplit && !tab.hibernated;
  const canCloseOthers = tabs.some((t) => t.id !== tab.id && !t.pinned);
  const canCloseRight = ordered.slice(tabIndex + 1).some((t) => !t.pinned);
  const canReload = !tab.url.startsWith('ferrox://');

  const menuWidth = 228;
  const menuHeight = 368;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - menuHeight - 8));

  const runAction = (fn: () => void) => {
    onCloseMenu();
    fn();
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onCloseMenu}
      onContextMenu={(e) => {
        e.preventDefault();
        onCloseMenu();
      }}
    >
      <div
        role="menu"
        aria-label={`Tab actions for ${tab.title}`}
        onClick={(e) => e.stopPropagation()}
        className="fx-pop-in fixed w-[228px] py-1.5 rounded-xl border border-white/15 shadow-2xl text-xs text-slate-200 select-none"
        style={{ left, top, backgroundColor: 'var(--fx-panel)' }}
      >
        <div className="px-3 py-1 text-[10px] font-medium text-slate-400 truncate border-b border-white/8 mb-1">
          {tab.title}
        </div>

        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(() => onDuplicateTab(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 text-white transition-colors"
        >
          <Copy className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />
          <span>Duplicate Tab</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(() => onDetachTab(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
          <span>Move Tab to New Window</span>
        </button>

        <button
          type="button"
          role="menuitem"
          disabled={!canReload}
          onClick={() => runAction(() => onReloadTab(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <RotateCw className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Reload Tab</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(() => onToggleMuteTab(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 transition-colors"
        >
          {tab.muted ? (
            <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          )}
          <span>{tab.muted ? 'Unmute Tab' : 'Mute Tab'}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(() => onTogglePin(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 transition-colors"
        >
          <Pin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>{tab.pinned ? 'Unpin Tab' : 'Pin Tab'}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          disabled={isActive && !isSplit}
          onClick={() => runAction(() => onToggleSplit(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <Columns2 className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
          <span>{isSplit ? 'Exit Split View' : 'Open in Split View'}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          disabled={!canHibernate}
          onClick={() => runAction(() => onHibernateTab(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <PauseCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>{tab.hibernated ? 'Hibernated' : 'Hibernate Tab'}</span>
        </button>

        <div className="my-1 border-t border-white/8" />

        <button
          type="button"
          role="menuitem"
          disabled={!canReopenClosedTab}
          onClick={() => runAction(onReopenClosedTab)}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <Undo2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span>Reopen Closed Tab</span>
          </span>
          <span className="font-mono-tabular text-[10px] text-slate-500">Ctrl+Shift+T</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(() => onCloseTab(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-rose-500/15 hover:text-rose-200 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Close Tab</span>
        </button>

        <button
          type="button"
          role="menuitem"
          disabled={!canCloseRight}
          onClick={() => runAction(() => onCloseTabsToRight(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-200 transition-colors"
        >
          <ArrowRightToLine className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Close Tabs to the Right</span>
        </button>

        <button
          type="button"
          role="menuitem"
          disabled={!canCloseOthers}
          onClick={() => runAction(() => onCloseOtherTabs(tab.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-200 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Close Other Tabs</span>
        </button>
      </div>
    </div>
  );
}

function DragDetachPreview({ drag }: { drag: TabDragState }) {
  if (!drag.active) return null;
  const host = drag.url.startsWith('ferrox://')
    ? drag.url
    : (() => {
        try {
          return new URL(drag.url).hostname.replace(/^www\./, '');
        } catch {
          return drag.url;
        }
      })();

  return (
    <div
      aria-live="polite"
      className="fixed z-50 pointer-events-none select-none transition-transform duration-75"
      style={{
        left: Math.max(8, Math.min(window.innerWidth - 230, drag.currentX + 12)),
        top: Math.max(8, Math.min(window.innerHeight - 90, drag.currentY + 14)),
      }}
    >
      <div
        className={`flex flex-col gap-1 px-3 py-2 rounded-xl border shadow-2xl backdrop-blur-md min-w-[205px] max-w-[240px] ${
          drag.detaching
            ? 'border-white/30 bg-[#141926]/95'
            : 'border-white/15 bg-[#12151E]/90'
        }`}
        style={
          drag.detaching
            ? { boxShadow: '0 16px 40px rgba(0,0,0,0.6), inset 0 2px 0 0 var(--fx-accent)' }
            : undefined
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          {drag.isPrivate ? (
            <EyeOff className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />
          )}
          <span className="text-xs font-medium text-white truncate">{drag.title}</span>
        </div>
        <div className="font-mono-tabular text-[10px] text-slate-400 truncate">{host}</div>
        {drag.detaching && (
          <div
            className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white w-fit"
            style={{ backgroundColor: 'var(--fx-accent)' }}
          >
            <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
            Release to open in new window
          </div>
        )}
      </div>
    </div>
  );
}

function getTabIcon(tab: Tab) {
  if (tab.isPrivate) {
    return <EyeOff className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />;
  }
  if (tab.hibernated) {
    return <PauseCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (tab.url === 'ferrox://speed-dial') {
    return (
      <img
        src={ferroxLogo}
        alt=""
        referrerPolicy="no-referrer"
        className="w-3.5 h-3.5 rounded-[3px] object-cover shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (tab.url === 'ferrox://rust-source') {
    return <Terminal className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />;
  }
  if (tab.url.startsWith('ferrox://')) {
    return <Shield className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />;
  }
  return <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
}

function sortTabsPinnedFirst(tabs: Tab[]): Tab[] {
  return [...tabs].sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

export const TabStrip = memo(function TabStrip({
  tabs,
  tabGroups,
  activeTabId,
  splitTabId,
  activeWorkspaceLabel = 'Personal',
  verticalTabs,
  quickSettingsOpen,
  canReopenClosedTab = false,
  onSelectTab,
  onCloseTab,
  onDuplicateTab,
  onReloadTab,
  onHibernateTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onToggleMuteTab,
  onReorderTab,
  onDetachTab,
  onReopenClosedTab,
  onNewTab,
  onNewPrivateTab,
  onTogglePin,
  onToggleSplit,
  onToggleGroupCollapse,
  onOpenTabSearch,
  onToggleVerticalTabs,
  onToggleQuickSettings,
  onContextMenuOpenChange,
  onDragOverlayChange,
  onHoverUrl,
}: TabBarSharedProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragState, setDragState] = useState<TabDragState | null>(null);
  const dragRef = useRef<TabDragState | null>(null);
  const suppressClickTabRef = useRef<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onContextMenuOpenChange?.(Boolean(contextMenu));
  }, [contextMenu, onContextMenuOpenChange]);

  useEffect(() => {
    onDragOverlayChange?.(Boolean(dragState?.active));
  }, [dragState?.active, onDragOverlayChange]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;

      const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
      const isActive = cur.active || dist >= 7;
      if (!isActive) return;

      const stripRect = stripRef.current?.getBoundingClientRect();
      const detaching = Boolean(
        stripRect &&
          (e.clientY > stripRect.bottom + 42 ||
            e.clientY < stripRect.top - 32 ||
            e.clientX < 0 ||
            e.clientX > window.innerWidth)
      );

      let dropTargetId: string | null = null;
      let dropPosition: 'before' | 'after' = 'before';

      if (!detaching && stripRef.current) {
        const tabEls = stripRef.current.querySelectorAll<HTMLElement>('[data-tab-id]');
        for (const el of tabEls) {
          const tid = el.dataset.tabId;
          if (!tid || tid === cur.tabId) continue;
          const rect = el.getBoundingClientRect();
          if (e.clientX >= rect.left - 8 && e.clientX <= rect.right + 8) {
            dropTargetId = tid;
            dropPosition = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
            break;
          }
        }
      }

      const next: TabDragState = {
        ...cur,
        active: true,
        currentX: e.clientX,
        currentY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        detaching,
        dropTargetId,
        dropPosition,
      };
      dragRef.current = next;
      setDragState(next);
    };

    const onPointerUp = () => {
      const cur = dragRef.current;
      if (!cur) return;
      dragRef.current = null;
      setDragState(null);

      if (!cur.active) return;
      suppressClickTabRef.current = cur.tabId;
      window.setTimeout(() => {
        if (suppressClickTabRef.current === cur.tabId) {
          suppressClickTabRef.current = null;
        }
      }, 150);

      if (cur.detaching) {
        onDetachTab(cur.tabId, {
          x: cur.currentX,
          y: cur.currentY,
          screenX: cur.screenX,
          screenY: cur.screenY,
        });
      } else if (cur.dropTargetId) {
        onReorderTab(cur.tabId, cur.dropTargetId, cur.dropPosition);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onDetachTab, onReorderTab]);

  const handleTabPointerDown = (e: ReactPointerEvent, tab: Tab) => {
    if (e.button !== 0) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('[data-tab-action]')) return;
    const initial: TabDragState = {
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      isPrivate: tab.isPrivate,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      active: false,
      detaching: false,
      dropTargetId: null,
      dropPosition: 'before',
    };
    dragRef.current = initial;
  };

  const handleOpenContextMenu = (e: ReactMouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const orderedTabs = useMemo(() => sortTabsPinnedFirst(tabs), [tabs]);
  const groupMap = useMemo(() => new Map(tabGroups.map((g) => [g.id, g])), [tabGroups]);

  const renderedCollapsedGroups = new Set<string>();

  if (verticalTabs) {
    return (
      <div
        className="flex items-center justify-between gap-2 h-9 px-3 border-b border-white/8 select-none"
        style={{ backgroundColor: 'var(--fx-chrome)' }}
      >
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="text-slate-300 font-medium">Vertical Tabs Active</span>
          <span className="font-mono-tabular text-[11px] text-slate-500">
            ({tabs.length} open)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenTabSearch}
            aria-label="Search open tabs"
            title="Search Tabs (Ctrl+K)"
            className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Search className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Tabs</span>
          </button>
          <button
            type="button"
            onClick={onToggleVerticalTabs}
            aria-label="Switch to horizontal tabs"
            title="Switch to Horizontal Tab Bar"
            className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-white bg-white/10 hover:bg-white/15 transition-colors"
          >
            <PanelLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Horizontal</span>
          </button>
          <button
            type="button"
            onClick={onToggleQuickSettings}
            aria-label="Quick Settings"
            aria-expanded={quickSettingsOpen}
            title="Quick Settings & Hardware Acceleration"
            className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              quickSettingsOpen
                ? 'text-white bg-white/15'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      className="flex items-center justify-between gap-2 h-10 px-2.5 border-b border-white/8 select-none"
      style={{ backgroundColor: 'var(--fx-chrome)' }}
    >
      {/* Top-left strictly starts with tabs only */}
      <div
        ref={scrollContainerRef}
        onWheel={(e) => {
          if (scrollContainerRef.current && Math.abs(e.deltaY) > 0) {
            scrollContainerRef.current.scrollLeft += e.deltaY;
          }
        }}
        className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar"
      >
        <div className="flex items-center gap-1" role="tablist" aria-label="Browser tabs">
          {orderedTabs.length === 0 && (
            <span className="px-2.5 py-1 text-xs text-slate-500 font-mono-tabular whitespace-nowrap">
              {activeWorkspaceLabel} · 0 tabs open
            </span>
          )}
          {orderedTabs.map((tab) => {
            const group = tab.groupId ? groupMap.get(tab.groupId) : undefined;
            if (group?.collapsed && tab.id !== activeTabId && tab.id !== splitTabId) {
              if (renderedCollapsedGroups.has(group.id)) {
                return null;
              }
              renderedCollapsedGroups.add(group.id);
              return (
                <button
                  key={`group-chip-${group.id}`}
                  type="button"
                  onClick={() => onToggleGroupCollapse(group.id)}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium bg-[#141824] border border-white/12 text-slate-200 hover:bg-[#1A2030] shrink-0"
                  title={`Expand tab island "${group.name}"`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                  <span>{group.name}</span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>
              );
            }

            const isActive = tab.id === activeTabId;
            const isSplit = tab.id === splitTabId;
            const isDraggingThis = dragState?.active && dragState.tabId === tab.id;
            const showDropBefore =
              dragState?.active &&
              !dragState.detaching &&
              dragState.dropTargetId === tab.id &&
              dragState.dropPosition === 'before';
            const showDropAfter =
              dragState?.active &&
              !dragState.detaching &&
              dragState.dropTargetId === tab.id &&
              dragState.dropPosition === 'after';

            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                onPointerDown={(e) => handleTabPointerDown(e, tab)}
                onContextMenu={(e) => handleOpenContextMenu(e, tab.id)}
                onMouseEnter={() => {
                  if (!tab.url.startsWith('ferrox://')) onHoverUrl?.(tab.url);
                }}
                onMouseLeave={() => onHoverUrl?.(null)}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
                className={`relative group flex items-center gap-0.5 h-8 rounded-t-md border transition-colors shrink-0 ${
                  isDraggingThis
                    ? 'opacity-40 scale-[0.98]'
                    : isActive
                    ? 'bg-[#161B26] border-white/12 text-white'
                    : isSplit
                    ? 'bg-[#131823] border-white/15 text-slate-100'
                    : 'bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
                style={{
                  boxShadow: isActive
                    ? 'inset 0 2px 0 0 var(--fx-accent)'
                    : isSplit
                    ? 'inset 0 2px 0 0 #38BDF8'
                    : undefined,
                }}
              >
                {showDropBefore && (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[3px] top-1 bottom-1 w-0.5 rounded-full z-10"
                    style={{ backgroundColor: 'var(--fx-accent)' }}
                  />
                )}
                {showDropAfter && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-[3px] top-1 bottom-1 w-0.5 rounded-full z-10"
                    style={{ backgroundColor: 'var(--fx-accent)' }}
                  />
                )}

                {group && (
                  <button
                    type="button"
                    data-tab-action="group"
                    onClick={() => onToggleGroupCollapse(group.id)}
                    aria-label={`Tab island ${group.name}`}
                    title={`Tab Island: ${group.name} (click to collapse)`}
                    className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white shrink-0"
                    style={{ backgroundColor: `${group.color}28`, border: `1px solid ${group.color}66` }}
                  >
                    {group.name}
                  </button>
                )}

                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    if (suppressClickTabRef.current === tab.id) return;
                    onSelectTab(tab.id);
                  }}
                  className={`flex items-center gap-1.5 ${
                    tab.pinned ? 'px-2' : 'pl-2.5 pr-1'
                  } h-full text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-tl-md whitespace-nowrap`}
                  title={
                    tab.hibernated
                      ? `${tab.title} (Hibernated — drag to reorder or pull down for new window)`
                      : `${tab.title} (Drag to reorder or pull down to open in new window)`
                  }
                >
                  {getTabIcon(tab)}
                  {!tab.pinned && (
                    <span className={`truncate max-w-[140px] ${tab.hibernated ? 'opacity-60' : ''}`}>
                      {tab.title}
                    </span>
                  )}
                </button>

                {tab.muted && (
                  <button
                    type="button"
                    data-tab-action="mute"
                    onClick={() => onToggleMuteTab(tab.id)}
                    aria-label={`Unmute tab ${tab.title}`}
                    title="Tab muted (click to unmute)"
                    className="p-1 text-amber-400 hover:text-amber-300 rounded transition-colors"
                  >
                    <VolumeX className="w-3 h-3" />
                  </button>
                )}

                {!tab.pinned && (
                  <>
                    <button
                      type="button"
                      data-tab-action="split"
                      onClick={() => onToggleSplit(tab.id)}
                      aria-label={isSplit ? `Exit split for ${tab.title}` : `Split view with ${tab.title}`}
                      title={isSplit ? 'Active in Split View' : 'Open in Split View'}
                      className={`p-1 rounded transition-opacity focus-visible:outline-none ${
                        isSplit
                          ? 'text-sky-400 opacity-100'
                          : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Columns2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      data-tab-action="pin"
                      onClick={() => onTogglePin(tab.id)}
                      aria-label={`Pin tab ${tab.title}`}
                      title="Pin tab"
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white rounded transition-opacity focus-visible:outline-none"
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                  </>
                )}

                {tab.pinned && (
                  <button
                    type="button"
                    data-tab-action="pin"
                    onClick={() => onTogglePin(tab.id)}
                    aria-label={`Unpin tab ${tab.title}`}
                    title="Unpin tab"
                    className="p-1 text-slate-400 hover:text-white rounded"
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                )}

                <button
                  type="button"
                  data-tab-action="close"
                  onClick={() => onCloseTab(tab.id)}
                  aria-label={`Close tab ${tab.title}`}
                  className="p-1 mr-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors focus-visible:outline-none"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onNewTab}
          aria-label="New Tab"
          title="New Tab (Ctrl+T)"
          className="flex items-center justify-center w-7 h-7 ml-0.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Double-click empty tab bar space to open a new tab */}
        <div
          data-testid="tabstrip-empty-space"
          onDoubleClick={onNewTab}
          title="Double-click to open a new tab"
          className="flex-1 min-w-[24px] h-8 cursor-default"
        />
      </div>

      {/* Right-hand tab strip utilities */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onNewPrivateTab}
          aria-label="New Private Tab"
          title="New Private Tab (Ctrl+Shift+N)"
          className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-slate-400 hover:text-purple-300 hover:bg-white/8 transition-colors"
        >
          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden md:inline">Private</span>
        </button>
        <button
          type="button"
          onClick={onOpenTabSearch}
          aria-label="Search open tabs"
          title="Search Open Tabs (Ctrl+K)"
          className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden lg:inline font-mono-tabular text-[11px] text-slate-500">Ctrl+K</span>
        </button>
        <button
          type="button"
          onClick={onToggleVerticalTabs}
          aria-label="Enable vertical tabs"
          title="Vertical Tabs"
          className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
        >
          <PanelLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleQuickSettings}
          aria-label="Quick Settings"
          aria-expanded={quickSettingsOpen}
          title="Quick Settings & Hardware Acceleration"
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
            quickSettingsOpen
              ? 'text-white bg-white/15'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <Settings className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {dragState && <DragDetachPreview drag={dragState} />}

      {contextMenu && (
        <TabContextMenu
          menu={contextMenu}
          tabs={tabs}
          activeTabId={activeTabId}
          splitTabId={splitTabId}
          canReopenClosedTab={canReopenClosedTab}
          onCloseMenu={() => setContextMenu(null)}
          onDuplicateTab={onDuplicateTab}
          onDetachTab={(id) => onDetachTab(id)}
          onReloadTab={onReloadTab}
          onToggleMuteTab={onToggleMuteTab}
          onTogglePin={onTogglePin}
          onToggleSplit={onToggleSplit}
          onHibernateTab={onHibernateTab}
          onReopenClosedTab={onReopenClosedTab}
          onCloseTab={onCloseTab}
          onCloseTabsToRight={onCloseTabsToRight}
          onCloseOtherTabs={onCloseOtherTabs}
        />
      )}
    </div>
  );
});

export const VerticalTabRail = memo(function VerticalTabRail({
  tabs,
  tabGroups,
  activeTabId,
  splitTabId,
  canReopenClosedTab = false,
  onSelectTab,
  onCloseTab,
  onDuplicateTab,
  onReloadTab,
  onHibernateTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onToggleMuteTab,
  onReorderTab,
  onDetachTab,
  onReopenClosedTab,
  onNewTab,
  onNewPrivateTab,
  onTogglePin,
  onToggleSplit,
  onToggleGroupCollapse,
  onOpenTabSearch,
  onContextMenuOpenChange,
  onDragOverlayChange,
  onHoverUrl,
}: Omit<TabBarSharedProps, 'verticalTabs' | 'onToggleVerticalTabs' | 'quickSettingsOpen' | 'onToggleQuickSettings'>) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragState, setDragState] = useState<TabDragState | null>(null);
  const dragRef = useRef<TabDragState | null>(null);
  const suppressClickTabRef = useRef<string | null>(null);
  const railRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onContextMenuOpenChange?.(Boolean(contextMenu));
  }, [contextMenu, onContextMenuOpenChange]);

  useEffect(() => {
    onDragOverlayChange?.(Boolean(dragState?.active));
  }, [dragState?.active, onDragOverlayChange]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
      if (!cur.active && dist < 7) return;

      const railRect = railRef.current?.getBoundingClientRect();
      const detaching = Boolean(
        railRect && (e.clientX > railRect.right + 42 || e.clientX < railRect.left - 32)
      );

      let dropTargetId: string | null = null;
      let dropPosition: 'before' | 'after' = 'before';
      if (!detaching && railRef.current) {
        const tabEls = railRef.current.querySelectorAll<HTMLElement>('[data-vtab-id]');
        for (const el of tabEls) {
          const tid = el.dataset.vtabId;
          if (!tid || tid === cur.tabId) continue;
          const rect = el.getBoundingClientRect();
          if (e.clientY >= rect.top - 4 && e.clientY <= rect.bottom + 4) {
            dropTargetId = tid;
            dropPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            break;
          }
        }
      }

      const next: TabDragState = {
        ...cur,
        active: true,
        currentX: e.clientX,
        currentY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        detaching,
        dropTargetId,
        dropPosition,
      };
      dragRef.current = next;
      setDragState(next);
    };

    const onPointerUp = () => {
      const cur = dragRef.current;
      if (!cur) return;
      dragRef.current = null;
      setDragState(null);

      if (!cur.active) return;
      suppressClickTabRef.current = cur.tabId;
      window.setTimeout(() => {
        if (suppressClickTabRef.current === cur.tabId) suppressClickTabRef.current = null;
      }, 150);

      if (cur.detaching) {
        onDetachTab(cur.tabId, {
          x: cur.currentX,
          y: cur.currentY,
          screenX: cur.screenX,
          screenY: cur.screenY,
        });
      } else if (cur.dropTargetId) {
        onReorderTab(cur.tabId, cur.dropTargetId, cur.dropPosition);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onDetachTab, onReorderTab]);

  const handleOpenContextMenu = (e: ReactMouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const orderedTabs = useMemo(() => sortTabsPinnedFirst(tabs), [tabs]);
  const groupMap = useMemo(() => new Map(tabGroups.map((g) => [g.id, g])), [tabGroups]);
  const renderedCollapsedGroups = new Set<string>();

  return (
    <aside
      ref={railRef}
      className="flex flex-col w-56 border-r border-white/8 shrink-0 select-none"
      style={{ backgroundColor: 'var(--fx-chrome)' }}
      aria-label="Vertical tabs"
    >
      <div className="flex items-center justify-between gap-1 px-2.5 h-10 border-b border-white/8">
        <button
          type="button"
          onClick={onNewTab}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/8 hover:bg-white/14 text-xs font-medium text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          New Tab
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewPrivateTab}
            aria-label="New Private Tab"
            title="New Private Tab"
            className="p-1.5 rounded text-slate-400 hover:text-purple-300 hover:bg-white/8"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenTabSearch}
            aria-label="Search open tabs"
            title="Search Tabs"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/8"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-2 space-y-1"
        role="tablist"
        aria-label="Browser tabs"
        aria-orientation="vertical"
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) onNewTab();
        }}
      >
        {orderedTabs.map((tab) => {
          const group = tab.groupId ? groupMap.get(tab.groupId) : undefined;
          if (group?.collapsed && tab.id !== activeTabId && tab.id !== splitTabId) {
            if (renderedCollapsedGroups.has(group.id)) return null;
            renderedCollapsedGroups.add(group.id);
            return (
              <button
                key={`vgroup-${group.id}`}
                type="button"
                onClick={() => onToggleGroupCollapse(group.id)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#141824] border border-white/10 text-xs text-slate-200 hover:bg-[#1B2131]"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                  {group.name}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
            );
          }

          const isActive = tab.id === activeTabId;
          const isSplit = tab.id === splitTabId;
          const isDraggingThis = dragState?.active && dragState.tabId === tab.id;

          return (
            <div
              key={tab.id}
              data-vtab-id={tab.id}
              onPointerDown={(e) => {
                if (e.button !== 0 || (e.target as HTMLElement).closest('[data-tab-action]')) return;
                dragRef.current = {
                  tabId: tab.id,
                  title: tab.title,
                  url: tab.url,
                  isPrivate: tab.isPrivate,
                  startX: e.clientX,
                  startY: e.clientY,
                  currentX: e.clientX,
                  currentY: e.clientY,
                  screenX: e.screenX,
                  screenY: e.screenY,
                  active: false,
                  detaching: false,
                  dropTargetId: null,
                  dropPosition: 'before',
                };
              }}
              onContextMenu={(e) => handleOpenContextMenu(e, tab.id)}
              onMouseEnter={() => {
                if (!tab.url.startsWith('ferrox://')) onHoverUrl?.(tab.url);
              }}
              onMouseLeave={() => onHoverUrl?.(null)}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-colors ${
                isDraggingThis
                  ? 'opacity-40'
                  : isActive
                  ? 'bg-[#161B26] border-white/15 text-white'
                  : isSplit
                  ? 'bg-[#131823] border-sky-400/35 text-slate-100'
                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              style={isActive ? { boxShadow: 'inset 3px 0 0 0 var(--fx-accent)' } : undefined}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (suppressClickTabRef.current === tab.id) return;
                  onSelectTab(tab.id);
                }}
                className="flex items-center gap-2 min-w-0 flex-1 text-left text-xs"
              >
                {getTabIcon(tab)}
                <span className="truncate">{tab.title}</span>
              </button>
              {tab.muted && (
                <button
                  type="button"
                  data-tab-action="mute"
                  onClick={() => onToggleMuteTab(tab.id)}
                  aria-label={`Unmute ${tab.title}`}
                  className="p-1 text-amber-400 hover:text-amber-300 rounded"
                >
                  <VolumeX className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                data-tab-action="split"
                onClick={() => onToggleSplit(tab.id)}
                aria-label={`Split ${tab.title}`}
                className={`p-1 rounded ${
                  isSplit
                    ? 'text-sky-400'
                    : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white'
                }`}
              >
                <Columns2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                data-tab-action="pin"
                onClick={() => onTogglePin(tab.id)}
                aria-label={tab.pinned ? `Unpin ${tab.title}` : `Pin ${tab.title}`}
                className={`p-1 rounded ${
                  tab.pinned
                    ? 'text-slate-200'
                    : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white'
                }`}
              >
                <Pin className="w-3 h-3" />
              </button>
              <button
                type="button"
                data-tab-action="close"
                onClick={() => onCloseTab(tab.id)}
                aria-label={`Close ${tab.title}`}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {dragState && <DragDetachPreview drag={dragState} />}

      {contextMenu && (
        <TabContextMenu
          menu={contextMenu}
          tabs={tabs}
          activeTabId={activeTabId}
          splitTabId={splitTabId}
          canReopenClosedTab={canReopenClosedTab}
          onCloseMenu={() => setContextMenu(null)}
          onDuplicateTab={onDuplicateTab}
          onDetachTab={(id) => onDetachTab(id)}
          onReloadTab={onReloadTab}
          onToggleMuteTab={onToggleMuteTab}
          onTogglePin={onTogglePin}
          onToggleSplit={onToggleSplit}
          onHibernateTab={onHibernateTab}
          onReopenClosedTab={onReopenClosedTab}
          onCloseTab={onCloseTab}
          onCloseTabsToRight={onCloseTabsToRight}
          onCloseOtherTabs={onCloseOtherTabs}
        />
      )}
    </aside>
  );
});
