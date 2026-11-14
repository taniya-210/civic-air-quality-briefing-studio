import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { ReliabilityStatus } from '../types/airQuality';

interface ReliabilityBannerProps {
  status: ReliabilityStatus;
  reasons: string[];
  compact?: boolean;
}

export function ReliabilityBanner({ status, reasons, compact = false }: ReliabilityBannerProps) {
  const config =
    status === 'reliable'
      ? {
          label: 'Verified Sufficient Data',
          bg: 'bg-emerald-50/70 border-emerald-200 text-emerald-950',
          iconClass: 'text-emerald-700',
          Icon: CheckCircle2,
        }
      : status === 'caution'
      ? {
          label: 'Caution: Partial or Mixed Quality',
          bg: 'bg-amber-50/80 border-amber-200 text-amber-950',
          iconClass: 'text-amber-700',
          Icon: AlertTriangle,
        }
      : {
          label: 'Insufficient or Unreliable Data',
          bg: 'bg-red-50/80 border-red-200 text-red-950',
          iconClass: 'text-red-700',
          Icon: ShieldAlert,
        };

  const { Icon, label, bg, iconClass } = config;

  return (
    <div className={`rounded-lg border px-4 ${compact ? 'py-3' : 'py-4'} ${bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-semibold">{label}</div>
          <ul className="text-xs leading-relaxed space-y-0.5 opacity-90">
            {reasons.map((reason, idx) => (
              <li key={idx}>• {reason}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
