import { useEffect, useState } from 'react';
import { collection, doc, deleteDoc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import type { ConcertCheckin, ConcertAttendanceSettings } from '../types';

/**
 * Concert check-in records (#concert-checkin), staff side.
 *
 * The whole collection, not a window: the point of the feature is a CUMULATIVE
 * record that grows concert by concert, and the director's answer to "how many
 * has this student done this semester" has to see all of it. Two scans per
 * student per concert times a season of concerts is a few thousand documents
 * at the outside — the same order as `attendance`, which is also read whole.
 *
 * No write path here for creating a record: every one is written by the
 * concertCheckin Cloud Function with a server timestamp. What a director CAN
 * do is fix or remove one taken under the wrong name at the door, which is the
 * one correction a concert night actually produces.
 */
export function useConcertCheckins() {
  const [checkins, setCheckins] = useState<ConcertCheckin[]>([]);
  // Nothing to wait for when Firestore is not configured.
  const [loading, setLoading] = useState(Boolean(db));

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'concertCheckins'), orderBy('at', 'desc'));
    return onSnapshot(q, snap => {
      setCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConcertCheckin)));
      noteLoadOk('concertCheckins');
      setLoading(false);
    }, () => { noteLoadError('concertCheckins'); setLoading(false); });
  }, []);

  async function removeCheckin(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'concertCheckins', id));
  }

  return { checkins, loading, removeCheckin };
}

/** Site-wide settings, staff side — the same doc the public page reads. */
export function useConcertAttendanceSettings() {
  const [settings, setSettings] = useState<ConcertAttendanceSettings>({});
  const [loading, setLoading] = useState(Boolean(db));

  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, 'settings', 'concertAttendance'), snap => {
      setSettings((snap.data() ?? {}) as ConcertAttendanceSettings);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function save(patch: ConcertAttendanceSettings, who?: string) {
    if (!db) return;
    await setDoc(
      doc(db, 'settings', 'concertAttendance'),
      { ...settings, ...patch, updatedAt: Date.now(), ...(who ? { updatedBy: who } : {}) },
      { merge: true },
    );
  }

  return { settings, loading, save };
}

/**
 * Where the photo sync files its archive (`settings/concertAttendanceSync`).
 *
 * Its own STAFF-ONLY document rather than a field on the world-readable
 * `settings/concertAttendance`: the public check-in page has a legitimate
 * need for the station's rules (domains, window, goals), and no need
 * whatsoever to know where a director's photo archive lives.
 */
export function useConcertSyncSettings() {
  const [sync, setSync] = useState<{ driveFolderId?: string }>({});

  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, 'settings', 'concertAttendanceSync'),
      snap => setSync((snap.data() ?? {}) as { driveFolderId?: string }),
      () => { /* a settings read failure must not take the screen down */ });
  }, []);

  async function save(patch: { driveFolderId?: string }) {
    if (!db) return;
    await setDoc(doc(db, 'settings', 'concertAttendanceSync'),
      { ...patch, updatedAt: Date.now() }, { merge: true });
  }

  return { sync, save };
}
