/** The ONE spelling of a piece's soloist line: "Name, instrument · Name, instrument".
 *  `soloists` wins when present; otherwise the legacy pair. Never both. */
type HasSoloists = {
  soloists?: { name: string; instrument: string }[];
  soloistName?: string;
  soloistInstrument?: string;
};

const one = (name?: string, instrument?: string) =>
  [name?.trim(), instrument?.trim()].filter(Boolean).join(', ');

export function soloistLine(p: HasSoloists): string {
  if (p.soloists?.length) return p.soloists.map(s => one(s.name, s.instrument)).filter(Boolean).join(' · ');
  return one(p.soloistName, p.soloistInstrument);
}
