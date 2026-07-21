interface Props {
  updatedAt?: number;
  updatedBy?: string;
}

/**
 * "Edited by NAME · relative time" (#roles) — director-side attribution for
 * who last changed a record. Renders nothing for a record that's never been
 * edited. Never shown on the public site.
 */
export function EditedByLine({ updatedAt, updatedBy }: Props) {
  if (!updatedAt) return null;
  return (
    <div className="dir-field-hint" style={{ marginTop: -2, marginBottom: 10 }}>
      Edited by {updatedBy || 'a director'} · {relativeTime(updatedAt)}
    </div>
  );
}

function relativeTime(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day !== 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
