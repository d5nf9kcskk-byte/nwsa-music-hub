import './readAloud.css';
import { useEffect, useMemo, useState } from 'react';
import {
  Megaphone, Link2, X, Plus, Copy, Check, Trash2, Users, AlertTriangle, HelpCircle,
} from 'lucide-react';
import { useAnnouncements, useMinuteTick } from '../hooks/useAnnouncements';
import { useReadAloudItems } from '../hooks/useReadAloudItems';
import { useEnsembles } from '../hooks/useEnsembles';
import { shouldProposeWrites } from '../hooks/usePendingActions';
import { LazyLinkPicker } from '../components/LinkPickerLazy';
import { performingEnsembles, todayStr, formatDate } from '../utils';
import {
  boardFor, questionLinks, speakableLines, boardAsText, defaultPointExpiry,
  MAX_POINT_TITLE, MAX_POINT_BODY, MAX_POINT_LINKS,
} from '../readAloudBoard';
import type { AnnouncementLink } from '../types';

/**
 * The Read-Aloud board (#read-aloud): what a Student Assistant says to their
 * ensemble, top to bottom. Rules for what lands here live in `../readAloudBoard.ts`.
 *
 * `allowedEnsembleIds` is the assistant's assigned list; a director passes
 * nothing and picks from every performing ensemble.
 */

const PICK_KEY = 'dir.readAloud.ensemble';
const SAID_KEY = 'dir.readAloud.said';

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode: fine */ }
}

/** Full public address, for showing and for pasting into a chat. */
function absoluteUrl(url: string): string {
  if (!url.startsWith('/')) return url;
  return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${url}`;
}

function hrefFor(url: string): string {
  return url.startsWith('/') ? `${import.meta.env.BASE_URL.replace(/\/$/, '')}${url}` : url;
}

/** What someone sees printed under a link: the short address, readable aloud. */
function shortAddress(url: string): string {
  return absoluteUrl(url).replace(/^https?:\/\//, '');
}

function LinkChips({ links }: { links: readonly AnnouncementLink[] }) {
  if (!links.length) return null;
  return (
    <ul className="dir-ra-links">
      {links.map((l, i) => (
        <li key={`${l.url}-${i}`}>
          <a href={hrefFor(l.url)} target="_blank" rel="noopener noreferrer" className="dir-ra-link">
            <Link2 size={13} /> {l.label}
          </a>
          <span className="dir-ra-addr">{shortAddress(l.url)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReadAloudView({ allowedEnsembleIds }: { allowedEnsembleIds?: string[] }) {
  const { announcements } = useAnnouncements();
  const { items, addItem, deleteItem } = useReadAloudItems();
  const { ensembles } = useEnsembles();
  const now = useMinuteTick();
  const today = todayStr();
  const proposing = shouldProposeWrites();

  const choices = useMemo(() => {
    const groups = allowedEnsembleIds
      ? ensembles.filter(e => allowedEnsembleIds.includes(e.id))
      : performingEnsembles(ensembles);
    return [...groups].sort((a, b) => a.name.localeCompare(b.name));
  }, [ensembles, allowedEnsembleIds]);

  const [picked, setPicked] = useState<string>(() => readLocal(PICK_KEY) ?? '');
  const current = choices.find(e => e.id === picked) ?? choices[0];
  useEffect(() => { if (current) writeLocal(PICK_KEY, current.id); }, [current]);

  // "Said it" ticks are per device, per group, per day — a scratch pad for
  // the person standing up front, never shared and never a record.
  const saidKey = current ? `${SAID_KEY}.${today}.${current.id}` : '';
  // Read straight from storage each render; `bump` re-renders after a tick.
  const [, setBump] = useState(0);
  let said: string[] = [];
  try { said = saidKey ? JSON.parse(readLocal(saidKey) ?? '[]') : []; } catch { said = []; }
  function toggleSaid(key: string) {
    const next = said.includes(key) ? said.filter(k => k !== key) : [...said, key];
    writeLocal(saidKey, JSON.stringify(next));
    setBump(n => n + 1);
  }

  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  if (choices.length === 0) {
    return (
      <div className="dir-empty">
        <Megaphone size={32} />
        <h3>No ensembles yet</h3>
        <p>Once a director assigns you an ensemble, its announcements show up here to read out.</p>
      </div>
    );
  }
  if (!current) return null;

  const entries = boardFor(current.id, announcements, items, today, now);
  const questions = questionLinks(current.id, current.name);
  const left = entries.filter(e => !said.includes(e.key)).length;

  async function copyAll() {
    const text = boardAsText(current!.name, entries, questions, absoluteUrl);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  return (
    <div className="dir-ra">
      {choices.length > 1 && (
        <div className="dir-ra-pick no-print" role="group" aria-label="Announcing to">
          {choices.map(e => (
            <button
              key={e.id}
              type="button"
              className={`dir-segment-btn ${e.id === current.id ? 'active' : ''}`}
              onClick={() => setPicked(e.id)}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      <header className="dir-ra-head">
        <div>
          <div className="dir-ra-kicker">Announcing to</div>
          <h2 className="dir-ra-group">{current.name}</h2>
          <div className="dir-ra-date">
            {formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}
            {entries.length > 0 && ` · ${left === 0 ? 'all said' : `${left} of ${entries.length} to say`}`}
          </div>
        </div>
        <div className="dir-ra-tools no-print">
          <button type="button" className="dir-tool-btn" onClick={() => void copyAll()} disabled={entries.length === 0}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy as text'}
          </button>
          <button type="button" className="dir-tool-btn" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add a point
          </button>
        </div>
      </header>

      {adding && (
        <AddPointForm
          choices={choices}
          defaultEnsembleId={current.id}
          proposing={proposing}
          today={today}
          onCancel={() => setAdding(false)}
          onSave={async data => { await addItem(data); setAdding(false); }}
        />
      )}

      {entries.length === 0 ? (
        <div className="dir-empty">
          <Megaphone size={32} />
          <h3>Nothing to announce today</h3>
          <p>New posts for {current.name} or for everyone in music show up here on their own.</p>
        </div>
      ) : (
        <ol className="dir-ra-list">
          {entries.map((e, i) => {
            const done = said.includes(e.key);
            const lines = speakableLines(e.body);
            return (
              <li key={e.key} className={`dir-ra-card ${e.priority} ${done ? 'said' : ''}`}>
                <div className="dir-ra-num" aria-hidden>{i + 1}</div>
                <div className="dir-ra-main">
                  <div className="dir-ra-tags">
                    {e.priority === 'urgent' && <span className="dir-ra-tag urgent"><AlertTriangle size={12} /> Urgent</span>}
                    {e.priority === 'important' && <span className="dir-ra-tag important">Important</span>}
                    <span className="dir-ra-tag"><Users size={12} /> {e.everyone ? 'Everyone in music' : current.name}</span>
                  </div>
                  <h3 className="dir-ra-title">{e.title}</h3>
                  {lines.length > 0 && (
                    <ul className="dir-ra-lines">
                      {lines.map((l, j) => <li key={j}>{l}</li>)}
                    </ul>
                  )}
                  <LinkChips links={e.links} />
                  <div className="dir-ra-foot no-print">
                    <button
                      type="button"
                      className={`dir-tool-btn dir-ra-said ${done ? 'on' : ''}`}
                      onClick={() => toggleSaid(e.key)}
                      aria-pressed={done}
                    >
                      <Check size={15} /> {done ? 'Said' : 'Mark said'}
                    </button>
                    {e.source === 'point' && !proposing && (
                      <button
                        type="button"
                        className="dir-tool-btn"
                        onClick={() => { if (window.confirm(`Take “${e.title}” off the board for everyone?`)) void deleteItem(e.id); }}
                      >
                        <Trash2 size={15} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="dir-ra-questions">
        <h3><HelpCircle size={16} /> Questions? Point them to</h3>
        <LinkChips links={questions} />
      </section>
    </div>
  );
}

function AddPointForm({
  choices, defaultEnsembleId, proposing, today, onCancel, onSave,
}: {
  choices: { id: string; name: string }[];
  defaultEnsembleId: string;
  proposing: boolean;
  today: string;
  onCancel: () => void;
  onSave: (data: {
    ensembleIds: string[]; title: string; body?: string;
    links?: AnnouncementLink[]; expiresOn?: string; createdAt: number;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(false);
  const [ids, setIds] = useState<string[]>([defaultEnsembleId]);
  const [expiresOn, setExpiresOn] = useState(defaultPointExpiry(today));
  const [links, setLinks] = useState<AnnouncementLink[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ready = title.trim() && (everyone || ids.length > 0) && !saving;

  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave({
        ensembleIds: everyone ? [] : ids,
        title: title.trim().slice(0, MAX_POINT_TITLE),
        body: body.trim().slice(0, MAX_POINT_BODY) || undefined,
        links: links.length ? links : undefined,
        expiresOn: expiresOn || undefined,
        createdAt: Date.now(),
      });
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not save, try again.');
    }
  }

  return (
    <div className="dir-ra-form">
      {picking && (
        <LazyLinkPicker
          onClose={() => setPicking(false)}
          onPick={(label, url) => {
            setPicking(false);
            setLinks(ls => (ls.some(l => l.url === url) ? ls : [...ls, { label, url }]));
          }}
        />
      )}
      <div className="dir-field">
        <label className="dir-label" htmlFor="ra-title">What to say *</label>
        <input
          id="ra-title" className="dir-input" value={title} maxLength={MAX_POINT_TITLE}
          onChange={e => setTitle(e.target.value)} placeholder="e.g. Folders back in the cabinet after rehearsal"
        />
      </div>
      <div className="dir-field">
        <label className="dir-label" htmlFor="ra-body">Details</label>
        <textarea
          id="ra-body" className="dir-input" rows={3} value={body} maxLength={MAX_POINT_BODY}
          onChange={e => setBody(e.target.value)} placeholder="One point per line. Keep it short enough to say out loud."
        />
      </div>
      <div className="dir-field">
        <span className="dir-label">Read to</span>
        <label className="dir-ra-check">
          <input type="checkbox" checked={everyone} onChange={e => setEveryone(e.target.checked)} /> Everyone in music
        </label>
        {!everyone && choices.map(c => (
          <label key={c.id} className="dir-ra-check">
            <input
              type="checkbox" checked={ids.includes(c.id)}
              onChange={e => setIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))}
            /> {c.name}
          </label>
        ))}
      </div>
      <div className="dir-field">
        <span className="dir-label">Links</span>
        {links.length > 0 && (
          <div className="dir-ann-linkrow">
            {links.map((l, i) => (
              <span key={`${l.url}-${i}`} className="dir-ann-linkchip">
                <Link2 size={12} />
                <span className="dir-ann-linkchip-label">{l.label}</span>
                <button type="button" onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))} aria-label={`Remove ${l.label}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          type="button" className="dir-btn dir-btn-ghost" style={{ marginTop: links.length ? 8 : 0 }}
          disabled={links.length >= MAX_POINT_LINKS} onClick={() => setPicking(true)}
        >
          <Link2 size={13} /> Link a Hub page
        </button>
      </div>
      <div className="dir-field">
        <label className="dir-label" htmlFor="ra-exp">Take it down after</label>
        <input id="ra-exp" type="date" className="dir-input" value={expiresOn} min={today} onChange={e => setExpiresOn(e.target.value)} />
      </div>
      {proposing && (
        <p className="dir-field-hint">A director approves this before it shows on the board.</p>
      )}
      {error && <p className="dir-ra-error">{error}</p>}
      <div className="dir-ra-form-actions">
        <button type="button" className="dir-btn dir-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="dir-btn dir-btn-primary" disabled={!ready} onClick={() => void save()}>
          {proposing ? 'Send for approval' : 'Add to board'}
        </button>
      </div>
    </div>
  );
}
