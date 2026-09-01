import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, doc, query, orderBy, where, writeBatch, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo, trackWrite } from '../writeStatus';
import { publicLessonFields } from '../publicMirror';
import { currentDirectorName, useCurrentDirector, currentDirectorHasRole, currentDirectorIsStaff } from '../currentDirector';
import type { Lesson } from '../types';

/**
 * Private lessons (#roles, #applied) — an Applied Teacher's own scheduled 1:1
 * sessions, including the grade they gave each one. This collection is never
 * world-readable (see firestore.rules); Owner/Director can read all of them
 * for coordination, an Applied Teacher only their own (enforced server-side
 * too, which is why the grade lives on this doc and not in its own
 * collection).
 *
 * Its SCHEDULE half is mirrored to the world-readable `lessonsPublic`
 * (#privacy) so a student's own lesson time reaches their calendar feed —
 * when, where, and with whom, and nothing else. publicLessonFields() is the
 * allowlist; every write below carries the mirror with it.
 */
export function useLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const me = useCurrentDirector();
  // An Applied Teacher may only READ their own lessons (audit rec #5) — so
  // their listener has to ASK for only their own, or Firestore rejects the whole
  // query. Deliberately no orderBy alongside the filter: an equality query
  // plus a sort on another field needs a composite index, and a teacher's
  // lesson list is small enough to sort here.
  // Applied teachers who are NOT also directors get a scoped query only.
  // Director+teacher combos see every lesson (Dean overview) on the Lessons
  // tab and their own on My Lessons.
  const mine = me && currentDirectorHasRole('teacher') && !currentDirectorIsStaff() ? me.email : null;

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    // Wait for the signed-in identity to resolve before subscribing, so a
    // teacher never briefly opens the unscoped query and trips the rules.
    if (!me) return;
    const q = mine
      ? query(collection(db, 'lessons'), where('teacherEmail', '==', mine))
      : query(collection(db, 'lessons'), orderBy('date'));
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson));
      if (mine) rows.sort((a, b) => a.date.localeCompare(b.date));
      setLessons(rows);
      noteLoadOk('lessons');
      setLoading(false);
    }, () => { noteLoadError('lessons'); setLoading(false); });
  }, [me, mine]);

  async function addLesson(data: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    const payload = { ...data, createdAt: Date.now(), updatedAt: Date.now(), updatedBy: currentDirectorName() };
    // Mirror batched with the source doc, same id (#privacy) — a lesson that
    // exists but is missing from lessonsPublic is a lesson the student's own
    // calendar silently drops.
    const ref = doc(collection(dbRef, 'lessons'));
    const written = await trackWrite('Lesson', async () => {
      const batch = writeBatch(dbRef);
      batch.set(ref, payload);
      batch.set(doc(dbRef, 'lessonsPublic', ref.id), publicLessonFields(payload));
      await batch.commit();
      return ref;
    });
    return written?.id;
  }

  async function updateLesson(id: string, data: Partial<Omit<Lesson, 'id'>>) {
    if (!db) return;
    const dbRef = db;
    const payload = { ...data, updatedAt: Date.now(), updatedBy: currentDirectorName() };
    await trackWrite('Lesson update', async () => {
      const batch = writeBatch(dbRef);
      batch.update(doc(dbRef, 'lessons', id), payload);
      // Merge, not set: an update is a PARTIAL, and the caller may be sending
      // only a grade. Fields the update CLEARS are handled by syncLessonMirror,
      // which the clearing call sites run afterwards.
      batch.set(doc(dbRef, 'lessonsPublic', id), publicLessonFields(payload), { merge: true });
      await batch.commit();
    });
  }

  /**
   * Rebuild one mirror doc from the lesson as it now stands.
   *
   * The merge in updateLesson cannot express a REMOVED field, and the log form
   * clears `location` with deleteField() on its own updateDoc. Re-reading the
   * source doc is immune to every write path — including ones added later —
   * which is worth one extra read on a screen that writes a handful of times
   * a day. scripts/backfill-public-projections.mjs converges anything missed.
   */
  async function syncLessonMirror(id: string) {
    if (!db) return;
    const snap = await getDoc(doc(db, 'lessons', id));
    if (!snap.exists()) return;
    await trackWrite('Lesson calendar', () =>
      // set (not merge) so a field the source no longer has leaves the mirror.
      writeBatch(db!).set(doc(db!, 'lessonsPublic', id), publicLessonFields(snap.data() as Lesson)).commit());
  }

  async function deleteLesson(id: string) {
    if (!db) return;
    const gone = lessons.find(x => x.id === id);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'lessons', id));
    batch.delete(doc(db, 'lessonsPublic', id));
    await batch.commit();
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('lessons', id, data, `Deleted lesson — restore?`, [
        { collection: 'lessonsPublic', docId: id, data: publicLessonFields(data) },
      ]);
    }
  }

  return { lessons, loading, addLesson, updateLesson, deleteLesson, syncLessonMirror };
}
