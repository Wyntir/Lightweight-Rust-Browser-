import { memo } from 'react';
import {
  Gauge,
  Globe,
  Layers,
  LayoutGrid,
  Settings,
  Shield,
} from 'lucide-react';

export type DrawerTab = 'limiter' | 'workspaces' | 'vpn' | 'privacy' | null;

interface BrowserSidebarProps {
  activeDrawer: DrawerTab;
  activeUrl: string;
  vpnEnabled: boolean;
  vpnPingMs?: number;
  activeWorkspaceLabel?: string;
  activeWorkspaceTabCount?: number;
  onToggleDrawer: (drawer: Exclude<DrawerTab, null>) => void;
  onNavigateInternal: (url: string) => void;
}

export const BrowserSidebar = memo(function BrowserSidebar({
  activeDrawer,
  activeUrl,
  vpnEnabled,
  vpnPingMs,
  activeWorkspaceLabel = 'Personal',
  activeWorkspaceTabCount = 0,
  onToggleDrawer,
  onNavigateInternal,
}: BrowserSidebarProps) {
  const railButtonClass = (active: boolean) =>
    `relative flex items-center justify-center w-9 h-9 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
      active
        ? 'text-white bg-white/[0.09] border border-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
        : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] border border-transparent'
    }`;

  return (
    <aside
      className="flex flex-col items-center justify-between w-12 py-3 border-r border-white/8 shrink-0 select-none"
      style={{ backgroundColor: 'var(--fx-chrome)' }}
      aria-label="Browser rail"
    >
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
        <button
          type="button"
          onClick={() => onToggleDrawer('workspaces')}
          aria-label="Workspaces and Tab Controls"
          aria-expanded={activeDrawer === 'workspaces'}
          title={`${activeWorkspaceLabel} Workspace · ${activeWorkspaceTabCount} ${activeWorkspaceTabCount === 1 ? 'tab' : 'tabs'} open`}
          className={railButtonClass(activeDrawer === 'workspaces')}
        >
          {activeDrawer === 'workspaces' && (
            <span
              className="absolute -left-1.5 top-2 bottom-2 w-[2px] rounded-r"
              style={{ backgroundColor: 'var(--fx-accent)' }}
              aria-hidden="true"
            />
          )}
          <Layers
            className="w-4 h-4"
            style={activeDrawer === 'workspaces' ? { color: 'var(--fx-accent)' } : undefined}
            aria-hidden="true"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-mono-tabular font-semibold flex items-center justify-center border border-[#0B0D12] ${
              activeWorkspaceTabCount > 0
                ? 'bg-[#1D2434] text-slate-100'
                : 'bg-[#12151E] text-slate-500'
            }`}
            aria-hidden="true"
          >
            {activeWorkspaceTabCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleDrawer('limiter')}
          aria-label="Resource Limiter and Site Isolation"
          aria-expanded={activeDrawer === 'limiter'}
          title="CPU/RAM Limiter & Auto-Hibernate"
          className={railButtonClass(activeDrawer === 'limiter')}
        >
          {activeDrawer === 'limiter' && (
            <span
              className="absolute -left-1.5 top-2 bottom-2 w-[2px] rounded-r"
              style={{ backgroundColor: 'var(--fx-accent)' }}
              aria-hidden="true"
            />
          )}
          <Gauge
            className="w-4 h-4"
            style={activeDrawer === 'limiter' ? { color: 'var(--fx-accent)' } : undefined}
            aria-hidden="true"
          />
        </button>

        <div className="w-5 h-px bg-white/8 my-1" aria-hidden="true" />

        <button
          type="button"
          onClick={() => onToggleDrawer('vpn')}
          aria-label="VPN Settings"
          aria-expanded={activeDrawer === 'vpn'}
          title={
            vpnEnabled
              ? `VPN Connected${typeof vpnPingMs === 'number' ? ` · ${vpnPingMs} ms` : ''}`
              : 'VPN Tunnel & Regional Ping'
          }
          className={railButtonClass(activeDrawer === 'vpn')}
        >
          {activeDrawer === 'vpn' && (
            <span
              className="absolute -left-1.5 top-2 bottom-2 w-[2px] rounded-r"
              style={{ backgroundColor: 'var(--fx-accent)' }}
              aria-hidden="true"
            />
          )}
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
          title="All-Site Ad Shield, Privacy & DoH"
          className={railButtonClass(activeDrawer === 'privacy')}
        >
          {activeDrawer === 'privacy' && (
            <span
              className="absolute -left-1.5 top-2 bottom-2 w-[2px] rounded-r"
              style={{ backgroundColor: 'var(--fx-accent)' }}
              aria-hidden="true"
            />
          )}
          <Shield
            className="w-4 h-4"
            style={activeDrawer === 'privacy' ? { color: 'var(--fx-accent)' } : undefined}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
        <div className="w-5 h-px bg-white/8 mb-0.5" aria-hidden="true" />
        <button
          type="button"
          onClick={() => onNavigateInternal('ferrox://hub')}
          aria-label="Browser Manager Hub"
          title="Bookmarks, History, Downloads, Passwords & Extensions"
          className={railButtonClass(activeUrl === 'ferrox://hub')}
        >
          {activeUrl === 'ferrox://hub' && (
            <span
              className="absolute -left-1.5 top-2 bottom-2 w-[2px] rounded-r"
              style={{ backgroundColor: 'var(--fx-accent)' }}
              aria-hidden="true"
            />
          )}
          <LayoutGrid className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateInternal('ferrox://settings')}
          aria-label="Browser Settings"
          title="Browser Settings & Profile Sync"
          className={railButtonClass(activeUrl === 'ferrox://settings')}
        >
          {activeUrl === 'ferrox://settings' && (
            <span
              className="absolute -left-1.5 top-2 bottom-2 w-[2px] rounded-r"
              style={{ backgroundColor: 'var(--fx-accent)' }}
              aria-hidden="true"
            />
          )}
          <Settings className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
});
