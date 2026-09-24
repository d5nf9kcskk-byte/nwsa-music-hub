import { useState, useEffect } from 'react';
import { collection, onSnapshot, writeBatch, doc, query } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo } from '../writeStatus';
import { publicOverrideFields } from '../publicMirror';
import { useCurrentDirector } from '../currentDirector';
import { hasDirectorRole, isStaffMember } from '../directorRoles';
import { FIXTURES_ON, FIXTURE_CONCERT_EXCUSALS } from './fixtures';
import type { ConcertExcusal, RosterOverride } from '../types';

/** Who may READ an excusal's reason — matches `concertExcusals` in
 *  firestore.rules. Query and rule must agree: anyone else would get a
 *  permission error on the listener, so they never subscribe. */
export function canReadExcusals(me: ReturnType<typeof useCurrentDirector>): boolean {
  return isStaffMember(me) || hasDirectorRole(me, 'teacher');
}

/**
 * Concert excusals (#concert-excusals). Filing one writes the record, its
 * event-scoped pull-outs, and their public mirrors in ONE batch, so a student
 * is never off a roster with no record of why, nor on file as excused while
 * still printed on the program. Deleting removes all of it together.
 */
export function useConcertExcusals() {
  const me = useCurrentDirector();
  const allowed = canReadExcusals(me);
  const [loaded, setExcusals] = useState<ConcertExcusal[]>([]);
  // Losing the role mid-session hides what was loaded, without an effect write.
  const excusals = !allowed ? [] : db ? loaded : FIXTURES_ON ? FIXTURE_CONCERT_EXCUSALS : [];

  useEffect(() => {
    if (!db || !allowed) return;
    return onSnapshot(query(collection(db, 'concertExcusals')), snap => {
      setExcusals(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConcertExcusal)));
      noteLoadOk('concertExcusals');
    }, () => noteLoadError('concertExcusals'));
  }, [allowed]);

  async function fileExcusal(
    data: Omit<ConcertExcusal, 'id' | 'overrideIds'>,
    overrides: Omit<RosterOverride, 'id'>[],
  ) {
    if (!db) return;
    const batch = writeBatch(db);
    const overrideIds: string[] = [];
    for (const o of overrides) {
      const ref = doc(collection(db, 'rosterOverrides'));
      overrideIds.push(ref.id);
      batch.set(ref, o);
      batch.set(doc(db, 'rosterOverridesPublic', ref.id), publicOverrideFields(o));
    }
    batch.set(doc(collection(db, 'concertExcusals')), { ...data, overrideIds });
    await batch.commit();
  }

  async function deleteExcusal(x: ConcertExcusal, allOverrides: RosterOverride[]) {
    if (!db) return;
    const owned = allOverrides.filter(o => x.overrideIds.includes(o.id));
    const batch = writeBatch(db);
    batch.delete(doc(db, 'concertExcusals', x.id));
    for (const id of x.overrideIds) {
      batch.delete(doc(db, 'rosterOverrides', id));
      batch.delete(doc(db, 'rosterOverridesPublic', id));
    }
    await batch.commit();
    const { id, ...data } = x;
    offerUndo('concertExcusals', id, data, 'Excusal removed — restore?', owned.flatMap(({ id: oid, ...o }) => [
      { collection: 'rosterOverrides', docId: oid, data: o },
      { collection: 'rosterOverridesPublic', docId: oid, data: publicOverrideFields(o) },
    ]));
  }

  // Filing and deleting are directors' alone (rules: isStaff); an applied
  // teacher reads the record but cannot change it.
  return { excusals, allowed, canFile: isStaffMember(me), fileExcusal, deleteExcusal };
}
