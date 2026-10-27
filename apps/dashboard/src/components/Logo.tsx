import { BugIcon } from './Icons';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative grid h-8 w-8 place-items-center rounded-[9px] bg-ink text-white">
        <BugIcon className="h-[18px] w-[18px]" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent-bright ring-2 ring-canvas" />
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight text-ink">DebugBuddy</span>}
    </span>
  );
}
