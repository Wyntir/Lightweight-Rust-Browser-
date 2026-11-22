import { useState } from 'react';
import { Maximize2, PictureInPicture2, Volume2, VolumeX, X } from 'lucide-react';
import { Tab } from '../lib/browserEngine';
import { LoadedPageData } from './WebViewport';

interface PipWindowProps {
  tab: Tab | null;
  pageData: LoadedPageData | null;
  onRestoreTab: (tabId: string) => void;
  onClose: () => void;
}

export function PipWindow({ tab, pageData, onRestoreTab, onClose }: PipWindowProps) {
  const [muted, setMuted] = useState(true);

  if (!tab) return null;

  return (
    <aside
      aria-label="Picture-in-Picture window"
      className="fixed bottom-4 right-4 z-40 w-80 rounded-xl bg-[#12151E] border border-white/20 shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#161B26] border-b border-white/10">
        <div className="flex items-center gap-1.5 min-w-0">
          <PictureInPicture2
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: 'var(--fx-accent)' }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-white truncate">{tab.title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute Picture-in-Picture' : 'Mute Picture-in-Picture'}
            className="p-1 text-slate-300 hover:text-white rounded hover:bg-white/10"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onRestoreTab(tab.id)}
            aria-label="Return to PiP tab"
            className="p-1 text-slate-300 hover:text-white rounded hover:bg-white/10"
            title="Focus tab"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Picture-in-Picture"
            className="p-1 text-slate-300 hover:text-white rounded hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="h-44 bg-[#0B0D12] relative">
        {pageData && !tab.url.startsWith('ferrox://') ? (
          <iframe
            sandbox="allow-scripts"
            srcDoc={pageData.sanitizedHtml}
            title={`PiP: ${tab.title}`}
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center space-y-2">
            <div className="text-xs font-medium text-slate-200 truncate max-w-full">
              {tab.title}
            </div>
            <div className="font-mono-tabular text-[11px] text-slate-500 truncate max-w-full">
              {tab.url}
            </div>
            <p className="text-[11px] text-slate-400">
              Floating viewport stays visible while you switch tabs.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
