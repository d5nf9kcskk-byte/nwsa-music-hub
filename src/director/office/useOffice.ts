import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { auth } from '../firebaseAuth';
import { FIXTURES_ON } from '../hooks/fixtures';
import {
  FIXTURE_BROADCASTS, FIXTURE_BROADCAST_TO, FIXTURE_SECTION_LINKS, FIXTURE_THREADS, FIXTURE_THREAD_MESSAGES,
} from '../hooks/fixturesAdult';
import { usePersonnelGate } from '../hooks/personnelGate';
import { currentDirectorName } from '../currentDirector';
import { trackWrite } from '../writeStatus';
import {
  readStamp, sectionSlug, type Audience, type Broadcast, type BroadcastTo, type ThreadMessage, type ThreadSummary,
} from './officeCore';

/**
 * Data for messages to players (#messages). Staff hooks subscribe only for an
 * Owner/Director in a personnel org (the same gate as the pay tier: a denied
 * listener is fatal), and a player's hooks only ever name THEIR OWN thread.
 * With no database (VITE_FIXTURES) every hook serves the fixtures and keeps
 * writes in memory, so the screens can be seen and used with nothing online.
 */
const fixtures = !db && FIXTURES_ON;

/** Fixture-only state shared by every screen that shows it (the nav badge and the
 *  inbox are different hook instances), so a write in the preview shows everywhere. */
function fxStore<T>(initial: T): () => [T, (f: (v: T) => T) => void] {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  const update = (f: (v: T) => T) => { value = f(value); subs.forEach(fn => fn(value)); };
  return () => {
    const [v, set] = useState(value);
    useEffect(() => { subs.add(set); return () => { subs.delete(set); }; }, []);
    return [v, update]; // `update` never changes, so it is safe in a dependency list
  };
}
const useFxThreads = fxStore<ThreadSummary[]>(fixtures ? (FIXTURE_THREADS as ThreadSummary[]) : []);
const useFxBroadcasts = fxStore<Broadcast[]>(fixtures ? (FIXTURE_BROADCASTS as Broadcast[]) : []);

/** The office inbox: every thread, newest first. */
export function useThreads(enabled = true) {
  const gate = usePersonnelGate();
  const [live, setLive] = useState<ThreadSummary[]>([]);
  const [fx, setFx] = useFxThreads();
  useEffect(() => {
    if (!db || !enabled || gate !== 'open') return;
    return onSnapshot(collection(db, 'threads'),
      snap => setLive(snap.docs.map(d => ({ personnelId: d.id, ...d.data() } as ThreadSummary))), () => setLive([]));
  }, [enabled, gate]);
  const threads = useMemo(() => [...(fixtures ? fx : live)].sort((a, b) => b.lastAt - a.lastAt), [fx, live]);
  const markRead = useCallback((t: ThreadSummary) => {
    if (fixtures) { setFx(list => list.map(x => x.personnelId === t.personnelId ? { ...x, staffReadAt: readStamp(t) } : x)); return; }
    if (db) void updateDoc(doc(db, 'threads', t.personnelId), { staffReadAt: readStamp(t) }).catch(() => {});
  }, [setFx]);
  return { threads, markRead };
}

/** One thread's messages, oldest first, and a way to add one. `side` is who is typing. */
export function useThread(personnelId: string, side: 'staff' | 'member', enabled = true) {
  const gate = usePersonnelGate();
  const [live, setLive] = useState<ThreadMessage[]>([]);
  const [fx, setFx] = useState<ThreadMessage[]>(fixtures ? (FIXTURE_THREAD_MESSAGES[personnelId] ?? []) : []);
  const ok = enabled && !!personnelId && (side === 'member' || gate === 'open');
  useEffect(() => {
    if (!db || !ok) return;
    return onSnapshot(query(collection(db, 'threads', personnelId, 'messages'), orderBy('at'), limit(300)),
      snap => setLive(snap.docs.map(d => ({ id: d.id, ...d.data() } as ThreadMessage))), () => setLive([]));
  }, [ok, personnelId]);
  async function send(text: string): Promise<boolean> {
    const body = text.trim();
    if (!body) return false;
    const at = Date.now();
    if (fixtures) { setFx(m => [...m, { id: `fx-${at}`, from: side, text: body, at, ...(side === 'staff' ? { byName: 'You' } : {}) }]); return true; }
    if (!db || !auth?.currentUser?.email) return false;
    const dbRef = db;
    const email = auth.currentUser.email;
    return !!(await trackWrite('Message', () => addDoc(collection(dbRef, 'threads', personnelId, 'messages'),
      side === 'staff' ? { from: 'staff', text: body, at, byEmail: email, byName: currentDirectorName() ?? 'The office' } : { from: 'member', text: body, at })
      .then(() => true)));
  }
  return { messages: fixtures ? fx : live, send };
}

/** A player's own thread summary, for the unread mark. */
export function useMyThread(personnelId: string) {
  const [live, setLive] = useState<ThreadSummary | null>(null);
  const [fx, setFx] = useState<ThreadSummary | null>(fixtures ? ((FIXTURE_THREADS as ThreadSummary[]).find(t => t.personnelId === personnelId) ?? null) : null);
  useEffect(() => {
    if (!db || !personnelId) return;
    return onSnapshot(doc(db, 'threads', personnelId), snap => setLive(snap.exists() ? ({ personnelId, ...snap.data() } as ThreadSummary) : null), () => setLive(null));
  }, [personnelId]);
  const thread = fixtures ? fx : live;
  const markRead = useCallback((t: ThreadSummary) => {
    if (fixtures) { setFx({ ...t, memberReadAt: readStamp(t) }); return; }
    if (db) void updateDoc(doc(db, 'threads', t.personnelId), { memberReadAt: readStamp(t) }).catch(() => {});
  }, []);
  return { thread, markRead };
}

/** The Sent list, newest first. A press writes a request; the function does the rest. */
export function useBroadcasts() {
  const gate = usePersonnelGate();
  const [live, setLive] = useState<Broadcast[]>([]);
  const [fx, setFx] = useFxBroadcasts();
  useEffect(() => {
    if (!db || gate !== 'open') return;
    return onSnapshot(query(collection(db, 'memberMailQueue'), orderBy('queuedAt', 'desc'), limit(30)),
      snap => setLive(snap.docs.map(d => ({ id: d.id, ...d.data() } as Broadcast))), () => setLive([]));
  }, [gate]);
  async function send(req: { audience: Audience; section?: string; personnelId?: string; subject: string; body: string }, reach: { send: number; noAddress: number }): Promise<boolean> {
    const queuedAt = Date.now();
    if (fixtures) {
      setFx(b => [{ id: `fx-b${queuedAt}`, byEmail: 'you@example.org', ...req, queuedAt, status: 'queued', counts: { send: reach.send, noAddress: reach.noAddress } }, ...b]);
      return true;
    }
    if (!db || !auth?.currentUser?.email) return false;
    const dbRef = db;
    const email = auth.currentUser.email;
    // Only the keys the rules allow: no section on an "everyone" request, and so on.
    const request = {
      byEmail: email, subject: req.subject.trim(), body: req.body, audience: req.audience, queuedAt,
      ...(req.audience === 'section' ? { section: req.section } : {}),
      ...(req.audience === 'person' ? { personnelId: req.personnelId } : {}),
    };
    return !!(await trackWrite('Broadcast', () => addDoc(collection(dbRef, 'memberMailQueue'), request).then(() => true)));
  }
  return { broadcasts: fixtures ? fx : live, send };
}

/** Who one broadcast reached, player by player. Subscribes only while a row is open. */
export function useBroadcastTo(id: string | null): BroadcastTo[] {
  const [live, setLive] = useState<BroadcastTo[]>([]);
  useEffect(() => {
    if (!db || !id) return;
    return onSnapshot(collection(db, 'memberMailQueue', id, 'to'),
      snap => setLive(snap.docs.map(d => ({ personnelId: d.id, ...d.data() } as BroadcastTo))), () => setLive([]));
  }, [id]);
  if (fixtures) return id ? ((FIXTURE_BROADCAST_TO[id] ?? []) as BroadcastTo[]) : [];
  return id ? live : [];
}

/** One chat link per section. Staff write; players read (and see their own section's). */
export function useSectionLinks(canWrite: boolean) {
  const [live, setLive] = useState<Record<string, string>>({});
  const [fx, setFx] = useState<Record<string, string>>(fixtures ? Object.fromEntries(FIXTURE_SECTION_LINKS.map(l => [l.section, l.url])) : {});
  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'sectionLinks'),
      snap => setLive(Object.fromEntries(snap.docs.map(d => [String(d.get('section')), String(d.get('url'))]))), () => setLive({}));
  }, []);
  const links = fixtures ? fx : live;
  async function save(section: string, url: string) {
    if (!canWrite) return;
    if (fixtures) { setFx(l => ({ ...l, [section]: url })); return; }
    if (!db) return;
    const dbRef = db;
    await trackWrite('Chat link', () => setDoc(doc(dbRef, 'sectionLinks', sectionSlug(section)), { section, url, updatedAt: Date.now(), updatedBy: currentDirectorName() }));
  }
  async function clear(section: string) {
    if (!canWrite) return;
    if (fixtures) { setFx(l => { const n = { ...l }; delete n[section]; return n; }); return; }
    if (!db) return;
    const dbRef = db;
    await trackWrite('Chat link removed', () => deleteDoc(doc(dbRef, 'sectionLinks', sectionSlug(section))));
  }
  return { links, save, clear };
}
