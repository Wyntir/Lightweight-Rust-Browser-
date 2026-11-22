import { useEffect, useRef, useState } from 'react';
import { Columns2, EyeOff, Globe, Pin, Search, Terminal, X } from 'lucide-react';
import { searchTabs, Tab, WORKSPACES } from '../lib/browserEngine';

interface TabSearchModalProps {
  open: boolean;
  tabs: Tab[];
  activeTabId: string | null;
  onClose: () => void;
  onSelectTab: (tab: Tab) => void;
  onSplitWithTab: (tab: Tab) => void;
}

export function TabSearchModal({
  open,
  tabs,
  activeTabId,
  onClose,
  onSelectTab,
  onSplitWithTab,
}: TabSearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  if (!open) return null;

  const matches = searchTabs(tabs, query);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Search open tabs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-[#12151E] border border-white/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/10">
          <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && matches[0]) {
                onSelectTab(matches[0]);
                onClose();
              }
            }}
            aria-label="Filter open tabs by title, URL, or workspace"
            placeholder="Search open tabs across all workspaces... (Ctrl+K)"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tab search"
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-white/8">
          {matches.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              No tabs match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            matches.map((tab) => {
              const isCurrent = tab.id === activeTabId;
              const wsLabel =
                WORKSPACES.find((w) => w.id === tab.workspace)?.label ?? tab.workspace;
              return (
                <div
                  key={tab.id}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/6 transition-colors ${
                    isCurrent ? 'bg-white/5' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTab(tab);
                      onClose();
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    {tab.isPrivate ? (
                      <EyeOff className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
                    ) : tab.url.startsWith('ferrox://') ? (
                      <Terminal
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--fx-accent)' }}
                        aria-hidden="true"
                      />
                    ) : (
                      <Globe className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white truncate">
                          {tab.title}
                        </span>
                        {tab.pinned && <Pin className="w-3 h-3 text-slate-400 shrink-0" />}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-slate-300 shrink-0">
                          {wsLabel}
                        </span>
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-500 truncate">
                        {tab.url}
                      </div>
                    </div>
                  </button>

                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => {
                        onSplitWithTab(tab);
                        onClose();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/8 hover:bg-white/14 text-[11px] font-medium text-slate-200 whitespace-nowrap shrink-0"
                      title="Open beside current tab in Split View"
                    >
                      <Columns2 className="w-3 h-3" aria-hidden="true" />
                      Split
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
