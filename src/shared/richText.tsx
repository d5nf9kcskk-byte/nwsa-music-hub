import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { linkify } from '../director/components/Linkify';
import { parseRichText, type RichSegment } from './richTextParse';
import './richText.css';

/**
 * The ONE renderer for text a director typed with the formatting toolbar —
 * assignment descriptions, announcements, event notes, document blurbs.
 * Parsing (and the reasoning behind it) lives in `richTextParse.ts`; this
 * file only turns those blocks into elements.
 */

/**
 * A `[label](target)` link. In-app targets go through react-router so a tap
 * stays in the PWA shell (and picks up the org's basename); anything external
 * opens in a new tab. `href` was already vetted by safeHref() in the parser,
 * which is the only place a URL is allowed in from typed text.
 */
function linkTo(href: string, body: ReactNode): ReactNode {
  if (href.startsWith('/')) return <Link to={href} className="auto-link rt-link">{body}</Link>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="auto-link rt-link">
      {body}
    </a>
  );
}

function markUp(seg: RichSegment, key: number): ReactNode {
  // Inside a code span the text is literal — auto-linking it would defeat
  // the point of quoting it. A link's label is already a link, so it is not
  // scanned for a second one either.
  let node: ReactNode = seg.marks.includes('code') || seg.href ? seg.text : linkify(seg.text);
  if (seg.marks.includes('code')) node = <code className="rt-code">{node}</code>;
  if (seg.marks.includes('strike')) node = <s>{node}</s>;
  if (seg.marks.includes('underline')) node = <u>{node}</u>;
  if (seg.marks.includes('italic')) node = <em>{node}</em>;
  if (seg.marks.includes('bold')) node = <strong>{node}</strong>;
  if (seg.font) node = <span className={`rt-font-${seg.font}`}>{node}</span>;
  if (seg.href) node = linkTo(seg.href, node);
  return <span key={key}>{node}</span>;
}

/** Rendered rich text. `text` is whatever the director typed. */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`rt${className ? ` ${className}` : ''}`}>
      {parseRichText(text).map((block, i) => {
        if (block.kind === 'blank') return <div key={i} className="rt-blank" />;
        const inner = block.segments.map(markUp);
        if (block.kind === 'bullet' || block.kind === 'ol') {
          return (
            <div key={i} className="rt-item">
              <span
                className={`rt-marker${block.kind === 'ol' ? ' rt-marker-num' : ''}`}
                aria-hidden={block.kind === 'bullet' ? 'true' : undefined}
              >
                {block.kind === 'ol' ? `${block.marker}.` : '•'}
              </span>
              <span className="rt-item-body">{inner}</span>
            </div>
          );
        }
        return <div key={i} className={`rt-${block.kind}`}>{inner}</div>;
      })}
    </div>
  );
}
