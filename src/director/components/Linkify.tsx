import type { ReactNode } from 'react';

// Matches http(s) URLs and bare www. links inside free text.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
// Punctuation that usually ends a sentence, not the URL itself.
const TRAILING = /[.,;:!?)\]}]+$/;

/**
 * Turn any URLs inside plain text into clickable links that open in a new tab.
 * Used everywhere user-entered text is DISPLAYED (announcements, repertoire
 * notes, event notes, progress notes, …) so pasted links just work.
 */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    let url = m[1];
    const trail = url.match(TRAILING)?.[0] ?? '';
    if (trail) url = url.slice(0, -trail.length);
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = url.startsWith('www.') ? `https://${url}` : url;
    out.push(
      <a key={`${m.index}-${url}`} href={href} target="_blank" rel="noopener noreferrer" className="auto-link">
        {url}
      </a>,
    );
    if (trail) out.push(trail);
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

/** Component form: <Linkify text={someUserText} /> */
export function Linkify({ text }: { text: string }) {
  return <>{linkify(text)}</>;
}
