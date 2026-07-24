import './noteBurst.css';

/**
 * The visual half of the tap-the-logo easter egg (#easter-eggs) — a shower of
 * musical notes and a one-line cheer, armed by useLogoEgg.ts. Purely
 * decorative: pointer-events pass straight through, screen readers never hear
 * it, and with prefers-reduced-motion the notes stay home (only the cheer
 * shows, and it auto-dismisses).
 */

const NOTES = ['🎵', '🎶', '🎼', '♪', '♫', '🎻', '🎺', '♪'];

export function NoteBurst({ cheer }: { cheer: string | null }) {
  if (!cheer) return null;
  return (
    <div className="nwsa-noteburst" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="nwsa-noteburst-note"
          style={{
            left: `${(7 + i * 61) % 100}%`,
            animationDelay: `${(i % 7) * 90}ms`,
            fontSize: `${16 + ((i * 5) % 14)}px`,
          }}
        >
          {NOTES[i % NOTES.length]}
        </span>
      ))}
      <div className="nwsa-noteburst-phrase">{cheer}</div>
    </div>
  );
}
