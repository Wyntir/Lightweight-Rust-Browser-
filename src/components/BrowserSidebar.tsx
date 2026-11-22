import { memo } from 'react';
import {
  Gauge,
  Globe,
  Layers,
  LayoutGrid,
  Shield,
} from 'lucide-react';

export type DrawerTab = 'limiter' | 'workspaces' | 'vpn' | 'privacy' | null;

interface BrowserSidebarProps {
  activeDrawer: DrawerTab;
  activeUrl: string;
  vpnEnabled: boolean;
  onToggleDrawer: (drawer: Exclude<DrawerTab, null>) => void;
  onNavigateInternal: (url: string) => void;
}

export const BrowserSidebar = memo(function BrowserSidebar({
  activeDrawer,
  activeUrl,
  vpnEnabled,
  onToggleDrawer,
  onNavigateInternal,
}: BrowserSidebarProps) {
  return (
    <aside
      className="flex flex-col items-center justify-between w-12 py-3 border-r border-white/8 shrink-0 select-none"
      style={{ backgroundColor: 'var(--fx-chrome)' }}
      aria-label="Browser rail"
    >
      <div className="flex flex-col items-center gap-2 w-full px-1.5">
        <button
          type="button"
          onClick={() => onToggleDrawer('limiter')}
          aria-label="Resource Limiter and Site Isolation"
          aria-expanded={activeDrawer === 'limiter'}
          title="CPU/RAM Limiter & Site Isolation"
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            activeDrawer === 'limiter'
              ? 'text-white bg-[#1A202E] border border-white/15'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Gauge
            className="w-4 h-4"
            style={activeDrawer === 'limiter' ? { color: 'var(--fx-accent)' } : undefined}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={() => onToggleDrawer('workspaces')}
          aria-label="Workspaces and Tab Controls"
          aria-expanded={activeDrawer === 'workspaces'}
          title="Workspaces, Tab Islands & Split View"
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            activeDrawer === 'workspaces'
              ? 'text-white bg-[#1A202E] border border-white/15'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Layers
            className="w-4 h-4"
            style={activeDrawer === 'workspaces' ? { color: 'var(--fx-accent)' } : undefined}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={() => onToggleDrawer('vpn')}
          aria-label="VPN Settings"
          aria-expanded={activeDrawer === 'vpn'}
          title={vpnEnabled ? 'VPN Connected' : 'VPN Settings'}
          className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            activeDrawer === 'vpn'
              ? 'text-white bg-[#1A202E] border border-white/15'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Globe
            className="w-4 h-4"
            style={
              activeDrawer === 'vpn'
                ? { color: 'var(--fx-accent)' }
                : vpnEnabled
                ? { color: '#38BDF8' }
                : undefined
            }
            aria-hidden="true"
          />
          {vpnEnabled && (
            <span
              className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sky-400"
              aria-hidden="true"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleDrawer('privacy')}
          aria-label="Privacy, Shield and DoH"
          aria-expanded={activeDrawer === 'privacy'}
          title="Privacy, Ad Shield & DoH"
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            activeDrawer === 'privacy'
              ? 'text-white bg-[#1A202E] border border-white/15'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Shield
            className="w-4 h-4"
            style={activeDrawer === 'privacy' ? { color: 'var(--fx-accent)' } : undefined}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="flex flex-col items-center w-full px-1.5">
        <button
          type="button"
          onClick={() => onNavigateInternal('ferrox://hub')}
          aria-label="Browser Manager Hub"
          title="Bookmarks, History, Downloads, Passwords & Extensions"
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            activeUrl === 'ferrox://hub' || activeUrl === 'ferrox://settings'
              ? 'text-white bg-[#1A202E] border border-white/15'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <LayoutGrid className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
});
