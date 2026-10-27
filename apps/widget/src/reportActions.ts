// Copy / download / print for a finished report. No libraries: Clipboard API
// with an execCommand fallback, Blob + object URL, and window.print().

const HOST_ID = 'debugbuddy-widget';
const PRINT_STYLE_ATTR = 'data-debugbuddy-print';

export async function copyText(text: string, scope: ShadowRoot): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    scope.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function downloadMarkdown(markdown: string, scope: ShadowRoot): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `debugbuddy-report-${localDate()}.md`;
  link.style.display = 'none';
  scope.appendChild(link); // Firefox wants the anchor in a document
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Print only `row`. The shadow stylesheet hides everything else inside the
 * widget; a temporary print-only style on the host page hides the page itself.
 * Both rules apply only to print media, so leaving them in place is harmless if
 * a browser never fires `afterprint`.
 */
export function printReport(root: HTMLElement, row: HTMLElement): void {
  document.querySelectorAll(`style[${PRINT_STYLE_ATTR}]`).forEach((s) => s.remove());
  root.querySelectorAll('.printing').forEach((n) => n.classList.remove('printing'));

  const hostStyle = document.createElement('style');
  hostStyle.setAttribute(PRINT_STYLE_ATTR, '');
  hostStyle.textContent = `@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body > :not(#${HOST_ID}) { display: none !important; }
  #${HOST_ID} { display: block !important; }
}`;
  document.head.appendChild(hostStyle);
  root.classList.add('print-mode');
  row.classList.add('printing');

  const cleanup = () => {
    hostStyle.remove();
    root.classList.remove('print-mode');
    row.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
