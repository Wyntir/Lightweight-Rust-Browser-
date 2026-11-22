import { FormEvent, useState } from 'react';
import {
  CheckCircle2,
  Columns2,
  Cpu,
  EyeOff,
  Gauge,
  Globe,
  Lock,
  PanelLeft,
  PauseCircle,
  Plus,
  Shield,
  Trash2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  BlockedEvent,
  DOH_PROVIDERS,
  DohProviderId,
  getOriginFromUrl,
  LimiterConfig,
  PrivacySecurityConfig,
  Tab,
  TabGroup,
  TabGroupColor,
  VPN_SERVERS,
  VpnProtocolId,
  WORKSPACES,
  WorkspaceId,
} from '../lib/browserEngine';
import { DrawerTab } from './BrowserSidebar';

interface DrawersProps {
  activeDrawer: DrawerTab;
  limiter: LimiterConfig;
  tabs: Tab[];
  workspaceTabs: Tab[];
  tabGroups: TabGroup[];
  activeTabId: string | null;
  splitTabId: string | null;
  activeWorkspace: WorkspaceId;
  verticalTabs: boolean;
  totalRamMb: number;
  totalCpuPercent: number;
  shieldEnabled: boolean;
  trackerRules: string[];
  blockedEvents: BlockedEvent[];
  privacyConfig: PrivacySecurityConfig;
  onClose: () => void;
  onUpdateLimiter: (next: LimiterConfig) => void;
  onHibernateInactive: () => void;
  onHibernateTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onSelectWorkspace: (ws: WorkspaceId) => void;
  onToggleVerticalTabs: () => void;
  onSetSplitTab: (tabId: string | null) => void;
  onCreateTabGroup: (name: string, color: TabGroupColor, assignActive: boolean) => void;
  onAssignTabGroup: (tabId: string, groupId: string | null) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  onToggleShield: () => void;
  onAddTrackerRule: (domain: string) => void;
  onRemoveTrackerRule: (domain: string) => void;
  onUpdatePrivacyConfig: (next: PrivacySecurityConfig) => void;
  onNewPrivateTab: () => void;
  onOpenUrl: (url: string) => void;
  onClearData: (scope: 'cache' | 'cookies' | 'history' | 'storage' | 'all') => void;
}

const ISLAND_COLORS: TabGroupColor[] = ['#FA1E4E', '#38BDF8', '#10B981', '#F59E0B', '#A78BFA'];

function ToggleSwitch({
  id,
  label,
  checked,
  onToggle,
}: {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? '' : 'bg-white/15'
      }`}
      style={checked ? { backgroundColor: 'var(--fx-accent)' } : undefined}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function RadialGauge({
  percent,
  valueLabel,
  subLabel,
  accentHex,
}: {
  percent: number;
  valueLabel: string;
  subLabel: string;
  accentHex?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 24;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/25 border border-white/10">
      <svg className="w-11 h-11 shrink-0 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={accentHex ?? 'var(--fx-accent)'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="min-w-0">
        <div className="font-mono-tabular text-sm font-semibold text-white whitespace-nowrap leading-tight">
          {valueLabel}
        </div>
        <div className="text-[11px] text-slate-400 whitespace-nowrap mt-0.5">{subLabel}</div>
      </div>
    </div>
  );
}

export function Drawers({
  activeDrawer,
  limiter,
  tabs,
  workspaceTabs,
  tabGroups,
  activeTabId,
  splitTabId,
  activeWorkspace,
  verticalTabs,
  totalRamMb,
  totalCpuPercent,
  shieldEnabled,
  trackerRules,
  blockedEvents,
  privacyConfig,
  onClose,
  onUpdateLimiter,
  onHibernateInactive,
  onHibernateTab,
  onSelectTab,
  onSelectWorkspace,
  onToggleVerticalTabs,
  onSetSplitTab,
  onCreateTabGroup,
  onAssignTabGroup,
  onToggleGroupCollapse,
  onToggleShield,
  onAddTrackerRule,
  onRemoveTrackerRule,
  onUpdatePrivacyConfig,
  onNewPrivateTab,
  onOpenUrl,
  onClearData,
}: DrawersProps) {
  const [newRule, setNewRule] = useState('');
  const [newBypass, setNewBypass] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState<TabGroupColor>('#FA1E4E');
  const [dohResult, setDohResult] = useState<string | null>(null);
  const [dohTesting, setDohTesting] = useState(false);
  const [clearNotice, setClearNotice] = useState<string | null>(null);

  if (!activeDrawer) return null;

  const handleRuleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = newRule.trim().toLowerCase();
    if (!cleaned) return;
    onAddTrackerRule(cleaned);
    setNewRule('');
  };

  const handleBypassSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = newBypass.trim().toLowerCase();
    if (!cleaned || privacyConfig.vpnBypassDomains.includes(cleaned)) return;
    onUpdatePrivacyConfig({
      ...privacyConfig,
      vpnBypassDomains: [...privacyConfig.vpnBypassDomains, cleaned],
    });
    setNewBypass('');
  };

  const handleCreateGroup = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = groupName.trim();
    if (!cleaned) return;
    onCreateTabGroup(cleaned, groupColor, true);
    setGroupName('');
  };

  const handleTestDoh = async () => {
    setDohTesting(true);
    setDohResult(null);
    try {
      const params = new URLSearchParams({
        provider: privacyConfig.dohProvider,
        domain: 'rust-lang.org',
        customUrl: privacyConfig.customDohUrl,
      });
      const res = await fetch(`/api/doh-resolve?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setDohResult(data.error || 'DoH check failed.');
      } else {
        const firstIp = data.records?.[0]?.ip ?? 'verified';
        setDohResult(`Resolved rust-lang.org -> ${firstIp} in ${data.elapsedMs}ms via ${data.provider}`);
      }
    } catch {
      setDohResult('DoH resolution error.');
    } finally {
      setDohTesting(false);
    }
  };

  const handleClearScope = (scope: 'cache' | 'cookies' | 'history' | 'storage' | 'all') => {
    onClearData(scope);
    setClearNotice(`Cleared ${scope === 'all' ? 'all browsing data' : scope}.`);
    setTimeout(() => setClearNotice(null), 2200);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const ramRatio = limiter.ramEnabled ? (totalRamMb / Math.max(1, limiter.ramLimitMb)) * 100 : (totalRamMb / 2048) * 100;
  const cpuRatio = limiter.cpuEnabled ? (totalCpuPercent / Math.max(1, limiter.cpuLimitPercent)) * 100 : totalCpuPercent;
  const currentVpnServer =
    VPN_SERVERS.find((s) => s.region === privacyConfig.vpnRegion) ?? VPN_SERVERS[0];

  return (
    <section
      className="flex flex-col w-80 border-r border-white/10 shrink-0 overflow-hidden"
      style={{ backgroundColor: 'var(--fx-panel)' }}
      aria-label="Sidebar panel"
    >
      <div className="flex items-center justify-between h-11 px-4 border-b border-white/8 shrink-0">
        <h2 className="font-display text-sm font-semibold text-white whitespace-nowrap">
          {activeDrawer === 'limiter' && 'GX Resource Control'}
          {activeDrawer === 'workspaces' && 'Workspaces & Tab Controls'}
          {activeDrawer === 'vpn' && 'VPN Tunnel'}
          {activeDrawer === 'privacy' && 'Privacy & Shield'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close side panel"
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* UPGRADED RESOURCE LIMITER + SITE ISOLATION */}
        {activeDrawer === 'limiter' && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <RadialGauge
                percent={ramRatio}
                valueLabel={`${totalRamMb} MB`}
                subLabel={limiter.ramEnabled ? `Cap ${limiter.ramLimitMb}M` : 'Uncapped'}
                accentHex={ramRatio > 88 ? '#F59E0B' : undefined}
              />
              <RadialGauge
                percent={cpuRatio}
                valueLabel={`${totalCpuPercent}%`}
                subLabel={limiter.cpuEnabled ? `Cap ${limiter.cpuLimitPercent}%` : 'Uncapped'}
                accentHex="#38BDF8"
              />
            </div>

            {/* Quick Resource Presets */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400">Performance Profiles</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateLimiter({
                      ramEnabled: true,
                      ramLimitMb: 256,
                      cpuEnabled: true,
                      cpuLimitPercent: 35,
                      netEnabled: true,
                      netLimitKbps: 512,
                    })
                  }
                  className="py-1.5 px-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-200"
                >
                  Eco Save
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateLimiter({
                      ramEnabled: true,
                      ramLimitMb: 512,
                      cpuEnabled: false,
                      cpuLimitPercent: 60,
                      netEnabled: false,
                      netLimitKbps: 1024,
                    })
                  }
                  className="py-1.5 px-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-200"
                >
                  Balanced
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateLimiter({
                      ramEnabled: true,
                      ramLimitMb: 384,
                      cpuEnabled: true,
                      cpuLimitPercent: 45,
                      netEnabled: true,
                      netLimitKbps: 1536,
                    })
                  }
                  className="py-1.5 px-2 rounded-lg bg-black/25 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-200"
                >
                  Gaming Cap
                </button>
              </div>
            </div>

            {/* RAM Limiter Card */}
            <div className="p-3.5 rounded-xl bg-black/25 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="ram-toggle" className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Gauge className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                  RAM Limiter
                </label>
                <ToggleSwitch
                  id="ram-toggle"
                  label="RAM Limiter"
                  checked={limiter.ramEnabled}
                  onToggle={() => onUpdateLimiter({ ...limiter, ramEnabled: !limiter.ramEnabled })}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Auto-hibernate background tabs above</span>
                <span className="font-mono-tabular text-white font-semibold">{limiter.ramLimitMb} MB</span>
              </div>

              <input
                type="range"
                aria-label="RAM limit in megabytes"
                min={128}
                max={2048}
                step={32}
                value={limiter.ramLimitMb}
                onChange={(e) =>
                  onUpdateLimiter({ ...limiter, ramLimitMb: Number(e.target.value) })
                }
                className="w-full cursor-pointer"
                style={{ accentColor: 'var(--fx-accent)' }}
              />
              <div className="flex justify-between font-mono-tabular text-[10px] text-slate-500">
                <span>128M</span>
                <span>512M</span>
                <span>1G</span>
                <span>2G</span>
              </div>

              <button
                type="button"
                onClick={onHibernateInactive}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/8 hover:bg-white/14 border border-white/10 text-xs font-medium text-white transition-colors whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--fx-accent)' }} aria-hidden="true" />
                Hibernate Inactive Tabs
              </button>
            </div>

            {/* Network Limiter Card */}
            <div className="p-3.5 rounded-xl bg-black/25 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="net-toggle" className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  Network Limiter
                </label>
                <ToggleSwitch
                  id="net-toggle"
                  label="Network Limiter"
                  checked={limiter.netEnabled}
                  onToggle={() => onUpdateLimiter({ ...limiter, netEnabled: !limiter.netEnabled })}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Proxy download throttle</span>
                <span className="font-mono-tabular text-white font-semibold">
                  {limiter.netEnabled ? `${limiter.netLimitKbps} KB/s` : 'Unlimited'}
                </span>
              </div>
              <input
                type="range"
                aria-label="Network limit in kilobytes per second"
                min={64}
                max={4096}
                step={64}
                value={limiter.netLimitKbps}
                onChange={(e) =>
                  onUpdateLimiter({ ...limiter, netLimitKbps: Number(e.target.value) })
                }
                className="w-full cursor-pointer"
                style={{ accentColor: '#10B981' }}
              />
            </div>

            {/* CPU Limiter Card */}
            <div className="p-3.5 rounded-xl bg-black/25 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="cpu-toggle" className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Cpu className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                  CPU Limiter
                </label>
                <ToggleSwitch
                  id="cpu-toggle"
                  label="CPU Limiter"
                  checked={limiter.cpuEnabled}
                  onToggle={() => onUpdateLimiter({ ...limiter, cpuEnabled: !limiter.cpuEnabled })}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Renderer thread ceiling</span>
                <span className="font-mono-tabular text-white font-semibold">{limiter.cpuLimitPercent}%</span>
              </div>
              <input
                type="range"
                aria-label="CPU limit percentage"
                min={10}
                max={100}
                step={5}
                value={limiter.cpuLimitPercent}
                onChange={(e) =>
                  onUpdateLimiter({ ...limiter, cpuLimitPercent: Number(e.target.value) })
                }
                className="w-full cursor-pointer"
                style={{ accentColor: '#38BDF8' }}
              />
            </div>

            {/* Site Isolation & Sandboxing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  Site Isolation Processes
                </h3>
                <span className="text-[10px] text-emerald-400 font-medium">Sandboxed</span>
              </div>
              <div className="space-y-2">
                {tabs.map((tab, idx) => {
                  const isCurrent = tab.id === activeTabId || tab.id === splitTabId;
                  const origin = getOriginFromUrl(tab.url);
                  const pid = 4100 + idx * 17;
                  const sharePct = Math.min(100, Math.round((tab.estimatedRamMb / 128) * 100));
                  return (
                    <div
                      key={tab.id}
                      className="p-2.5 rounded-lg bg-black/25 border border-white/8 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => onSelectTab(tab.id)}
                          className="text-left min-w-0 flex-1 text-slate-200 hover:text-white truncate font-medium"
                        >
                          {tab.title}
                        </button>
                        <span className="font-mono-tabular text-slate-300 shrink-0">
                          {tab.estimatedRamMb} MB
                        </span>
                        {!isCurrent && !tab.hibernated && (
                          <button
                            type="button"
                            onClick={() => onHibernateTab(tab.id)}
                            aria-label={`Hibernate tab ${tab.title}`}
                            className="p-0.5 text-slate-400 hover:text-white rounded"
                            title="Hibernate tab"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="h-1 w-full rounded-full bg-white/8 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${sharePct}%`,
                            backgroundColor: tab.hibernated ? '#64748B' : 'var(--fx-accent)',
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between font-mono-tabular text-[10px] text-slate-500">
                        <span className="truncate max-w-[155px]">{origin}</span>
                        <span>PID {pid} · {tab.hibernated ? 'Suspended' : 'Isolated'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* DEDICATED VPN SETTINGS DRAWER */}
        {activeDrawer === 'vpn' && (
          <>
            <div className="p-4 rounded-xl bg-black/25 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Globe
                    className={`w-5 h-5 ${privacyConfig.vpnEnabled ? 'text-sky-400' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {privacyConfig.vpnEnabled ? 'VPN Connected' : 'VPN Disconnected'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {privacyConfig.vpnEnabled
                        ? `${currentVpnServer.label} · ${privacyConfig.vpnProtocol.toUpperCase()}`
                        : 'Traffic routed via local ISP'}
                    </div>
                  </div>
                </div>
                <ToggleSwitch
                  id="vpn-main-toggle"
                  label="Toggle FerroX VPN"
                  checked={privacyConfig.vpnEnabled}
                  onToggle={() =>
                    onUpdatePrivacyConfig({
                      ...privacyConfig,
                      vpnEnabled: !privacyConfig.vpnEnabled,
                    })
                  }
                />
              </div>

              {privacyConfig.vpnEnabled && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/8 font-mono-tabular text-[11px]">
                  <div>
                    <div className="text-slate-500">Virtual IP</div>
                    <div className="text-sky-300">{currentVpnServer.virtualIp}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Ping / Load</div>
                    <div className="text-emerald-400">
                      {currentVpnServer.latencyMs} ms · {currentVpnServer.loadPercent}%
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Exit Server Locations */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400">Exit Location</div>
              <div className="space-y-1.5">
                {VPN_SERVERS.map((srv) => {
                  const selected = privacyConfig.vpnRegion === srv.region;
                  return (
                    <button
                      key={srv.region}
                      type="button"
                      onClick={() =>
                        onUpdatePrivacyConfig({
                          ...privacyConfig,
                          vpnRegion: srv.region,
                        })
                      }
                      aria-pressed={selected}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-colors ${
                        selected
                          ? 'bg-[#171D2B] border-sky-400/50 text-white'
                          : 'bg-black/25 border-white/8 text-slate-300 hover:border-white/15'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-medium">{srv.region}</div>
                        <div className="text-[11px] text-slate-400">{srv.label}</div>
                      </div>
                      <div className="text-right font-mono-tabular text-[11px]">
                        <div className="text-emerald-400">{srv.latencyMs} ms</div>
                        <div className="text-slate-500">{srv.loadPercent}% load</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Protocol & Tunnel Policies */}
            <div className="p-3.5 rounded-xl bg-black/25 border border-white/10 space-y-3 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="vpn-protocol" className="block font-semibold text-slate-300">
                  Tunnel Protocol
                </label>
                <select
                  id="vpn-protocol"
                  value={privacyConfig.vpnProtocol}
                  onChange={(e) =>
                    onUpdatePrivacyConfig({
                      ...privacyConfig,
                      vpnProtocol: e.target.value as VpnProtocolId,
                    })
                  }
                  className="w-full h-8 px-2.5 rounded bg-[#0B0D12] border border-white/12 text-xs text-white"
                >
                  <option value="wireguard">WireGuard (ChaCha20 · Low Latency)</option>
                  <option value="openvpn">OpenVPN (AES-256-GCM · TCP/UDP)</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-200">VPN Kill Switch</span>
                <ToggleSwitch
                  id="vpn-killswitch"
                  label="VPN Kill Switch"
                  checked={privacyConfig.vpnKillSwitch}
                  onToggle={() =>
                    onUpdatePrivacyConfig({
                      ...privacyConfig,
                      vpnKillSwitch: !privacyConfig.vpnKillSwitch,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-200">Auto-connect on Private Tabs</span>
                <ToggleSwitch
                  id="vpn-autoconnect-private"
                  label="Auto-connect on Private Tabs"
                  checked={privacyConfig.vpnAutoConnectPrivate}
                  onToggle={() =>
                    onUpdatePrivacyConfig({
                      ...privacyConfig,
                      vpnAutoConnectPrivate: !privacyConfig.vpnAutoConnectPrivate,
                    })
                  }
                />
              </div>
            </div>

            {/* Split-Tunnel Bypass */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400">Split-Tunnel Bypass Sites</div>
              <form onSubmit={handleBypassSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={newBypass}
                  onChange={(e) => setNewBypass(e.target.value)}
                  placeholder="Domain to bypass (e.g. bank.local)"
                  aria-label="Add VPN bypass domain"
                  className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-black/30 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Add bypass domain"
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-white/10 hover:bg-white/16 text-white shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              <div className="divide-y divide-white/8 border border-white/8 rounded-lg bg-black/25">
                {privacyConfig.vpnBypassDomains.map((dom) => (
                  <div key={dom} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="font-mono-tabular text-slate-300 truncate">{dom}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePrivacyConfig({
                          ...privacyConfig,
                          vpnBypassDomains: privacyConfig.vpnBypassDomains.filter((d) => d !== dom),
                        })
                      }
                      aria-label={`Remove bypass domain ${dom}`}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* WORKSPACES + VERTICAL TABS + SPLIT VIEW + TAB ISLANDS */}
        {activeDrawer === 'workspaces' && (
          <>
            <div className="space-y-2 pb-4 border-b border-white/8">
              <h3 className="text-xs font-semibold text-slate-400">Workspaces</h3>
              <div className="space-y-1.5">
                {WORKSPACES.map((ws) => {
                  const count = tabs.filter((t) => t.workspace === ws.id).length;
                  const active = activeWorkspace === ws.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => onSelectWorkspace(ws.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-colors ${
                        active
                          ? 'bg-[#171C28] border-white/25 text-white'
                          : 'bg-black/25 border-white/8 text-slate-300 hover:border-white/15'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{ws.label}</div>
                        <div className="text-[11px] text-slate-400 truncate">{ws.description}</div>
                      </div>
                      <span className="font-mono-tabular text-xs px-2 py-0.5 rounded bg-white/8 text-slate-200 shrink-0">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5 pb-4 border-b border-white/8">
              <h3 className="text-xs font-semibold text-slate-400">Layout Modes</h3>
              <button
                type="button"
                onClick={onToggleVerticalTabs}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-black/25 border border-white/10 hover:border-white/25 text-xs text-white"
              >
                <span className="flex items-center gap-2">
                  <PanelLeft className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                  Vertical Tabs
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-300">
                  {verticalTabs ? 'On' : 'Off'}
                </span>
              </button>

              <div className="p-3 rounded-lg bg-black/25 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-white">
                  <span className="flex items-center gap-2">
                    <Columns2 className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    Split Screen
                  </span>
                  {splitTabId && (
                    <button
                      type="button"
                      onClick={() => onSetSplitTab(null)}
                      className="text-[11px] text-amber-300 hover:underline"
                    >
                      Exit Split
                    </button>
                  )}
                </div>
                <select
                  aria-label="Choose second tab for split screen"
                  value={splitTabId ?? ''}
                  onChange={(e) => onSetSplitTab(e.target.value || null)}
                  className="w-full h-8 px-2 rounded bg-[#0B0D12] border border-white/12 text-xs text-white focus:outline-none"
                >
                  <option value="">Single Pane (No Split)</option>
                  {workspaceTabs
                    .filter((t) => t.id !== activeTabId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Split with: {t.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Tab Groups / Tab Islands */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400">Tab Groups / Islands</h3>
              <form onSubmit={handleCreateGroup} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="New island name (e.g. Research)"
                    aria-label="New tab island name"
                    className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-black/30 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Create tab island"
                    className="px-2.5 h-8 rounded-md text-xs font-semibold text-white shrink-0"
                    style={{ backgroundColor: 'var(--fx-accent)' }}
                  >
                    Create
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {ISLAND_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGroupColor(c)}
                      aria-label={`Select island color ${c}`}
                      className={`w-5 h-5 rounded-full border-2 ${
                        groupColor === c ? 'border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </form>

              {activeTab && tabGroups.length > 0 && (
                <div className="p-2.5 rounded-lg bg-black/25 border border-white/8 space-y-1.5">
                  <div className="text-[11px] text-slate-400 truncate">
                    Assign &ldquo;{activeTab.title}&rdquo; to island:
                  </div>
                  <select
                    aria-label="Assign active tab to island"
                    value={activeTab.groupId ?? ''}
                    onChange={(e) => onAssignTabGroup(activeTab.id, e.target.value || null)}
                    className="w-full h-8 px-2 rounded bg-[#0B0D12] border border-white/12 text-xs text-white"
                  >
                    <option value="">Ungrouped</option>
                    {tabGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tabGroups.length > 0 && (
                <div className="divide-y divide-white/8 border border-white/8 rounded-lg bg-black/25">
                  {tabGroups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="flex items-center gap-2 text-slate-200">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleGroupCollapse(g.id)}
                        className="text-[11px] text-slate-400 hover:text-white"
                      >
                        {g.collapsed ? 'Expand' : 'Collapse'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* PRIVACY, SHIELD, DOH, CLEAR DATA */}
        {activeDrawer === 'privacy' && (
          <>
            <div className="flex items-center justify-between p-3 rounded-lg bg-black/25 border border-white/8">
              <div className="flex items-center gap-2.5">
                <Shield
                  className={`w-4 h-4 ${shieldEnabled ? 'text-emerald-400' : 'text-slate-500'}`}
                  aria-hidden="true"
                />
                <div>
                  <div className="text-sm font-medium text-white">Ad &amp; Tracker Shield</div>
                  <div className="font-mono-tabular text-xs text-slate-400">
                    {blockedEvents.length} blocked this session
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleShield}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/8 hover:bg-white/14 text-white whitespace-nowrap"
              >
                {shieldEnabled ? 'Enabled' : 'Paused'}
              </button>
            </div>

            <div className="space-y-2.5 pb-4 border-b border-white/8 text-xs">
              <label className="flex items-center justify-between gap-2 text-slate-200 cursor-pointer">
                <span>HTTPS-Only Enforcement</span>
                <input
                  type="checkbox"
                  checked={privacyConfig.httpsOnly}
                  onChange={(e) =>
                    onUpdatePrivacyConfig({ ...privacyConfig, httpsOnly: e.target.checked })
                  }
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-slate-200 cursor-pointer">
                <span>Safe Browsing (Phishing / Malware)</span>
                <input
                  type="checkbox"
                  checked={privacyConfig.safeBrowsing}
                  onChange={(e) =>
                    onUpdatePrivacyConfig({ ...privacyConfig, safeBrowsing: e.target.checked })
                  }
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-slate-200 cursor-pointer">
                <span>Fingerprinting Protection</span>
                <input
                  type="checkbox"
                  checked={privacyConfig.fingerprintProtection}
                  onChange={(e) =>
                    onUpdatePrivacyConfig({
                      ...privacyConfig,
                      fingerprintProtection: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-slate-200 cursor-pointer">
                <span>Block 3rd-Party Cookies</span>
                <input
                  type="checkbox"
                  checked={privacyConfig.blockThirdPartyCookies}
                  onChange={(e) =>
                    onUpdatePrivacyConfig({
                      ...privacyConfig,
                      blockThirdPartyCookies: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-slate-200 cursor-pointer">
                <span>Clear Cookies on Exit</span>
                <input
                  type="checkbox"
                  checked={privacyConfig.clearCookiesOnExit}
                  onChange={(e) =>
                    onUpdatePrivacyConfig({
                      ...privacyConfig,
                      clearCookiesOnExit: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fx-accent)' }}
                />
              </label>

              <button
                type="button"
                onClick={() => onOpenUrl('https://malware.testing.google.test')}
                className="text-[11px] text-slate-400 hover:text-white underline text-left"
              >
                Test Safe Browsing warning page
              </button>
            </div>

            {/* DNS over HTTPS (DoH) */}
            <div className="space-y-2 pb-4 border-b border-white/8">
              <label htmlFor="doh-select" className="block text-xs font-semibold text-slate-300">
                DNS over HTTPS (DoH)
              </label>
              <select
                id="doh-select"
                value={privacyConfig.dohProvider}
                onChange={(e) =>
                  onUpdatePrivacyConfig({
                    ...privacyConfig,
                    dohProvider: e.target.value as DohProviderId,
                  })
                }
                className="w-full h-8 px-2 rounded bg-black/30 border border-white/12 text-xs text-white"
              >
                {(Object.keys(DOH_PROVIDERS) as DohProviderId[]).map((id) => (
                  <option key={id} value={id}>
                    {DOH_PROVIDERS[id].label}
                  </option>
                ))}
              </select>

              {privacyConfig.dohProvider === 'custom' && (
                <input
                  type="url"
                  value={privacyConfig.customDohUrl}
                  onChange={(e) =>
                    onUpdatePrivacyConfig({ ...privacyConfig, customDohUrl: e.target.value })
                  }
                  placeholder="https://dns.example/dns-query"
                  aria-label="Custom DoH resolver URL"
                  className="w-full h-8 px-2.5 rounded bg-black/30 border border-white/12 text-xs font-mono-tabular text-white"
                />
              )}

              <button
                type="button"
                onClick={handleTestDoh}
                disabled={dohTesting}
                className="w-full py-1.5 rounded bg-white/8 hover:bg-white/14 text-xs font-medium text-white"
              >
                {dohTesting ? 'Resolving...' : 'Test Live DoH Lookup'}
              </button>
              {dohResult && (
                <div className="text-[11px] font-mono-tabular text-emerald-400 break-words">
                  {dohResult}
                </div>
              )}
            </div>

            {/* Private Browsing + Clear Data */}
            <div className="space-y-2.5 pb-4 border-b border-white/8">
              <button
                type="button"
                onClick={onNewPrivateTab}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 text-xs font-medium text-purple-200"
              >
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                Open Private Tab (No History/Cache)
              </button>

              <div className="text-xs font-semibold text-slate-400 pt-1">Clear Browsing Data</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleClearScope('cache')}
                  className="py-1.5 px-2 rounded bg-black/25 hover:bg-white/10 border border-white/8 text-[11px] text-slate-200"
                >
                  Clear Cache
                </button>
                <button
                  type="button"
                  onClick={() => handleClearScope('cookies')}
                  className="py-1.5 px-2 rounded bg-black/25 hover:bg-white/10 border border-white/8 text-[11px] text-slate-200"
                >
                  Clear Cookies
                </button>
                <button
                  type="button"
                  onClick={() => handleClearScope('history')}
                  className="py-1.5 px-2 rounded bg-black/25 hover:bg-white/10 border border-white/8 text-[11px] text-slate-200"
                >
                  Clear History
                </button>
                <button
                  type="button"
                  onClick={() => handleClearScope('storage')}
                  className="py-1.5 px-2 rounded bg-black/25 hover:bg-white/10 border border-white/8 text-[11px] text-slate-200"
                >
                  Clear Storage
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleClearScope('all')}
                className="w-full py-1.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-medium text-rose-200"
              >
                One-Click Clear All Data
              </button>
              {clearNotice && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {clearNotice}
                </div>
              )}
            </div>

            {/* Custom Tracker Rules */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-400">Tracker Filter Rules</h3>
              <form onSubmit={handleRuleSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  aria-label="Add domain to blocklist"
                  placeholder="Add domain (e.g. tracker.example)"
                  className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-black/30 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Add block rule"
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-white/10 hover:bg-white/16 text-white shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              <div className="divide-y divide-white/8 border border-white/8 rounded-lg bg-black/25 max-h-40 overflow-y-auto">
                {trackerRules.map((rule) => (
                  <div key={rule} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="font-mono-tabular text-slate-300 truncate">{rule}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveTrackerRule(rule)}
                      aria-label={`Remove block rule ${rule}`}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
