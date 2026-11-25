import { useState, useEffect } from 'react';
import { collection, doc, setDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { trackWrite } from '../writeStatus';
import { currentDirectorName, currentDirectorRole } from '../currentDirector';
import type { ConcertPersonnel, SheetLink } from '../types';
import { usePersonnelGate } from './personnelGate';
import { FIXTURES_ON } from './fixtures';
import { FIXTURE_CONCERT_PERSONNEL } from './fixturesAdult';
import { fxPatch, fxApply, useFxVersion } from '../personnel/fixtureWrites';

/**
 * The concert link (#aiso-personnel, docs/aiso-personnel-screen.md): one doc
 * per concert, id = event id, holding the sections in the sheet's order with
 * the chairs each needs, and who said yes. Owner/Director only, the same gate
 * as every paid-roster hook. Who PLAYS is the contracts, never this doc.
 */
export function useConcertPersonnel() {
  const [docs, setDocs] = useState<ConcertPersonnel[]>([]);
  const [links, setLinks] = useState<SheetLink[]>([]);
  const gate = usePersonnelGate();
  const fixtures = !db && FIXTURES_ON && gate === 'open';
  useFxVersion();

  useEffect(() => {
    if (!db || gate !== 'open') return;
    const stopDocs = watchCollection(collection(db, 'concertPersonnel'), 'concertPersonnel',
      snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConcertPersonnel))));
    const stopLinks = watchCollection(collection(db, 'sheetLinks'), 'sheetLinks',
      snap => setLinks(snap.docs.map(d => ({ id: d.id, ...d.data() } as SheetLink))));
    return () => { stopDocs(); stopLinks(); };
  }, [gate]);

  const all = fixtures ? fxApply('concertPersonnel', FIXTURE_CONCERT_PERSONNEL) : docs;
  const stamps = () => ({ updatedAt: Date.now(), updatedBy: currentDirectorName(), updatedByRole: currentDirectorRole() });

  /** Replace the section list (order and chairs needed). A list is replaced
   *  whole by a merge write, which is what an edit to it means. */
  async function saveSections(eventId: string, sections: NonNullable<ConcertPersonnel['sections']>) {
    const clean = sections.map(s => (s.needed != null ? { name: s.name, needed: s.needed } : { name: s.name }));
    if (!db) { if (fixtures) fxPatch('concertPersonnel', eventId, { sections: clean }); return; }
    const dbRef = db;
    await trackWrite('Chairs needed', () => setDoc(doc(dbRef, 'concertPersonnel', eventId), { sections: clean, ...stamps() }, { merge: true }));
  }

  /** Said yes to this concert, or not (a booking flag, not a signature). */
  async function setSaidYes(eventId: string, personnelId: string, yes: boolean) {
    if (!db) {
      if (fixtures) {
        const cur = all.find(d => d.id === eventId)?.saidYes ?? [];
        fxPatch('concertPersonnel', eventId, { saidYes: yes ? [...new Set([...cur, personnelId])] : cur.filter(id => id !== personnelId) });
      }
      return;
    }
    const dbRef = db;
    await trackWrite('Said yes', () => setDoc(doc(dbRef, 'concertPersonnel', eventId),
      { saidYes: yes ? arrayUnion(personnelId) : arrayRemove(personnelId), ...stamps() }, { merge: true }));
  }

  /** Register a sheet tab as this concert's roster (bound by its gid), or,
   *  with null, unlink it. The registry: `sheetLinks/concertRoster__<id>`. */
  async function linkSheet(concertId: string, tab: { spreadsheetId: string; sheetId: number } | null) {
    const id = `concertRoster__${concertId}`;
    const data = tab && { ...tab, kind: 'concertRoster' as const, concertId, ...stamps() };
    if (!db) { if (fixtures) fxPatch('sheetLinks', id, data); return; }
    const dbRef = db;
    await trackWrite('Sheet link', () => (data ? setDoc(doc(dbRef, 'sheetLinks', id), data) : deleteDoc(doc(dbRef, 'sheetLinks', id))));
  }

  const sheetLinks = fixtures ? fxApply('sheetLinks', [] as SheetLink[]) : links;
  return { concertDocs: all, sheetLinks, saveSections, setSaidYes, linkSheet };
}
