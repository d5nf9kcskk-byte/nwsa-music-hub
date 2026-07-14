import './directorSearch.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Search, X, CalendarDays, Music, Megaphone, Users, ClipboardCheck,
  GraduationCap, Phone, MapPin,
} from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useContacts } from '../hooks/useContacts';
import { useEvents } from '../hooks/useEvents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useRepertoire } from '../hooks/useRepertoire';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { useEnsembles } from '../hooks/useEnsembles';
import { useAssignments } from '../hooks/useAssignments';
import { formatDate, formatTimeRange, todayStr, pieceEnsembleIds } from '../utils';
import type { CalendarEvent, Ensemble, RosterOverride, Student } from '../types';

/* ── Tiny fuzzy-search util (mirrors the public SearchOverlay) ──────────
 * Diacritic-stripped, case-insensitive matching: every whitespace-separated
 * query token must appear in the text. Word-start hits score higher than
 * mid-word substring hits; a hit at the very start scores highest.
 */
function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function scoreMatch(query: string, text?: string): number {
  if (!text) return 0;
  const t = normalizeText(text);
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const tok of tokens) {
    const idx = t.indexOf(tok);
    if (idx === -1) return 0;
    const wordStart = idx === 0 || /[^a-z0-9]/.test(t[idx - 1]);
    total += (wordStart ? 3 : 1) + (idx === 0 ? 1 : 0);
  }
  return total;
}

function rankMatches<T>(
  list: T[],
  query: string,
  fields: (item: T) => (string | undefined)[],
  max = 8,
  tieBreak?: (a: T, b: T) => number,
): T[] {
  const scored: { item: T; score: number }[] = [];
  for (const item of list) {
    let best = 0;
    fields(item).forEach((f, i) => {
      const s = scoreMatch(query, f) * (i === 0 ? 2 : 1);
      if (s > best) best = s;
    });
    if (best > 0) scored.push({ item, score: best });
  }
  scored.sort((a, b) => b.score - a.score || (tieBreak ? tieBreak(a.item, b.item) : 0));
  return scored.slice(0, max).map(s => s.item);
}

/* ── "Where are they now" helpers ─────────────────────────────────────── */

/** "14:00" → "2:00" (compact, no AM/PM — these are school hours). */
function fmtCompact(t?: string): string {
  if (!t) return '';
  const [hStr, m] = t.split(':');
  const h = Number(hStr) % 12 || 12;
  return `${h}:${m ?? '00'}`;
}

function compactRange(start?: string, end?: string): string {
  if (start && end) return `${fmtCompact(start)}–${fmtCompact(end)}`;
  return fmtCompact(start || end);
}

function eventName(e: CalendarEvent, ensembleMap: Record<string, Ensemble>): string {
  if (e.title) return e.title;
  const names = e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ');
  return names || e.type;
}

/**
 * Locate a student right now: an active lesson pull-out wins, then the
 * rehearsal/event in progress, then the next one today, then an upcoming
 * lesson, else "No rehearsal now".
 */
function whereNow(
  student: Student,
  todaysEvents: CalendarEvent[],
  todaysLessons: RosterOverride[],
  ensembleMap: Record<string, Ensemble>,
  nowHM: string,
): string {
  const lessons = todaysLessons.filter(
    o => o.studentId === student.id && o.startTime && o.endTime,
  );
  const activeLesson = lessons.find(o => o.startTime! <= nowHM && nowHM < o.endTime!);
  if (activeLesson) return `Lesson ${compactRange(activeLesson.startTime, activeLesson.endTime)}`;

  const mine = todaysEvents.filter(
    e => e.ensembleIds.some(id => (student.ensembleIds ?? []).includes(id)),
  );
  const current = mine.find(
    e => e.startTime && e.endTime && e.startTime <= nowHM && nowHM < e.endTime,
  );
  if (current) {
    return [
      `Now: ${eventName(current, ensembleMap)}`,
      compactRange(current.startTime, current.endTime),
      current.location,
    ].filter(Boolean).join(' · ');
  }

  const next = mine
    .filter(e => e.startTime && e.startTime > nowHM)
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!))[0];
  if (next) {
    return [
      `Next: ${eventName(next, ensembleMap)}`,
      compactRange(next.startTime, next.endTime),
      next.location,
    ].filter(Boolean).join(' · ');
  }

  const nextLesson = lessons
    .filter(o => o.startTime! > nowHM)
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!))[0];
  if (nextLesson) return `Lesson ${compactRange(nextLesson.startTime, nextLesson.endTime)}`;

  return 'No rehearsal now';
}

/* ── Overlay ─────────────────────────────────────────────────────────── */

interface ResultItem {
  key: string;
  label: string;
  sub?: string;
  /** Student-only: the "where are they now" line. */
  where?: string;
  /** Student-only: tap-to-call number from the auth-only contacts collection. */
  phone?: string;
  onSelect: () => void;
}

interface ResultGroup {
  label: string;
  Icon: typeof Search;
  items: ResultItem[];
}

interface DirectorSearchProps {
  /** Open a director tab (keeps the director inside the director app). */
  onNavigate?: import('../types-nav').DirNavigate;
  open: boolean;
  onClose: () => void;
  /** Open the director-side view for a student (roster profile, etc.). */
  onOpenStudent: (studentId: string) => void;
}

/**
 * Find Anything (#24), director side: everything the public overlay searches
 * PLUS students (name / preferred name / instrument), each with a live
 * "where are they now" line and tap-to-call. Mounted only while open so its
 * Firestore listeners are live only during a search.
 */
export function DirectorSearch({ open, onClose, onOpenStudent, onNavigate }: DirectorSearchProps) {
  if (!open) return null;
  return <DirectorSearchInner onClose={onClose} onOpenStudent={onOpenStudent} onNavigate={onNavigate} />;
}

function DirectorSearchInner({ onClose, onOpenStudent, onNavigate }: Omit<DirectorSearchProps, 'open'>) {
  const navigate = useNavigate();
  const { students } = useStudents();
  const { contacts } = useContacts();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const { pieces } = useRepertoire();
  const { announcements } = useAnnouncements();
  const { ensembles } = useEnsembles();
  const { assignments } = useAssignments();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const ensembleMap = useMemo(() => {
    const m: Record<string, Ensemble> = {};
    ensembles.forEach(e => { m[e.id] = e; });
    return m;
  }, [ensembles]);

  const today = todayStr();

  const todaysEvents = useMemo(
    () => events.filter(e => e.date === today && e.status !== 'Cancelled'),
    [events, today],
  );

  // Lesson pull-outs that apply today: date-range lessons covering today, or
  // event-scoped lessons attached to one of today's events.
  const todaysLessons = useMemo(() => {
    const todayEventIds = new Set(todaysEvents.map(e => e.id));
    return overrides.filter(o =>
      o.kind === 'lesson' && (
        (o.scope === 'range' && !!o.startDate && !!o.endDate
          && o.startDate <= today && today <= o.endDate)
        || (o.scope === 'event' && !!o.eventId && todayEventIds.has(o.eventId))
      ));
  }, [overrides, todaysEvents, today]);

  const q = query.trim();

  const groups = useMemo<ResultGroup[]>(() => {
    if (q.length < 2) return [];
    const now = new Date();
    const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const go = (to: string) => { navigate(to); onClose(); };
    // Results open the DIRECTOR tab when the app provides one — search must
    // not silently eject the director to the public site.
    const goTab: import('../types-nav').DirNavigate = (tab, opts) => {
      if (onNavigate) onNavigate(tab, opts);
      onClose();
    };
    const out: ResultGroup[] = [];

    // Students first — Active students ahead of Inactive/Graduated on ties.
    const studs = rankMatches(
      students, q, s => [s.name, s.preferredName, s.instrument], 8,
      (a, b) =>
        (a.status === 'Active' ? 0 : 1) - (b.status === 'Active' ? 0 : 1)
        || a.name.localeCompare(b.name),
    );
    if (studs.length) {
      out.push({
        label: 'Students', Icon: GraduationCap,
        items: studs.map(s => ({
          key: `stu-${s.id}`,
          label: s.preferredName ? `${s.name} “${s.preferredName}”` : s.name,
          sub: [s.instrument, s.status !== 'Active' ? s.status : undefined]
            .filter(Boolean).join(' · '),
          where: s.status === 'Active'
            ? whereNow(s, todaysEvents, todaysLessons, ensembleMap, nowHM)
            : undefined,
          phone: contacts[s.id]?.phone || undefined,
          onSelect: () => { onOpenStudent(s.id); onClose(); },
        })),
      });
    }

    // Events — upcoming first among equal scores.
    const evs = rankMatches(events, q, e => [e.title, e.type, e.location], 8, (a, b) => {
      const aUp = a.date >= today;
      const bUp = b.date >= today;
      if (aUp !== bUp) return aUp ? -1 : 1;
      return aUp ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    if (evs.length) {
      out.push({
        label: 'Events', Icon: CalendarDays,
        items: evs.map(e => ({
          key: `ev-${e.id}`,
          label: eventName(e, ensembleMap),
          sub: [
            formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' }),
            formatTimeRange(e.startTime, e.endTime),
            e.location,
          ].filter(Boolean).join(' · '),
          onSelect: () => onNavigate ? goTab('schedule', { date: e.date, eventId: e.id }) : go(`/event/${e.id}`),
        })),
      });
    }

    const reps = rankMatches(pieces, q, p => [p.title, p.composer, p.fullTitle]);
    if (reps.length) {
      out.push({
        label: 'Repertoire', Icon: Music,
        items: reps.map(p => ({
          key: `rep-${p.id}`,
          label: p.title,
          sub: [p.composer, pieceEnsembleIds(p).map(id => ensembleMap[id]?.name).filter(Boolean).join(', ')].filter(Boolean).join(' · '),
          onSelect: () => onNavigate ? goTab('repertoire', { ensembleId: pieceEnsembleIds(p)[0] }) : go(`/piece/${p.id}`),
        })),
      });
    }

    const anns = rankMatches(announcements, q, a => [a.title, a.titleEs]);
    if (anns.length) {
      out.push({
        label: 'Announcements', Icon: Megaphone,
        items: anns.map(a => ({
          key: `ann-${a.id}`,
          label: a.title,
          sub: a.ensembleId ? ensembleMap[a.ensembleId]?.name : 'School-wide',
          onSelect: () => onNavigate ? goTab('announcements') : go('/announcements'),
        })),
      });
    }

    const enss = rankMatches(ensembles, q, e => [e.name]);
    if (enss.length) {
      out.push({
        label: 'Ensembles', Icon: Users,
        items: enss.map(e => ({
          key: `ens-${e.id}`,
          label: e.name,
          sub: e.defaultLocation,
          onSelect: () => onNavigate ? goTab('ensembleHub', { ensembleId: e.id }) : go(`/ensemble/${e.id}`),
        })),
      });
    }

    const asgs = rankMatches(assignments, q, a => [a.title, a.type]);
    if (asgs.length) {
      out.push({
        label: 'Assignments', Icon: ClipboardCheck,
        items: asgs.map(a => ({
          key: `asg-${a.id}`,
          label: a.title,
          sub: [a.type, `Due ${formatDate(a.dueDate, { month: 'short', day: 'numeric' })}`].join(' · '),
          onSelect: () => onNavigate ? goTab('assignments') : go('/assignments'),
        })),
      });
    }

    return out;
  }, [
    q, students, contacts, events, pieces, announcements, ensembles, assignments,
    todaysEvents, todaysLessons, ensembleMap, today, navigate, onClose, onOpenStudent, onNavigate,
  ]);

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);

  useEffect(() => { setActive(0); }, [q]);

  // Keep the keyboard-highlighted row visible.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      const item = flat[active];
      if (item) {
        e.preventDefault();
        item.onSelect();
      }
    }
  }

  let idx = -1;
  return (
    <div className="dir-search-overlay" role="dialog" aria-modal="true" aria-label="Search" onClick={onClose}>
      <div className="dir-search-panel" onClick={e => e.stopPropagation()}>
        <div className="dir-search-inputrow">
          <Search size={17} className="dir-search-glyph" />
          <input
            className="dir-search-input"
            type="search"
            placeholder="Search students, events, music…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            autoFocus
            autoComplete="off" enterKeyHint="search"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search"
          />
          <button className="dir-search-close" onClick={onClose} aria-label="Close search">
            <X size={18} />
          </button>
        </div>

        <div className="dir-search-results" ref={listRef}>
          {q.length < 2 && (
            <div className="dir-search-hint">
              Find students, events, repertoire, announcements, ensembles, and assignments.
            </div>
          )}
          {q.length >= 2 && flat.length === 0 && (
            <div className="dir-search-empty">No matches for “{q}”.</div>
          )}
          {groups.map(g => (
            <div key={g.label} className="dir-search-group">
              <div className="dir-search-group-label">
                <g.Icon size={13} /> {g.label}
              </div>
              {g.items.map(item => {
                idx += 1;
                const isActive = idx === active;
                return (
                  <div
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    data-active={isActive || undefined}
                    className={`dir-search-item ${isActive ? 'active' : ''}`}
                    onClick={item.onSelect}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        item.onSelect();
                      }
                    }}
                  >
                    <div className="dir-search-item-main">
                      <span className="dir-search-item-label">{item.label}</span>
                      {item.sub && <span className="dir-search-item-sub">{item.sub}</span>}
                      {item.where && (
                        <span className="dir-search-item-where">
                          <MapPin size={12} /> {item.where}
                        </span>
                      )}
                    </div>
                    {item.phone && (
                      <a
                        className="dir-search-call"
                        href={`tel:${item.phone}`}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Call ${item.label}`}
                      >
                        <Phone size={16} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
