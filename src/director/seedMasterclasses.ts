import { doc, writeBatch, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MASTERCLASS_SECTIONS } from './masterclassSections';
import { publicStudentFields } from './publicMirror';
import type { CalendarEvent, Student } from './types';

const CHUNK = 499;
const GENERIC_TITLE = /^String Masterclass$/i;

/**
 * Create the four string master class groups, enroll string players by
 * instrument, and split any generic "String Masterclass" calendar entries
 * into one event per section. Idempotent — safe to re-run.
 */
export async function seedMasterclasses(): Promise<{ groups: number; enrolled: number; replaced: number }> {
  if (!db) throw new Error('Firebase is not configured.');
  const dbRef = db;

  let enrolled = 0;
  let replaced = 0;
  const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
  const deletes: (() => Promise<void>)[] = [];

  for (const s of MASTERCLASS_SECTIONS) {
    ops.push(batch => batch.set(doc(dbRef, 'ensembles', s.id), {
      kind: 'masterclass',
      name: s.name,
      order: s.order,
      defaultLocation: s.room,
      defaultStartTime: s.start,
      defaultEndTime: s.end,
      meetingDays: s.days,
      ...(s.conductorName ? { conductorName: s.conductorName } : {}),
    }, { merge: true }));
  }

  const studentsSnap = await getDocs(collection(dbRef, 'students'));
  for (const d of studentsSnap.docs) {
    const data = d.data() as Student;
    if (data.status !== 'Active') continue;
    const sec = MASTERCLASS_SECTIONS.find(s => s.instrument === data.instrument);
    if (!sec) continue;
    const have = data.ensembleIds ?? [];
    if (have.includes(sec.id)) continue;
    enrolled += 1;
    const next = [...have, sec.id];
    ops.push(batch => {
      batch.update(d.ref, { ensembleIds: next, updatedAt: Date.now(), updatedBy: 'masterclass seed' });
      batch.set(doc(dbRef, 'studentsPublic', d.id), publicStudentFields({ ...data, ensembleIds: next }), { merge: true });
    });
  }

  const eventsSnap = await getDocs(collection(dbRef, 'events'));
  for (const d of eventsSnap.docs) {
    const e = d.data() as CalendarEvent;
    const title = e.title ?? '';

    if (GENERIC_TITLE.test(title)) {
      replaced += 1;
      const hhmm = (e.startTime ?? '14:30').replace(':', '');
      for (const s of MASTERCLASS_SECTIONS) {
        const id = `class-${e.date}-${s.id}-${hhmm}`;
        ops.push(batch => batch.set(doc(dbRef, 'events', id), {
          type: 'Class',
          title: s.name,
          ensembleIds: [s.id],
          date: e.date,
          startTime: e.startTime ?? s.start,
          endTime: e.endTime ?? s.end,
          location: s.room,
          status: e.status ?? 'Scheduled',
          ...(e.notes ? { notes: e.notes } : {}),
        }, { merge: true }));
      }
      deletes.push(() => deleteDoc(d.ref));
      continue;
    }

    const section = MASTERCLASS_SECTIONS.find(s => s.name === title);
    if (!section) continue;
    if (e.ensembleIds?.includes(section.id)) continue;
    ops.push(batch => batch.update(d.ref, { ensembleIds: [section.id] }));
  }

  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(dbRef);
    for (const op of ops.slice(i, i + CHUNK)) op(batch);
    await batch.commit();
  }
  for (const del of deletes) await del();

  return { groups: MASTERCLASS_SECTIONS.length, enrolled, replaced };
}
