import { useEffect, useState } from 'react';
import { Button } from './Button';
import { CheckIcon, CopyIcon } from './Icons';

export function CopyButton({ text, label = 'Copy', variant = 'secondary' }: { text: string; label?: string; variant?: 'primary' | 'secondary' }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt('Copy to clipboard:', text);
    }
  };

  return (
    <Button type="button" variant={variant} size="sm" onClick={copy} aria-live="polite">
      {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <CopyIcon className="h-4 w-4" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}
