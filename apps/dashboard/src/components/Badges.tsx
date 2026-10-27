import type { SessionStatus } from '../lib/types';

export function StatusBadge({ status }: { status: SessionStatus }) {
  const done = status === 'completed';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        done ? 'bg-accent-soft text-accent-ink' : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-accent' : 'bg-amber-500'}`} />
      {done ? 'Report ready' : 'In progress'}
    </span>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-50 text-red-800 ring-red-200',
  high: 'bg-orange-50 text-orange-800 ring-orange-200',
  medium: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  low: 'bg-stone-100 text-stone-700 ring-stone-200',
};

export function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  if (!severity) return <span className="text-sm text-stone-400">—</span>;
  const style = SEVERITY_STYLES[severity.toLowerCase()] ?? 'bg-stone-100 text-stone-700 ring-stone-200';
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${style}`}>
      {severity}
    </span>
  );
}

export function ScoreMeter({ score, size = 'sm' }: { score: number | null | undefined; size?: 'sm' | 'lg' }) {
  if (score === null || score === undefined) return <span className="text-sm text-stone-400">—</span>;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = clamped >= 60 ? 'bg-accent' : clamped >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="inline-flex items-center gap-2" title={`Readiness ${clamped}/100`}>
      <span className={`relative overflow-hidden rounded-full bg-stone-200 ${size === 'lg' ? 'h-2 w-28' : 'h-1.5 w-12'}`}>
        <span className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${clamped}%` }} />
      </span>
      <span className={`font-mono tabular-nums text-ink-2 ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>{clamped}</span>
    </span>
  );
}
