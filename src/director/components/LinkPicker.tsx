import './directorSearch.css';
import { useMemo, useState } from 'react';
import {
  Search, X, CalendarDays, Users, FileText, ClipboardCheck, ClipboardSignature,
  Music, Filter, Link2, Globe, ScanLine, ChevronLeft, Plus,
} from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useDocuments } from '../hooks/useDocuments';
import { useSignupForms } from '../hooks/useSignups';
import { useAssignments } from '../hooks/useAssignments';
import { useRepertoire } from '../hooks/useRepertoire';
import { useModalA11y } from '../../shared/useModalA11y';
import { rankMatches } from '../../shared/fuzzy';
import { safeHref } from '../../shared/richTextParse';
import { formatDate, todayStr, groupKindLabel, isClassGroup, checkinCandidateEvents } from '../utils';
import { enableCheckinPatch } from '../../shared/concertCheckin';
import type { CalendarEvent, Ensemble } from '../types';

interface Props {
  /** Called with the label and URL to insert. Closing is the caller's job. */
  onPick: (label: string, url: string) => void;
  onClose: () => void;
}

interface Option {
  key: string;
  group: string;
  label: string;
  sub?: string;
  url: string;
  /** Events only — used to prefer what is coming up over what is done. */
  date?: string;
}

/** Sentinel url for the "Concert check-in" row: picking it opens the second
 *  step (every concert, station on or off) instead of inserting a link
 *  directly — see the picker's `view` state below. */
const CHECKIN_PICKER = '#checkin-picker';

/** Standing pages worth linking to. Everything else is looked up by name. */
const PAGES: { label: string; url: string; sub: string }[] = [
  { label: 'Calendar', url: '/calendar', sub: 'The whole schedule' },
  { label: 'Concerts', url: '/concerts', sub: 'The season page' },
  { label: 'Documents', url: '/documents', sub: 'Handouts and forms' },
  { label: 'Sign-ups', url: '/signups', sub: 'Open sign-up forms' },
  { label: 'Announcements', url: '/announcements', sub: 'Every post' },
  { label: 'Assignments', url: '/assignments', sub: 'What is assigned' },
  { label: 'Ensembles', url: '/ensembles', sub: 'Every performing group' },
  { label: 'Repertoire', url: '/repertoire', sub: 'What everyone is playing' },
  { label: 'Getting started', url: '/start', sub: 'How to use the Hub' },
];

/** Mirrors TypeKey in PublicCalendar — these are the ?type= values it reads. */
const FILTER_TYPES = ['Rehearsal', 'Class', 'Concert', 'Event', 'Assignment'] as const;

const GROUP_ICON: Record<string, typeof CalendarDays> = {
  Events: CalendarDays,
  'Ensembles & classes': Users,
  Documents: FileText,
  'Sign-ups': ClipboardSignature,
  Assignments: ClipboardCheck,
  Repertoire: Music,
  'Concert check-in': ScanLine,
  Pages: Globe,
};

function eventLabel(e: CalendarEvent, ensembleMap: Record<string, Ensemble>): string {
  if (e.title) return e.title;
  const names = e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ');
  return names ? `${names} ${e.type}` : e.type;
}

/**
 * Pick something in the Hub to link to — a concert, a rehearsal, a class, a
 * document, a sign-up — or build a filtered calendar view, or paste any
 * address. Feeds the formatting toolbar's link button and the announcement
 * form's related-links row.
 *
 * Every hook here mounts only while the picker is OPEN. Subscribing the whole
 * app's collections behind each of a dozen text fields would multiply
 * Firestore listeners for a feature most edits never touch.
 */
export function LinkPicker({ onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [pasted, setPasted] = useState('');
  const [pastedLabel, setPastedLabel] = useState('');
  const [filterEns, setFilterEns] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  // 'checkin' is the second step (#concert-checkin): every concert you could
  // link a check-in for, station on or off, rather than one row per concert
  // crowding the main list — the crowding is exactly why the option went
  // missing on a phone (an empty query shows only the standing pages plus
  // the next six upcoming items across every event type, so a check-in
  // entry weeks out never made the cut).
  const [view, setView] = useState<'main' | 'checkin'>('main');
  const [checkinQ, setCheckinQ] = useState('');
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const { events, updateEvent } = useEvents();
  const { ensembles } = useEnsembles();
  const { documents } = useDocuments();
  const { forms } = useSignupForms();
  const { assignments } = useAssignments();
  const { pieces } = useRepertoire();

  const today = todayStr();
  const ensembleMap = useMemo(
    () => Object.fromEntries(ensembles.map(e => [e.id, e])) as Record<string, Ensemble>,
    [ensembles],
  );

  const options = useMemo<Option[]>(() => {
    const out: Option[] = [];
    for (const e of events) {
      out.push({
        key: `ev-${e.id}`,
        group: 'Events',
        label: eventLabel(e, ensembleMap),
        sub: [formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' }), e.type, e.location]
          .filter(Boolean).join(' · '),
        url: `/event/${e.id}`,
        date: e.date,
      });
    }
    // A single row (#concert-checkin), not one per concert: a per-concert
    // entry here competed with everything else for the top-6-upcoming slots
    // shown on an empty query and was routinely crowded out — see the `view`
    // state above. Picking this opens the dedicated concert list instead.
    out.push({
      key: 'checkin-picker', group: 'Concert check-in', label: 'Concert check-in',
      sub: 'Pick a concert to link its check-in', url: CHECKIN_PICKER,
    });
    for (const e of ensembles) {
      out.push({
        key: `ens-${e.id}`,
        group: 'Ensembles & classes',
        label: e.name,
        sub: groupKindLabel(e),
        url: `/ensemble/${e.id}`,
      });
    }
    for (const d of documents) {
      // A document has no page of its own — the link goes to the file (or the
      // external address the director pointed it at). safeHref() vets it: an
      // uploaded file's download URL is https, but `url` is free text.
      const target = d.url || d.file?.url;
      const href = target ? safeHref(target) : undefined;
      if (!href) continue;
      out.push({ key: `doc-${d.id}`, group: 'Documents', label: d.title, sub: d.category, url: href });
    }
    for (const f of forms) {
      out.push({ key: `su-${f.id}`, group: 'Sign-ups', label: f.title, url: `/signup/${f.id}` });
    }
    for (const a of assignments) {
      out.push({
        key: `asg-${a.id}`,
        group: 'Assignments',
        label: a.title,
        sub: [a.type, `Due ${formatDate(a.dueDate, { month: 'short', day: 'numeric' })}`].join(' · '),
        url: `/assignments/${a.id}`,
      });
    }
    for (const p of pieces) {
      out.push({ key: `pc-${p.id}`, group: 'Repertoire', label: p.title, sub: p.composer, url: `/piece/${p.id}` });
    }
    for (const p of PAGES) {
      out.push({ key: `pg-${p.url}`, group: 'Pages', label: p.label, sub: p.sub, url: p.url });
    }
    return out;
  }, [events, ensembles, documents, forms, assignments, pieces, ensembleMap]);

  const shown = useMemo(() => {
    if (!q.trim()) {
      // Nothing typed: the standing pages, plus what is actually coming up.
      // useEvents() returns the WHOLE year oldest-first, so this has to filter
      // by date — slicing the raw list offers last September's rehearsals.
      // Concert check-in is a standing entry (like a page), not a dated one —
      // it has to be in this always-shown set too, or a concert far enough
      // out loses to six nearer rehearsals for the "upcoming" slots and the
      // row is invisible on an empty query, which was the actual bug.
      const upcoming = options.filter(o => o.date && o.date >= today).slice(0, 6);
      return [...options.filter(o => o.group === 'Pages' || o.group === 'Concert check-in'), ...upcoming];
    }
    // Among equal scores an upcoming event beats one already past, and the
    // sooner of two upcoming ones wins.
    return rankMatches(options, q, o => [o.label, o.sub, o.group], 30, (a, b) => {
      if (!a.date || !b.date) return 0;
      const aUp = a.date >= today;
      if (aUp !== (b.date >= today)) return aUp ? -1 : 1;
      return aUp ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
  }, [q, options, today]);

  const grouped = useMemo(() => {
    const map = new Map<string, Option[]>();
    for (const o of shown) {
      const list = map.get(o.group) ?? [];
      list.push(o);
      map.set(o.group, list);
    }
    return [...map.entries()];
  }, [shown]);

  /** The filter row's live URL — the same shape PublicCalendar reads back. */
  const filterUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (filterEns.length) params.set('ensemble', filterEns.join(','));
    if (filterTypes.length) params.set('type', filterTypes.join(','));
    const qs = params.toString();
    return qs ? `/calendar?${qs}` : '/calendar';
  }, [filterEns, filterTypes]);

  const filterLabel = useMemo(() => {
    const names = filterEns.map(id => ensembleMap[id]?.name).filter(Boolean);
    const kinds = filterTypes.map(t => `${t}s`);
    if (!names.length && !kinds.length) return 'the calendar';
    return [names.join(' + '), kinds.join(' + ')].filter(Boolean).join(' — ');
  }, [filterEns, filterTypes, ensembleMap]);

  const pastedHref = safeHref(pasted);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  // Step 2 (#concert-checkin): every concert you could link a check-in for,
  // station on or off — the on/off gate is exactly what made this invisible
  // while planning a concert whose station nobody has switched on yet.
  const checkinSorted = useMemo(() => {
    const eligible = checkinCandidateEvents(events, ensembles);
    const upcoming = eligible.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const past = eligible.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
    return [...upcoming, ...past];
  }, [events, ensembles, today]);

  const checkinShown = useMemo(() => {
    const query = checkinQ.trim().toLowerCase();
    if (!query) return checkinSorted;
    return checkinSorted.filter(e => eventLabel(e, ensembleMap).toLowerCase().includes(query));
  }, [checkinSorted, checkinQ, ensembleMap]);

  async function turnOnStation(e: CalendarEvent) {
    await updateEvent(e.id, enableCheckinPatch(e));
  }

  return (
    <div className="dir-search-overlay" role="dialog" aria-modal="true" aria-label="Insert link" onClick={onClose}>
      <div className="dir-linkpick" ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="dir-linkpick-head">
          {view === 'checkin' && (
            <button type="button" className="dir-linkpick-back" onClick={() => setView('main')} aria-label="Back">
              <ChevronLeft size={18} />
            </button>
          )}
          <Search size={15} className="dir-linkpick-search-icon" />
          <input
            className="dir-linkpick-input"
            autoFocus
            value={view === 'checkin' ? checkinQ : q}
            onChange={e => (view === 'checkin' ? setCheckinQ : setQ)(e.target.value)}
            placeholder={view === 'checkin' ? 'Find a concert…' : 'Find a concert, class, document, sign-up…'}
            aria-label={view === 'checkin' ? 'Search concerts for a check-in link' : 'Search for something to link to'}
          />
          <button className="dir-linkpick-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>

        {view === 'checkin' ? (
          <div className="dir-linkpick-list">
            {checkinShown.length === 0 && (
              <div className="dir-linkpick-empty">
                {checkinQ.trim() ? `Nothing matches “${checkinQ}”.` : 'No concerts on the calendar yet.'}
              </div>
            )}
            {checkinShown.map(e => (
              <div key={e.id} className="dir-linkpick-checkin-row">
                <button
                  type="button"
                  className="dir-linkpick-row"
                  onClick={() => onPick(`Check in — ${eventLabel(e, ensembleMap)}`, `/checkin/${e.id}`)}
                >
                  <span className="dir-linkpick-row-label">{eventLabel(e, ensembleMap)}</span>
                  <span className="dir-linkpick-row-sub">
                    {[
                      formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' }),
                      e.concertAttendance === 'required' ? 'Required'
                        : e.concertAttendance === 'optional' ? 'Optional' : '',
                      e.checkin?.enabled ? 'Station on' : 'Station off',
                    ].filter(Boolean).join(' · ')}
                  </span>
                </button>
                {!e.checkin?.enabled && (
                  <button
                    type="button"
                    className="dir-linkpick-turnon"
                    title="Switch the check-in station on for this concert"
                    onClick={() => void turnOnStation(e)}
                  >
                    <Plus size={12} /> Turn on
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="dir-linkpick-list">
              {grouped.map(([group, items]) => {
                const Icon = GROUP_ICON[group] ?? Link2;
                return (
                  <div key={group}>
                    <div className="dir-linkpick-group"><Icon size={12} /> {group}</div>
                    {items.map(o => (
                      <button
                        key={o.key}
                        type="button"
                        className="dir-linkpick-row"
                        onClick={() => (o.url === CHECKIN_PICKER ? setView('checkin') : onPick(o.label, o.url))}
                      >
                        <span className="dir-linkpick-row-label">{o.label}</span>
                        {o.sub && <span className="dir-linkpick-row-sub">{o.sub}</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
              {q.trim() && grouped.length === 0 && (
                <div className="dir-linkpick-empty">Nothing matches “{q}”.</div>
              )}
            </div>

            {/* ── A filtered calendar: the "everything about X" link ── */}
            <details className="dir-linkpick-fold">
              <summary><Filter size={12} /> Link to a filtered calendar</summary>
              <div className="dir-linkpick-chips">
                {ensembles.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    className={`dir-linkpick-chip${filterEns.includes(e.id) ? ' on' : ''}`}
                    onClick={() => toggle(filterEns, setFilterEns, e.id)}
                  >
                    {e.name}{isClassGroup(e) ? ' (class)' : ''}
                  </button>
                ))}
              </div>
              <div className="dir-linkpick-chips">
                {FILTER_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`dir-linkpick-chip${filterTypes.includes(t) ? ' on' : ''}`}
                    onClick={() => toggle(filterTypes, setFilterTypes, t)}
                  >
                    {t}s
                  </button>
                ))}
              </div>
              <div className="dir-linkpick-preview">{filterUrl}</div>
              <button type="button" className="dir-btn dir-btn-primary" onClick={() => onPick(filterLabel, filterUrl)}>
                Insert this view
              </button>
            </details>

            {/* ── Anything else on the web ── */}
            <details className="dir-linkpick-fold">
              <summary><Link2 size={12} /> Paste a link</summary>
              <input
                className="dir-input"
                value={pastedLabel}
                onChange={e => setPastedLabel(e.target.value)}
                placeholder="What to call it (optional)"
              />
              <input
                className="dir-input"
                style={{ marginTop: 6 }}
                value={pasted}
                onChange={e => setPasted(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                spellCheck={false}
              />
              {pasted.trim() && !pastedHref && (
                <div className="dir-linkpick-warn">
                  That is not an address the Hub will link to. Use one starting with https://, http://, or mailto:.
                </div>
              )}
              <button
                type="button"
                className="dir-btn dir-btn-primary"
                style={{ marginTop: 8 }}
                disabled={!pastedHref}
                onClick={() => pastedHref && onPick(pastedLabel.trim() || pastedHref, pastedHref)}
              >
                Insert link
              </button>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
