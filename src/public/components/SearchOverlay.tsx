import './searchOverlay.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Search, X, CalendarDays, Music, Megaphone, Users, ClipboardCheck,
} from 'lucide-react';
import { useEvents } from '../../director/hooks/useEvents';
import { useRepertoire } from '../../director/hooks/useRepertoire';
import { useAnnouncements } from '../../director/hooks/useAnnouncements';
import { useEnsembles } from '../../director/hooks/useEnsembles';
import { useAssignments } from '../../director/hooks/useAssignments';
import { formatDate, formatTimeRange, todayStr } from '../../director/utils';
import type { CalendarEvent, Ensemble } from '../../director/types';

/* ── Tiny fuzzy-search util ──────────────────────────────────────────────
 * Diacritic-stripped, case-insensitive matching: every whitespace-separated
 * query token must appear in the text. Tokens that land on a word start
 * score higher than mid-word substring hits, and a hit at the very start of
 * the text scores highest. Returns 0 for "no match".
 */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function scoreMatch(query: string, text?: string): number {
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

/** Rank a list by its best-scoring field (first field is weighted as the title). */
export function rankMatches<T>(
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

/* ── Overlay ─────────────────────────────────────────────────────────── */

interface ResultItem {
  key: string;
  label: string;
  sub?: string;
  to: string;
}

interface ResultGroup {
  label: string;
  Icon: typeof Search;
  items: ResultItem[];
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

function eventLabel(e: CalendarEvent, ensembleMap: Record<string, Ensemble>): string {
  if (e.title) return e.title;
  const names = e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ');
  return names ? `${e.type} — ${names}` : e.type;
}

/**
 * Find Anything (#4): full-screen public search across events, repertoire,
 * announcements, ensembles, and assignments. Mounted only while open, so the
 * Firestore listeners it needs are live only during a search.
 */
export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  if (!open) return null;
  return <SearchOverlayInner onClose={onClose} />;
}

function SearchOverlayInner({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { events } = useEvents();
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

  const q = query.trim();

  const groups = useMemo<ResultGroup[]>(() => {
    if (q.length < 2) return [];
    const today = todayStr();
    const out: ResultGroup[] = [];

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
          label: eventLabel(e, ensembleMap),
          sub: [
            formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' }),
            formatTimeRange(e.startTime, e.endTime),
            e.location,
          ].filter(Boolean).join(' · '),
          to: `/event/${e.id}`,
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
          sub: [p.composer, ensembleMap[p.ensembleId]?.name].filter(Boolean).join(' · '),
          to: `/piece/${p.id}`,
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
          to: '/announcements',
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
          to: `/ensemble/${e.id}`,
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
          to: '/assignments',
        })),
      });
    }

    return out;
  }, [q, events, pieces, announcements, ensembles, assignments, ensembleMap]);

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);

  useEffect(() => { setActive(0); }, [q]);

  // Keep the keyboard-highlighted row visible.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function select(item: ResultItem) {
    navigate(item.to);
    onClose();
  }

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
        select(item);
      }
    }
  }

  let idx = -1;
  return (
    <div className="pub-search-overlay" role="dialog" aria-modal="true" aria-label="Search" onClick={onClose}>
      <div className="pub-search-panel" onClick={e => e.stopPropagation()}>
        <div className="pub-search-inputrow">
          <Search size={17} className="pub-search-glyph" />
          <input
            className="pub-search-input"
            type="search"
            placeholder="Search events, music, announcements…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            autoFocus
            autoComplete="off" enterKeyHint="search"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search"
          />
          <button className="pub-search-close" onClick={onClose} aria-label="Close search">
            <X size={18} />
          </button>
        </div>

        <div className="pub-search-results" ref={listRef}>
          {q.length < 2 && (
            <div className="pub-search-hint">
              Find events, repertoire, announcements, ensembles, and assignments.
            </div>
          )}
          {q.length >= 2 && flat.length === 0 && (
            <div className="pub-search-empty">No matches for “{q}”.</div>
          )}
          {groups.map(g => (
            <div key={g.label} className="pub-search-group">
              <div className="pub-search-group-label">
                <g.Icon size={13} /> {g.label}
              </div>
              {g.items.map(item => {
                idx += 1;
                const isActive = idx === active;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-active={isActive || undefined}
                    className={`pub-search-item ${isActive ? 'active' : ''}`}
                    onClick={() => select(item)}
                  >
                    <span className="pub-search-item-label">{item.label}</span>
                    {item.sub && <span className="pub-search-item-sub">{item.sub}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
