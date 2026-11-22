import { Camera, Clipboard, Lock, MapPin, Mic, Bell, ShieldCheck, ShieldAlert, X } from 'lucide-react';
import {
  DEFAULT_SITE_PERMISSIONS,
  getOriginFromUrl,
  PermissionValue,
  SitePermissions,
} from '../lib/browserEngine';

interface SitePermissionsPopoverProps {
  open: boolean;
  currentUrl: string;
  httpsOnly: boolean;
  upgradedFromHttp?: boolean;
  permissions: SitePermissions;
  onChangePermission: (origin: string, key: keyof SitePermissions, val: PermissionValue) => void;
  onClose: () => void;
}

const PERMISSION_ROWS: Array<{
  key: keyof SitePermissions;
  label: string;
  Icon: typeof Camera;
}> = [
  { key: 'camera', label: 'Camera', Icon: Camera },
  { key: 'microphone', label: 'Microphone', Icon: Mic },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
  { key: 'location', label: 'Location', Icon: MapPin },
  { key: 'clipboard', label: 'Clipboard', Icon: Clipboard },
];

export function SitePermissionsPopover({
  open,
  currentUrl,
  httpsOnly,
  upgradedFromHttp,
  permissions,
  onChangePermission,
  onClose,
}: SitePermissionsPopoverProps) {
  if (!open) return null;

  const origin = getOriginFromUrl(currentUrl);
  const isInternal = currentUrl.startsWith('ferrox://');
  const isHttps = currentUrl.startsWith('https://');
  const effective = permissions ?? DEFAULT_SITE_PERMISSIONS;

  return (
    <div
      className="absolute left-0 top-10 z-40 w-80 rounded-xl bg-[#141824] border border-white/15 shadow-2xl p-4 space-y-3"
      role="dialog"
      aria-label="Site security and permissions"
    >
      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-white/10">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            {isInternal || isHttps ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            )}
            <span>
              {isInternal
                ? 'FerroX Internal Route'
                : isHttps
                ? 'Connection is Secure (HTTPS)'
                : 'Insecure HTTP Connection'}
            </span>
          </div>
          <div className="font-mono-tabular text-[11px] text-slate-400 truncate mt-0.5">
            {origin}
          </div>
          {upgradedFromHttp && (
            <div className="text-[11px] text-emerald-400 mt-1">
              Auto-upgraded from HTTP by HTTPS Enforcement
            </div>
          )}
          {!isInternal && !isHttps && !httpsOnly && (
            <div className="text-[11px] text-amber-300 mt-1">
              Traffic to this site is unencrypted. Enable HTTPS-Only in Privacy.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close site permissions"
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>Site Permissions</span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Lock className="w-3 h-3" aria-hidden="true" />
            Sandboxed
          </span>
        </div>

        <div className="space-y-1.5">
          {PERMISSION_ROWS.map(({ key, label, Icon }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 py-1 text-xs"
            >
              <span className="flex items-center gap-2 text-slate-200">
                <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {label}
              </span>
              <select
                aria-label={`${label} permission for ${origin}`}
                value={effective[key]}
                onChange={(e) =>
                  onChangePermission(origin, key, e.target.value as PermissionValue)
                }
                className="h-7 px-2 rounded bg-[#0B0D12] border border-white/12 text-[11px] text-slate-200 focus:outline-none focus:border-white/30"
              >
                <option value="ask">Ask</option>
                <option value="allow">Allow</option>
                <option value="block">Block</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
