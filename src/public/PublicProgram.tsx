import { useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router';
import { Printer, Clock } from 'lucide-react';
import { BackLink } from './components/BackLink';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useStudents } from '../director/hooks/useStudents';
import { useSeatingCharts } from '../director/hooks/useSeatingCharts';
import { formatTimeRange, eventPieceDuration, eventPieceMovements, pieceEnsembleIds, ensembleDisplayName, buildSections } from '../director/utils';
import { Linkify } from '../director/components/Linkify';
import { fmtFullDate } from '../shared/dates';
import { printViaPopup } from '../shared/printPopup';
import type { Ensemble, RepertoirePiece, SeatingChart } from '../director/types';
import './programTemplate.css';

/**
 * Static cover-page boilerplate (#program-template): the school's leadership
 * list and mission statement don't change concert-to-concert, only the
 * concert-specific fields do (date, repertoire, ensembles, conductors,
 * order) — see the director's program template. Edit here if a title or the
 * wording ever changes.
 */
const LEADERSHIP = [
  { name: 'Jeffrey Hodgson', title: 'Provost' },
  { name: 'Daniel Andai', title: 'Dean of Music' },
  { name: 'Contessa Bryant', title: 'High School Principal' },
];
const MISSION_STATEMENT = 'New World School of the Arts was created by the Florida Legislature as a center of excellence in the performing and visual arts as an educational partnership of Miami-Dade County Public Schools, Miami Dade College and the University of Florida.';
const PARTNERS = 'Miami-Dade County Public Schools  ·  Miami Dade College  ·  University of Florida';

/** Ensembles on this concert, grouped by shared conductor (mirrors the
 *  template's cover page: one conductor's name over every ensemble they
 *  lead that night). Ensembles with no conductorName set get their own
 *  unlabeled group rather than being silently dropped. */
function groupByConductor(ensembleIds: string[], ensembles: Ensemble[]) {
  const groups: { conductorName?: string; ensembles: Ensemble[] }[] = [];
  for (const id of ensembleIds) {
    const ens = ensembles.find(e => e.id === id);
    if (!ens) continue;
    const name = ens.conductorName?.trim();
    const existing = name ? groups.find(g => g.conductorName === name) : undefined;
    if (existing) existing.ensembles.push(ens);
    else groups.push({ conductorName: name || undefined, ensembles: [ens] });
  }
  return groups;
}

/** "Hyunjee Chung" → "Hyunjee Chung, conductor" — but not if the director
 *  already typed a title/suffix like "Dr." or "conductor" themselves. */
function conductorByline(name: string): string {
  return /conductor/i.test(name) ? name : `${name}, conductor`;
}

export function PublicProgram() {
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { events, loading: eventsLoading } = useEvents();
  const { pieces } = useRepertoire();
  const { students } = useStudents();
  const { charts } = useSeatingCharts();

  const sheetRef = useRef<HTMLDivElement>(null);
  function handlePrint() {
    if (sheetRef.current) printViaPopup('NWSA Music — Program', sheetRef.current.outerHTML);
    else window.print();
  }

  const event = events.find(e => e.id === id);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);
  const studentName = (sid: string) => students.find(s => s.id === sid)?.name ?? '—';

  const programPieces = useMemo(() => {
    if (!event) return [];
    const ordered = (event.pieceIds ?? []).map(pid => piecesById[pid]).filter(Boolean) as RepertoirePiece[];
    const seen = new Set(ordered.map(p => p.id));
    const extra = pieces.filter(p => !seen.has(p.id) && (p.eventIds ?? []).includes(event.id));
    return [...ordered, ...extra];
  }, [event, piecesById, pieces]);

  // Repertoire grouped by the performing ensemble (#program-template): each
  // ensemble's block ends with its "Ensemble Name / conductor" byline, the
  // way a real program lists one act at a time. A piece that doesn't match
  // any of THIS concert's performing ensembles (rare — e.g. a combined
  // finale added without an ensembleIds link) still shows, just without a
  // byline, so nothing is silently dropped.
  const performingEnsembles = useMemo(
    () => (event?.ensembleIds ?? []).map(eid => ensembles.find(e => e.id === eid)).filter((e): e is Ensemble => !!e),
    [event, ensembles],
  );
  const groups = useMemo(
    () => performingEnsembles
      .map(ens => ({ ensemble: ens, pieces: programPieces.filter(p => pieceEnsembleIds(p).includes(ens.id)) }))
      .filter(g => g.pieces.length > 0),
    [performingEnsembles, programPieces],
  );
  const ungrouped = useMemo(() => {
    const grouped = new Set(groups.flatMap(g => g.pieces.map(p => p.id)));
    return programPieces.filter(p => !grouped.has(p.id));
  }, [groups, programPieces]);

  const conductorGroups = useMemo(
    () => groupByConductor(event?.ensembleIds ?? [], ensembles),
    [event, ensembles],
  );

  const totalRuntime = useMemo(
    () => (event ? programPieces.reduce((s, p) => s + eventPieceDuration(event, p), 0) : 0),
    [programPieces, event],
  );

  /** Roster sections for one performing ensemble: its most recently
   *  published seating chart (same "current chart" convention used
   *  everywhere else this app shows a roster order), or — absent any chart
   *  — the active roster auto-grouped by instrument. */
  function rosterSectionsFor(ensembleId: string): SeatingChart['sections'] {
    const chart = charts
      .filter(c => c.ensembleId === ensembleId)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt - a.createdAt)[0];
    if (chart) return chart.sections;
    const roster = students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(ensembleId));
    return buildSections(roster);
  }

  function renderPiece(p: RepertoirePiece) {
    const mvts = event ? eventPieceMovements(event, p) : [];
    const dur = event ? eventPieceDuration(event, p) : 0;
    return (
      <li key={p.id} className="pub-program-piece">
        <div className="pub-program-piece-main">
          <Link to={`/piece/${p.id}`} className="pub-program-piece-title">
            {p.fullTitle || p.title}
          </Link>
          {dur > 0 && <span className="pub-program-piece-dur"><Clock size={11} /> {dur}′</span>}
        </div>
        <div className="pub-program-piece-composer">
          {p.composer}
          {p.composerDates && <span className="pub-program-piece-dates"> ({p.composerDates})</span>}
          {p.arranger && <span> · arr. {p.arranger}</span>}
        </div>
        {mvts.length > 0 && (
          <ol className="pub-program-movements">
            {mvts.map((m, i) => (
              <li key={i}>
                {m.title}
                {m.duration ? <span className="pub-program-mvt-dur"> — {m.duration}′</span> : null}
              </li>
            ))}
          </ol>
        )}
      </li>
    );
  }

  if (!event) {
    return (
      <div className="pub-page">
        <BackLink fallback="/calendar" label="Back" />
        <div className="pub-card pub-muted">{eventsLoading ? 'Loading…' : 'Concert not found.'}</div>
      </div>
    );
  }

  return (
    <div className="pub-page pub-program">
      <div className="pub-program-toolbar">
        <BackLink fallback="/calendar" label="Back" />
        <button className="pub-print-btn" onClick={handlePrint}>
          <Printer size={14} /> Print
        </button>
      </div>

      <div className="pub-program-sheet" ref={sheetRef}>
        {/* ── Page 1: cover ──────────────────────────────────────────── */}
        <section className="pub-program-page pub-program-cover">
          <div className="pub-program-cover-col">
            <div className="pub-program-wordmark">
              <div className="pub-program-wordmark-main">New World School</div>
              <div className="pub-program-wordmark-main">of the Arts</div>
            </div>
            <ul className="pub-program-leadership">
              {LEADERSHIP.map(l => (
                <li key={l.name}>{l.name}, <em>{l.title}</em></li>
              ))}
            </ul>
            <hr className="pub-program-rule" />
            <p className="pub-program-mission">{MISSION_STATEMENT}</p>
            <div className="pub-program-partners">{PARTNERS}</div>
          </div>

          <div className="pub-program-cover-col pub-program-cover-right">
            <div className="pub-program-division">
              New World School of the Arts<br />Music Division
            </div>
            <h1 className="pub-program-title">{event.title || 'Concert'}</h1>
            <div className="pub-program-conductors">
              {conductorGroups.map((g, i) => (
                <div key={i} className="pub-program-conductor-group">
                  {g.conductorName && <div className="pub-program-conductor-name">{g.conductorName}</div>}
                  {g.ensembles.map(e => (
                    <div key={e.id} className="pub-program-conductor-ens">{ensembleDisplayName(e)}</div>
                  ))}
                </div>
              ))}
            </div>
            <div className="pub-program-when">
              {fmtFullDate(event.date)}
              {formatTimeRange(event.startTime, event.endTime) ? <><br />{formatTimeRange(event.startTime, event.endTime)}</> : ''}
            </div>
            {(event.location || event.venueAddress) && (
              <div className="pub-program-venue">
                {event.location && <div>{event.location}</div>}
                {event.venueAddress && <div>{event.venueAddress}</div>}
              </div>
            )}
          </div>
        </section>

        {/* ── Page 2+: program ──────────────────────────────────────── */}
        <section className="pub-program-page pub-program-repertoire">
          <h2 className="pub-program-page-title">Program</h2>
          {programPieces.length === 0 ? (
            <div className="pub-muted pub-program-empty">No pieces have been added to this program yet.</div>
          ) : (
            <>
              {ungrouped.length > 0 && (
                <ol className="pub-program-list">{ungrouped.map(renderPiece)}</ol>
              )}
              {groups.map(g => (
                <div key={g.ensemble.id} className="pub-program-group">
                  <ol className="pub-program-list">{g.pieces.map(renderPiece)}</ol>
                  <div className="pub-program-byline">
                    <div className="pub-program-byline-ensemble">{ensembleDisplayName(g.ensemble)}</div>
                    {g.ensemble.conductorName && (
                      <div className="pub-program-byline-conductor">{conductorByline(g.ensemble.conductorName)}</div>
                    )}
                  </div>
                </div>
              ))}

              {totalRuntime > 0 && (
                <div className="pub-program-runtime">
                  Approximate running time: {totalRuntime} minutes
                </div>
              )}

              {programPieces.some(p => p.programNotes) && (
                <div className="pub-program-notes-section">
                  <h2 className="pub-program-notes-head">Program Notes</h2>
                  {programPieces.filter(p => p.programNotes).map(p => (
                    <div key={p.id} className="pub-program-note">
                      <div className="pub-program-note-title">
                        {p.title}
                        {p.composer ? <span className="pub-program-note-by"> — {p.composer}</span> : ''}
                      </div>
                      <p className="pub-program-note-body"><Linkify text={p.programNotes!} /></p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Roster page(s): one per performing ensemble ───────────── */}
        {performingEnsembles.map(ens => {
          const sections = rosterSectionsFor(ens.id);
          if (sections.length === 0) return null;
          return (
            <section key={ens.id} className="pub-program-page pub-program-roster-page">
              <h2 className="pub-program-page-title">{ensembleDisplayName(ens)}</h2>
              <div className="pub-program-roster-cols">
                {sections.map((sec, i) => (
                  <div key={i} className="pub-program-roster-section">
                    <div className="pub-program-roster-section-name">{sec.section}</div>
                    {sec.seats.map(seat => (
                      <div key={seat.studentId} className="pub-program-roster-name">{studentName(seat.studentId)}</div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
