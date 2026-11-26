import { memo, useMemo } from 'react';
import { Globe, Terminal, X } from 'lucide-react';
import { BookmarkItem } from '../lib/browserEngine';

interface BookmarksBarProps {
  bookmarks: BookmarkItem[];
  onNavigate: (url: string) => void;
  onOpenBackgroundTab?: (url: string) => void;
  onHoverUrl?: (url: string | null) => void;
  onUnpinFromBar: (id: string) => void;
  onOpenManager: () => void;
}

export const BookmarksBar = memo(function BookmarksBar({
  bookmarks,
  onNavigate,
  onOpenBackgroundTab,
  onHoverUrl,
  onUnpinFromBar,
  onOpenManager,
}: BookmarksBarProps) {
  const barBookmarks = useMemo(
    () => bookmarks.filter((b) => b.pinnedToBar !== false),
    [bookmarks]
  );

  return (
    <div
      className="flex items-center justify-between gap-2 h-8 px-3 border-b border-white/8 select-none overflow-x-auto no-scrollbar shrink-0"
      style={{ backgroundColor: 'var(--fx-chrome)' }}
      aria-label="Bookmarks bar"
    >
      <div className="flex items-center gap-1 min-w-0">
        {barBookmarks.length === 0 ? (
          <span className="text-[11px] text-slate-500">
            No bookmarks pinned to bar. Star a page or press Ctrl+D to bookmark.
          </span>
        ) : (
          barBookmarks.slice(0, 12).map((bm) => (
            <div
              key={bm.id}
              className="group flex items-center gap-1 h-6 rounded px-2 hover:bg-white/8 transition-colors shrink-0"
            >
              <button
                type="button"
                onClick={(e) => {
                  if ((e.ctrlKey || e.metaKey) && onOpenBackgroundTab) {
                    e.preventDefault();
                    onOpenBackgroundTab(bm.url);
                    return;
                  }
                  onNavigate(bm.url);
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  if (e.button === 1 && onOpenBackgroundTab) {
                    e.preventDefault();
                    onOpenBackgroundTab(bm.url);
                  }
                }}
                onMouseEnter={() => onHoverUrl?.(bm.url)}
                onMouseLeave={() => onHoverUrl?.(null)}
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white whitespace-nowrap"
                title={`${bm.title} (${bm.url})`}
              >
                {bm.url.startsWith('ferrox://') ? (
                  <Terminal
                    className="w-3 h-3 shrink-0"
                    style={{ color: 'var(--fx-accent)' }}
                    aria-hidden="true"
                  />
                ) : (
                  <Globe className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                )}
                <span className="max-w-[130px] truncate">{bm.title}</span>
              </button>
              <button
                type="button"
                onClick={() => onUnpinFromBar(bm.id)}
                aria-label={`Hide ${bm.title} from bookmarks bar`}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 p-0.5 rounded transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onOpenManager}
        className="text-[11px] font-medium text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/8 whitespace-nowrap shrink-0"
      >
        All Bookmarks
      </button>
    </div>
  );
});
