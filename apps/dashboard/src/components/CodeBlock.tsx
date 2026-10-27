import { CopyButton } from './CopyButton';

export function CodeBlock({ code, caption }: { code: string; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink bg-ink text-stone-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-stone-400">{caption ?? 'HTML'}</span>
        <CopyButton text={code} label="Copy snippet" />
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-6">
        <code className="whitespace-pre-wrap break-all">{code}</code>
      </pre>
    </div>
  );
}
