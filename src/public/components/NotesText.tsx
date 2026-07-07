import { linkify } from '../../director/components/Linkify';

/**
 * Minimal renderer for the director's markdown-ish text: **bold**, *italic*,
 * "- " bullets, line breaks, auto-linked URLs. Used wherever directors type
 * with the formatting toolbar so students never see raw asterisks.
 */
export function NotesText({ text }: { text: string }) {
  const richen = (line: string) =>
    line.split(/\*\*(.+?)\*\*/g).map((seg, j) =>
      j % 2 === 1
        ? <strong key={j}>{linkify(seg)}</strong>
        : (
          <span key={j}>
            {seg.split(/\*(.+?)\*/g).map((s2, k) =>
              k % 2 === 1 ? <em key={k}>{linkify(s2)}</em> : <span key={k}>{linkify(s2)}</span>
            )}
          </span>
        )
    );
  return (
    <>
      {text.split('\n').map((line, i) =>
        line.startsWith('- ')
          ? <div key={i} className="pub-note-bullet">• {richen(line.slice(2))}</div>
          : <div key={i}>{line ? richen(line) : ' '}</div>
      )}
    </>
  );
}
