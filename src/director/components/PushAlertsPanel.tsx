import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { auth } from '../firebaseAuth';
import { useEnsembles } from '../hooks/useEnsembles';
import { musicEnsembles } from '../utils';
import { useCurrentDirector } from '../currentDirector';
import { isStaffMember } from '../directorRoles';
import { useModalA11y } from '../../shared/useModalA11y';
import { backdropClose } from '../../shared/backdropClose';
import type { PushScope } from '../../shared/pushAlerts';
import type * as PushClient from '../../shared/pushClient';

/** The client module is loaded on first open, so the messaging SDK it pulls in
 *  never reaches anyone who does not open this panel (#push). */
const loadClient = () => import('../../shared/pushClient') as Promise<typeof PushClient>;

/**
 * "Phone alerts" menu row (#push). One component, two skins (#one-nav): the
 * rail and the phone drawer both render this, so neither can lose it.
 */
export function PushAlertsButton({ rail = false, onOpen }: { rail?: boolean; onOpen?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const cls = rail ? 'dir-rail-item' : 'dir-menu-item';
  return (
    <>
      {/* The phone drawer passes onOpen: the panel's state must live OUTSIDE
          the drawer, or closing the drawer unmounts the panel with it. */}
      <button className={cls} onClick={() => (onOpen ? onOpen() : setOpen(true))}>
        <Bell size={rail ? 18 : 19} /> Phone alerts
      </button>
      {/* Portaled to <body>: opened from inside the phone drawer, a fixed
          overlay would otherwise resolve against the drawer (#link-picker). */}
      {open && createPortal(<PushAlertsPanel onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

const SUPPORT_TEXT: Record<string, string> = {
  unsupported: 'This browser cannot receive alerts. On a laptop, Chrome, Edge and Firefox can; on a phone, use the installed Hub.',
  'ios-needs-home-screen':
    'On iPhone and iPad, alerts only reach a Hub added to the Home Screen. In Safari tap Share, then Add to Home Screen, open the Hub from that icon, and come back here.',
  blocked: 'Notifications are blocked for the Hub on this device. Allow them in Settings, then come back here.',
};

const ERROR_TEXT: Record<string, string> = {
  permission: 'Notifications were not allowed. Tap Turn on again and choose Allow.',
  unsupported: SUPPORT_TEXT.unsupported,
  'not-configured': 'This build is not connected to Firebase.',
  'no-service-worker': 'The Hub app is still installing on this device. Reload once, then try again.',
};

// One reading size and one button shape for the whole panel: the stock
// 12px muted hint was too small to read, and a bare .dir-btn has no
// outline or side padding, so the secondary buttons read as loose text.
const TEXT = { margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--dir-text)' } as const;
const BUTTONS = { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 } as const;
const BTN = { flex: 'none', width: '100%', padding: '0 18px' } as const;

export function PushAlertsPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const me = useCurrentDirector();
  const canFlipFamilies = isStaffMember(me);
  const { ensembles } = useEnsembles();
  const groups = useMemo(() => musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)), [ensembles]);

  const [client, setClient] = useState<typeof PushClient | null>(null);
  const [state, setState] = useState<PushClient.LocalPushState | null>(null);
  const [scope, setScope] = useState<PushScope>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [familiesOpen, setFamiliesOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void loadClient().then(c => {
      if (!alive) return;
      setClient(c);
      const s = c.readPushState('staff');
      setState(s);
      if (s) { setScope(s.scope); setPicked(s.ensembleIds); }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, 'pushSettings', 'global'),
      snap => setFamiliesOpen(snap.get('familiesOpen') === true),
      () => setFamiliesOpen(null));
  }, []);

  const support = client?.pushSupport() ?? 'ok';

  async function turnOn() {
    if (!client || !me) return;
    if (scope === 'groups' && picked.length === 0) {
      setMsg({ ok: false, text: 'Pick at least one ensemble, or choose Everything.' });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const s = await client.subscribeThisDevice({
        kind: 'staff', scope, ensembleIds: scope === 'groups' ? picked : [], studentIds: [],
        lang: 'en', staffEmail: auth?.currentUser?.email ?? me.email,
      });
      setState(s);
      setMsg({ ok: true, text: 'Alerts are on for this device. Send a test alert to be sure.' });
    } catch (err) {
      const key = err instanceof Error ? err.message : '';
      setMsg({ ok: false, text: ERROR_TEXT[key] ?? `Could not turn alerts on: ${key || 'unknown error'}` });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!client) return;
    setBusy(true); setMsg(null);
    try {
      await client.unsubscribeThisDevice('staff');
      setState(null);
      setMsg({ ok: true, text: 'Alerts are off for this device.' });
    } catch (err) {
      setMsg({ ok: false, text: `Could not turn alerts off: ${err instanceof Error ? err.message : 'unknown error'}` });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!client || !state || !auth?.currentUser) return;
    setBusy(true); setMsg(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const r = await client.sendTestAlertToThisDevice(idToken, state.id);
      setMsg(r.ok
        ? { ok: true, text: 'Sent. It should buzz within a few seconds, even with the Hub closed.' }
        : { ok: false, text: r.message ?? 'The test alert did not go out.' });
    } finally {
      setBusy(false);
    }
  }

  async function flipFamilies(next: boolean) {
    if (!db || !me) return;
    if (next && !window.confirm(
      'Open alerts to families?\n\n'
      + 'Before you do this:\n'
      + '• App Check enforcement should be ON for Firestore. Turning this on adds a public write anyone on the internet can call.\n'
      + '• The two-week iPhone trial should be done, with subscriptions still delivering.\n\n'
      + 'Families will see "Get alerts on this phone" on the Home page right away.',
    )) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'pushSettings', 'global'), { familiesOpen: next, updatedAt: Date.now(), updatedBy: me.email });
    } catch (err) {
      setMsg({ ok: false, text: `Could not change the family switch: ${err instanceof Error ? err.message : 'unknown error'}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" {...backdropClose(onClose)}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label="Phone alerts" tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Bell size={16} style={{ verticalAlign: '-2px' }} /> Phone alerts</span>
          <button className="dir-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dir-drawer-body">
          <p style={TEXT}>
            When a director changes or cancels something happening <strong>today</strong>, this device
            buzzes with the change note. This is the trial: staff devices only.
          </p>
          <p style={TEXT}>
            <strong>iPhone and iPad:</strong> alerts only reach a Hub added to the Home Screen
            (Safari → Share → Add to Home Screen), opened from that icon.
          </p>

          {support !== 'ok' && (
            <div className="dir-card" role="status" style={{ ...TEXT, margin: 0 }}>{SUPPORT_TEXT[support]}</div>
          )}

          {support === 'ok' && (
            <>
              <div className="dir-field">
                <label className="dir-label">What should this device hear about?</label>
                <div className="dir-checkbox-group">
                  <label className={`dir-checkbox-tag${scope === 'all' ? ' checked' : ''}`}>
                    <input type="radio" name="push-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
                    Everything
                  </label>
                  <label className={`dir-checkbox-tag${scope === 'groups' ? ' checked' : ''}`}>
                    <input type="radio" name="push-scope" checked={scope === 'groups'} onChange={() => setScope('groups')} />
                    Chosen ensembles
                  </label>
                </div>
              </div>
              {scope === 'groups' && (
                <div className="dir-field">
                  <div className="dir-checkbox-group">
                    {groups.map(g => {
                      const on = picked.includes(g.id);
                      return (
                        <label key={g.id} className={`dir-checkbox-tag${on ? ' checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setPicked(p => on ? p.filter(x => x !== g.id) : [...p, g.id])}
                          />
                          {g.name}
                        </label>
                      );
                    })}
                  </div>
                  <div className="dir-label-hint">School-wide changes always come through.</div>
                </div>
              )}

              <div style={BUTTONS}>
                <button className="dir-btn dir-btn-primary" style={BTN} disabled={busy || !client} onClick={turnOn}>
                  {state ? 'Save' : 'Turn on alerts on this phone'}
                </button>
                {state && (
                  <>
                    <button className="dir-btn dir-btn-ghost" style={BTN} disabled={busy} onClick={test}>Send a test alert</button>
                    <button className="dir-btn dir-btn-ghost" style={BTN} disabled={busy} onClick={turnOff}>Turn off</button>
                  </>
                )}
              </div>
            </>
          )}

          {msg && (
            <div role="status" style={{ ...TEXT, fontWeight: 600, color: msg.ok ? undefined : 'var(--dir-danger)' }}>
              {msg.text}
            </div>
          )}

          {canFlipFamilies && (
            <div className="dir-card" style={{ margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 16 }}>Families</strong>
              <p style={TEXT}>
                {familiesOpen === null ? 'Checking…'
                  : familiesOpen
                    ? 'ON. Families see "Get alerts on this phone" on the Home page. Closing stops alerts to every family phone at once; opening again brings them back.'
                    : 'OFF. Families see nothing, and no family phone gets an alert.'}
              </p>
              <p style={TEXT}>
                Turn this on only after App Check enforcement is on and the two-week iPhone trial
                shows alerts still arriving. It opens a public sign-up anyone can reach.
              </p>
              {familiesOpen !== null && (
                <button
                  className="dir-btn dir-btn-ghost"
                  style={BTN}
                  disabled={busy}
                  onClick={() => flipFamilies(!familiesOpen)}
                >
                  {familiesOpen ? 'Close alerts to families' : 'Open alerts to families…'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
