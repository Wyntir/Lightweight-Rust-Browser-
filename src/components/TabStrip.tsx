import {
  ChevronDown,
  ChevronRight,
  Columns2,
  EyeOff,
  Globe,
  PanelLeft,
  PauseCircle,
  Pin,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { Tab, TabGroup } from '../lib/browserEngine';

interface TabBarSharedProps {
  tabs: Tab[];
  tabGroups: TabGroup[];
  activeTabId: string | null;
  splitTabId: string | null;
  verticalTabs: boolean;
  quickSettingsOpen: boolean;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onNewPrivateTab: () => void;
  onTogglePin: (id: string) => void;
  onToggleSplit: (id: string) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  onOpenTabSearch: () => void;
  onToggleVerticalTabs: () => void;
  onToggleQuickSettings: () => void;
}

function getTabIcon(tab: Tab) {
  if (tab.isPrivate) {
    return <EyeOff className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />;
  }
  if (tab.hibernated) {
    return <PauseCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (tab.url === 'ferrox://speed-dial') {
    return <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />;
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

export function TabStrip({
  tabs,
  tabGroups,
  activeTabId,
  splitTabId,
  verticalTabs,
  quickSettingsOpen,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewPrivateTab,
  onTogglePin,
  onToggleSplit,
  onToggleGroupCollapse,
  onOpenTabSearch,
  onToggleVerticalTabs,
  onToggleQuickSettings,
}: TabBarSharedProps) {
  const orderedTabs = sortTabsPinnedFirst(tabs);
  const groupMap = new Map(tabGroups.map((g) => [g.id, g]));

  // Track which collapsed groups we have already rendered an island chip for
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
      className="flex items-center justify-between gap-2 h-10 px-2.5 border-b border-white/8 select-none"
      style={{ backgroundColor: 'var(--fx-chrome)' }}
    >
      {/* Top-left strictly starts with tabs only */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1" role="tablist" aria-label="Browser tabs">
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

            return (
              <div
                key={tab.id}
                className={`group flex items-center gap-0.5 h-8 rounded-t-md border transition-colors shrink-0 ${
                  isActive
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
                {group && (
                  <button
                    type="button"
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
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center gap-1.5 ${
                    tab.pinned ? 'px-2' : 'pl-2.5 pr-1'
                  } h-full text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-tl-md whitespace-nowrap`}
                  title={tab.hibernated ? `${tab.title} (Hibernated)` : tab.title}
                >
                  {getTabIcon(tab)}
                  {!tab.pinned && (
                    <span className={`truncate max-w-[140px] ${tab.hibernated ? 'opacity-60' : ''}`}>
                      {tab.title}
                    </span>
                  )}
                </button>

                {!tab.pinned && (
                  <>
                    <button
                      type="button"
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
          title="New Tab"
          className="flex items-center justify-center w-7 h-7 ml-0.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Right-hand tab strip utilities */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onNewPrivateTab}
          aria-label="New Private Tab"
          title="New Private Tab (no history/cookies retained)"
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
    </div>
  );
}

export function VerticalTabRail({
  tabs,
  tabGroups,
  activeTabId,
  splitTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewPrivateTab,
  onTogglePin,
  onToggleSplit,
  onToggleGroupCollapse,
  onOpenTabSearch,
}: Omit<TabBarSharedProps, 'verticalTabs' | 'onToggleVerticalTabs' | 'quickSettingsOpen' | 'onToggleQuickSettings'>) {
  const orderedTabs = sortTabsPinnedFirst(tabs);
  const groupMap = new Map(tabGroups.map((g) => [g.id, g]));
  const renderedCollapsedGroups = new Set<string>();

  return (
    <aside
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

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
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

          return (
            <div
              key={tab.id}
              className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-colors ${
                isActive
                  ? 'bg-[#161B26] border-white/15 text-white'
                  : isSplit
                  ? 'bg-[#131823] border-sky-400/35 text-slate-100'
                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              style={isActive ? { boxShadow: 'inset 3px 0 0 0 var(--fx-accent)' } : undefined}
            >
              <button
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left text-xs"
              >
                {getTabIcon(tab)}
                <span className="truncate">{tab.title}</span>
              </button>
              <button
                type="button"
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
    </aside>
  );
}
