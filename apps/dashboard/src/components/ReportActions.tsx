import { useEffect, useState, type ReactNode } from 'react';
import { downloadMarkdown } from '../lib/reportExport';
import { CheckIcon, CopyIcon, DownloadIcon, LinkIcon, PrintIcon } from './Icons';

function QuietButton({ onClick, children, label }: { onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-stone-500 transition hover:bg-stone-100 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
    >
      {children}
    </button>
  );
}

function useFlash(): [string | null, (key: string) => void] {
  const [flashed, setFlashed] = useState<string | null>(null);
  useEffect(() => {
    if (!flashed) return;
    const t = setTimeout(() => setFlashed(null), 1600);
    return () => clearTimeout(t);
  }, [flashed]);
  return [flashed, setFlashed];
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copy to clipboard:', text);
    return false;
  }
}

/** Copy / Download / Print / Copy link for a report. Print relies on #printable-report (see index.css). */
export function ReportActions({ markdown, createdAt }: { markdown: string; createdAt: string }) {
  const [flashed, flash] = useFlash();

  return (
    <div className="flex flex-wrap items-center gap-0.5 print:hidden" role="group" aria-label="Report actions">
      <QuietButton label="Copy the report as markdown" onClick={() => void copy(markdown).then((ok) => ok && flash('copy'))}>
        {flashed === 'copy' ? <CheckIcon className="h-4 w-4 text-accent" /> : <CopyIcon className="h-4 w-4" />}
        {flashed === 'copy' ? 'Copied' : 'Copy'}
      </QuietButton>
      <QuietButton label="Download as a .md file" onClick={() => downloadMarkdown(markdown, createdAt)}>
        <DownloadIcon className="h-4 w-4" />
        Download
      </QuietButton>
      <QuietButton label="Print the report" onClick={() => window.print()}>
        <PrintIcon className="h-4 w-4" />
        Print
      </QuietButton>
      <QuietButton label="Copy a link to this page" onClick={() => void copy(window.location.href).then((ok) => ok && flash('link'))}>
        {flashed === 'link' ? <CheckIcon className="h-4 w-4 text-accent" /> : <LinkIcon className="h-4 w-4" />}
        {flashed === 'link' ? 'Link copied' : 'Copy link'}
      </QuietButton>
    </div>
  );
}
