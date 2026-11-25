import { collection, doc, writeBatch, type Firestore, type WriteBatch } from 'firebase/firestore';
import { draftContractFor, type ImportPerson } from './importPlan';

/** 150 people × 3 docs = 450 writes, under Firestore's 500-write batch cap. */
const PER_BATCH = 150;

export type ImportStamp = Record<string, string | number | undefined>;

/**
 * Write an import plan: personnel doc, private contact doc, Draft contract
 * per person. `commit` lets the dialog wrap each batch in trackWrite while a
 * script (the emulator check) commits plainly. Split from PersonnelImport.tsx
 * so the emulator exercises the same code the dialog runs.
 */
export async function writeImport(
  db: Firestore, people: ImportPerson[], ensembleId: string, stamp: ImportStamp,
  commit: (b: WriteBatch) => Promise<unknown> = b => b.commit(),
) {
  for (let i = 0; i < people.length; i += PER_BATCH) {
    const batch = writeBatch(db);
    for (const p of people.slice(i, i + PER_BATCH)) {
      const ref = doc(collection(db, 'personnel'));
      const section = p.section ?? p.instrument;
      const ensembleIds = ensembleId ? [ensembleId] : [];
      batch.set(ref, {
        name: p.name, status: p.status, ensembleIds, ...stamp,
        ...(p.instrument ? { instrument: p.instrument } : {}),
        ...(section ? { section } : {}),
        ...(p.seat ? { seat: p.seat } : {}),
      });
      const contact = {
        ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}),
        ...(p.address ? { address: p.address } : {}), ...(p.payMethod ? { payMethod: p.payMethod } : {}),
        ...(p.payHandle ? { payHandle: p.payHandle } : {}), ...(p.w9Status ? { w9Status: p.w9Status } : {}),
        ...(Object.keys(p.extra).length ? { extra: p.extra } : {}),
      };
      if (Object.keys(contact).length) batch.set(doc(db, 'personnelContacts', ref.id), contact);
      const d = draftContractFor(p);
      if (d) {
        batch.set(doc(collection(db, 'contracts')), {
          personnelId: ref.id, personnelName: p.name, ...d, status: 'Draft',
          ...(section && d.category === 'chair' ? { section } : {}),
          ...(p.seat && d.category === 'chair' ? { seat: p.seat } : {}),
          ensembleIds, createdAt: Date.now(), ...stamp,
        });
      }
    }
    await commit(batch);
  }
}
