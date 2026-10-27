import { renderMarkdown } from '@debugbuddy/markdown';
import { useMemo } from 'react';

/** Safe: the shared renderer escapes all HTML before adding its own fixed set of tags. */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div className={`report-md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
