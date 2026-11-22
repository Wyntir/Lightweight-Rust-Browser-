import { FormEvent, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

interface FindInPageBarProps {
  open: boolean;
  query: string;
  onChangeQuery: (query: string) => void;
  onFindNext: () => void;
  onFindPrev: () => void;
  onClose: () => void;
}

export function FindInPageBar({
  open,
  query,
  onChangeQuery,
  onFindNext,
  onFindPrev,
  onClose,
}: FindInPageBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onFindNext();
  };

  return (
    <div
      role="search"
      aria-label="Find in page"
      className="flex items-center justify-between gap-3 h-10 px-4 border-b border-white/10 shrink-0 fx-pop-in"
      style={{ backgroundColor: 'var(--fx-panel)' }}
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1 max-w-md">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            } else if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault();
              onFindPrev();
            }
          }}
          placeholder="Find in page..."
          aria-label="Find text in current page"
          className="flex-1 h-7 px-2.5 rounded bg-[#0B0D12] border border-white/12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={onFindPrev}
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          className="flex items-center justify-center w-7 h-7 rounded bg-white/6 hover:bg-white/12 text-slate-300 hover:text-white transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onFindNext}
          aria-label="Next match"
          title="Next match (Enter)"
          className="flex items-center justify-center w-7 h-7 rounded bg-white/6 hover:bg-white/12 text-slate-300 hover:text-white transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </form>

      <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
        <span className="hidden sm:inline">Enter: Next · Shift+Enter: Prev · Esc: Close</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close find bar"
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
