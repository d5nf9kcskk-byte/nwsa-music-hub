import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import '../personnel/personnel.css';
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { LogOut, CalendarClock, Music, ClipboardSignature, Wallet, FileDown, MapPin } from 'lucide-react';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { auth, storage } from '../firebaseAuth';
import { useEvents } from '../hooks/useEvents';
import { useRepertoire } from '../hooks/useRepertoire';
import { FIXTURES_ON } from '../hooks/fixtures';
import {
  FIXTURE_CONTRACTS, FIXTURE_MEMBER_PERSONNEL_ID, FIXTURE_PAYMENTS, FIXTURE_PERSONNEL, FIXTURE_PERSONNEL_CONTACTS,
} from '../hooks/fixturesAdult';
import { memberView, partIsMine, type MemberView } from '../../shared/memberView';
import { calledIds, seatLabel } from '../personnel/personnelOrder';
import { contractTotalCents, formatCents, paidCents, payState } from '../personnel/contractMoney';
import { formatDate, formatTime, formatTimeRange, todayStr } from '../utils';
import { PAY_METHOD_LABEL, type CalendarEvent, type Contract, type Payment, type Personnel } from '../types';
import { ORG } from '../../org';

/**
 * A player's own home (#member-sign-in, personnel orgs only): the next call,
 * my part(s), my contract and whether I have been paid. READ-ONLY.
 *
 * Where each thing comes from, and why:
 *   • my roster row, contracts and payments: the `memberHome` function, a
 *     projection without the personnel manager's notes (src/shared/
 *     memberView.ts). Members have no read on those collections at all.
 *   • the schedule and the program: `events` and `repertoire`, which are
 *     world-readable anyway.
 *   • my parts: the members-only Storage path the Bottega ingest writes,
 *     opened through the signed-in session (getBlob), never a download URL.
 *     Every member may open any part (storage.rules says why); this screen
 *     shows a player their own chair's (partIsMine).
 * In a fixture build the same projection runs over the fixture roster, for
 * the second flute (`?role=member`).
 */

function endpoint(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/memberHome` : '';
}

function fixtureView(): MemberView {
  const id = FIXTURE_MEMBER_PERSONNEL_ID;
  return memberView(id,
    FIXTURE_PERSONNEL.find(p => p.id === id) as unknown as Record<string, unknown> | undefined,
    FIXTURE_PERSONNEL_CONTACTS[id] as unknown as Record<string, unknown> | undefined,
    FIXTURE_CONTRACTS.map(c => ({ id: c.id, data: c as unknown as Record<string, unknown> })),
    FIXTURE_PAYMENTS.map(p => ({ id: p.id, data: p as unknown as Record<string, unknown> })));
}

function useMemberView(): { view: MemberView | null; error: string } {
  const [view, setView] = useState<MemberView | null>(FIXTURES_ON && !auth ? fixtureView() : null);
  const [error, setError] = useState('');
  useEffect(() => {
    const url = endpoint();
    const user = auth?.currentUser;
    if (!url || !user) return;
    let gone = false;
    void (async () => {
      try {
        const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const data = await res.json().catch(() => null) as { ok?: boolean; view?: MemberView; message?: string } | null;
        if (gone) return;
        if (res.ok && data?.ok && data.view) setView(data.view);
        else setError(data?.message ?? 'Your details did not load. Try again in a moment.');
      } catch {
        if (!gone) setError('That did not reach the Hub. Check your internet and try again.');
      }
    })();
    return () => { gone = true; };
  }, []);
  return { view, error };
}

const firstLast = (name: string) => name.includes(', ') ? name.split(', ').reverse().join(' ') : name;
const dayLabel = (d: string) => formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' });

export default function MemberApp({ user, signOut }: { user: User; signOut: () => void }) {
  const { view, error } = useMemberView();
  const today = todayStr();
  const until = useMemo(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + 180);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const { events } = useEvents({ from: today, to: until });
  const { pieces } = useRepertoire();
  const [opening, setOpening] = useState('');
  const [partError, setPartError] = useState('');

  const person = (view?.person ?? null) as Partial<Personnel> | null;
  const contracts = useMemo(() => (view?.contracts ?? []) as unknown as Contract[], [view]);
  const payments = useMemo(() => (view?.payments ?? []) as unknown as Payment[], [view]);
  const personnelId = view?.personnelId ?? '';

  // My calls: every coming service my contracts call me to (the roll's own rule, calledIds).
  const calls = useMemo(() => events
    .filter((e: CalendarEvent) => e.date >= today && e.status !== 'Cancelled' && calledIds(contracts, e).has(personnelId))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '')),
  [events, contracts, personnelId, today]);
  const next = calls[0];

  // My parts: pieces on my coming calls, the ones for my chair.
  const myParts = useMemo(() => {
    const ids = new Set(calls.flatMap(e => e.pieceIds ?? []));
    return pieces
      .filter(p => ids.has(p.id) && p.memberParts?.length)
      .map(p => ({ piece: p, parts: (p.memberParts ?? []).filter(part => person && partIsMine(part, person)) }))
      .filter(x => x.parts.length);
  }, [calls, pieces, person]);

  async function openPart(path: string) {
    setPartError('');
    if (!storage) { setPartError('Parts open on the live Hub, not in this preview.'); return; }
    setOpening(path);
    try {
      const blob = await getBlob(storageRef(storage, path));
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch {
      setPartError('That part did not open. Check your internet, or tell the librarian.');
    }
    setOpening('');
  }

  const card: React.CSSProperties = { background: 'var(--dir-surface)', border: '1px solid var(--dir-border)', borderRadius: 'var(--dir-radius)', padding: 16, marginBottom: 12 };
  const title: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--dir-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 8px' };
  const muted: React.CSSProperties = { fontSize: 13, color: 'var(--dir-text-muted)' };
  const name = person?.preferredName || (person?.name ? firstLast(person.name) : user.displayName ?? '');

  return (
    // block, not the staff shell's grid: from 1024px .dir-app saves a column for the nav rail, which a player has none of.
    <div className="dir-app" style={{ display: 'block' }}>
      <header className="dir-header">
        <div className="dir-header-brand">
          <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="dir-header-mark" />
          <div>
            <div className="dir-header-title">{name || ORG.appName}</div>
            <div className="dir-header-sub">
              {[person?.section || person?.instrument, person ? seatLabel(person) : ''].filter(Boolean).join(' · ') || ORG.orgShortName}
            </div>
          </div>
        </div>
        <button className="dir-header-icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
          <LogOut size={18} />
        </button>
      </header>

      <main className="dir-content" style={{ padding: '12px 16px 32px', maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {error && <p role="alert" style={{ ...muted, color: '#b91c1c' }}>{error}</p>}
        {!view && !error && <p style={muted}>Loading your details…</p>}

        {/* ── Next call ── */}
        <section style={card} aria-labelledby="m-next">
          <h2 id="m-next" style={title}><CalendarClock size={14} /> Next call</h2>
          {!view ? null : !next ? (
            <p style={muted}>No calls on the schedule for you yet.</p>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{next.title || next.type}</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>{dayLabel(next.date)} · {formatTimeRange(next.startTime, next.endTime)}</div>
              {next.callTime && <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Call {formatTime(next.callTime)}</div>}
              {next.location && <div style={{ ...muted, marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}><MapPin size={13} /> {next.location}</div>}
              {next.dress && <div style={{ ...muted, marginTop: 2 }}>Dress: {next.dress}</div>}
              {next.notes && <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.45 }}>{next.notes}</p>}
              {calls.length > 1 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', borderTop: '1px solid var(--dir-border)' }}>
                  {calls.slice(1, 6).map(e => (
                    <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--dir-border)', fontSize: 14 }}>
                      <span>{e.title || e.type}</span>
                      <span style={muted}>{formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(e.callTime || e.startTime)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {/* ── My parts ── */}
        <section style={card} aria-labelledby="m-parts">
          <h2 id="m-parts" style={title}><Music size={14} /> My parts</h2>
          {!view ? null : myParts.length === 0 ? (
            <p style={muted}>No parts are up for your chair yet. The librarian posts them here.</p>
          ) : (
            myParts.map(({ piece, parts }) => (
              <div key={piece.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--dir-border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{piece.title}</div>
                  <div style={muted}>{piece.composer}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {parts.map(part => (
                    <button key={part.path} className="dir-tool-btn" style={{ minHeight: 44 }} onClick={() => { void openPart(part.path); }} disabled={opening === part.path}>
                      <FileDown size={14} /> {opening === part.path ? 'Opening…' : part.label}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          {partError && <p role="alert" style={{ ...muted, color: '#b91c1c', marginTop: 8 }}>{partError}</p>}
        </section>

        {/* ── My contract and pay ── */}
        <section style={card} aria-labelledby="m-pay">
          <h2 id="m-pay" style={title}><ClipboardSignature size={14} /> My contract and pay</h2>
          {!view ? null : contracts.length === 0 ? (
            <p style={muted}>No contract yet. The office will send it.</p>
          ) : contracts.map(c => {
            const mine = payments.filter(p => p.contractId === c.id);
            const total = contractTotalCents(c);
            const paid = paidCents(mine);
            const state = payState(c, mine);
            return (
              <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--dir-border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`dir-contract-pill ${c.status}`}>{c.status === 'Sent' ? 'Waiting for your signature' : c.status}</span>
                  <span style={{ fontWeight: 700 }}>{c.position}{c.season ? ` · ${c.season}` : ''}</span>
                </div>
                {total != null && <div style={{ fontSize: 14, marginTop: 6 }}>Estimated total {formatCents(total)}</div>}
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                  {c.status === 'Void' ? 'Replaced; nothing is owed on this one.'
                    : state === 'paid' ? `Paid in full: ${formatCents(paid)}`
                    : state === 'part' && total != null ? `Paid ${formatCents(paid)} of ${formatCents(total)}`
                    : state === 'unpaid' ? 'Not paid yet'
                    : 'Paid once it is signed'}
                </div>
                {mine.map(p => (
                  <div key={p.id} style={muted}>
                    {formatDate(p.paidOn, { month: 'short', day: 'numeric' })}: {formatCents(p.amountCents)} by {PAY_METHOD_LABEL[p.method] ?? p.method}{p.reference ? ` (${p.reference})` : ''}
                  </div>
                ))}
              </div>
            );
          })}
          {view?.contact.payMethod ? (
            <p style={{ ...muted, marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <Wallet size={13} /> Paid by {PAY_METHOD_LABEL[view.contact.payMethod as keyof typeof PAY_METHOD_LABEL] ?? String(view.contact.payMethod)}
              {view.contact.payHandle ? ` to ${String(view.contact.payHandle)}` : ''}. Wrong? Tell the office.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
