import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { t, useLang, getLang } from '../../shared/i18n';
import type { SavedStudent } from '../../shared/identity';
import type * as PushClient from '../../shared/pushClient';

const loadClient = () => import('../../shared/pushClient') as Promise<typeof PushClient>;

/**
 * "Get alerts on this phone" on Home's saved-students card (#push).
 *
 * Renders NOTHING unless `pushSettings/global.familiesOpen` is true — the
 * director's switch, off until App Check enforcement is on and the iPhone
 * trial is done. The rules refuse a family subscription while it is off, so
 * this check is courtesy, not the gate.
 *
 * Ensembles are resolved from `studentsPublic` at the moment of tapping, so
 * a student moved into Symphony last week is followed as a Symphony student.
 * The saved list on the device is the fallback when a lookup fails.
 */
export function FamilyAlertsButton({ students }: { students: SavedStudent[] }) {
  useLang();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<typeof PushClient | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!db || students.length === 0) return;
    let alive = true;
    getDoc(doc(db, 'pushSettings', 'global'))
      .then(snap => { if (alive) setOpen(snap.get('familiesOpen') === true); })
      .catch(() => { /* unreadable = closed */ });
    return () => { alive = false; };
  }, [students.length]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadClient().then(c => {
      if (!alive) return;
      setClient(c);
      setOn(!!c.readPushState('family'));
    });
    return () => { alive = false; };
  }, [open]);

  if (!open || students.length === 0) return null;

  const support = client?.pushSupport() ?? 'ok';

  async function resolveEnsembleIds(): Promise<string[]> {
    const ids = new Set<string>();
    await Promise.all(students.map(async s => {
      try {
        const snap = db ? await getDoc(doc(db, 'studentsPublic', s.id)) : null;
        const fresh = snap?.exists() ? (snap.get('ensembleIds') as unknown) : null;
        (Array.isArray(fresh) ? (fresh as string[]) : s.ensembleIds ?? []).forEach(id => ids.add(id));
      } catch {
        (s.ensembleIds ?? []).forEach(id => ids.add(id));
      }
    }));
    return [...ids];
  }

  async function subscribe() {
    if (!client) return;
    setBusy(true); setNote(null);
    try {
      await client.subscribeThisDevice({
        kind: 'family', scope: 'groups', ensembleIds: await resolveEnsembleIds(),
        studentIds: students.map(s => s.id), lang: getLang(),
      });
      setOn(true);
    } catch (err) {
      const key = err instanceof Error ? err.message : '';
      setNote(t(key === 'permission' ? 'push.denied' : key === 'unsupported' ? 'push.unsupported' : 'push.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    if (!client) return;
    setBusy(true); setNote(null);
    try {
      await client.unsubscribeThisDevice('family');
      setOn(false);
    } catch {
      setNote(t('push.failed'));
    } finally {
      setBusy(false);
    }
  }

  const supportNote = support === 'ios-needs-home-screen' ? t('push.iosHomeScreen')
    : support === 'unsupported' ? t('push.unsupported')
      : support === 'blocked' ? t('push.blocked') : null;

  return (
    <div className="pub-card pub-push-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
        <Bell size={18} /> {on ? t('push.on') : t('push.getAlerts')}
      </div>
      <p style={{ margin: '6px 0 8px', fontSize: 14 }}>{supportNote ?? t('push.help')}</p>
      {!supportNote && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pub-push-btn" disabled={busy || !client} onClick={subscribe}>
            {busy ? t('push.working') : on ? t('push.update') : t('push.getAlerts')}
          </button>
          {on && (
            <button className="pub-push-btn pub-push-btn-ghost" disabled={busy} onClick={unsubscribe}>
              {t('push.turnOff')}
            </button>
          )}
        </div>
      )}
      {note && <p role="status" style={{ margin: '8px 0 0', fontSize: 14 }}>{note}</p>}
    </div>
  );
}
