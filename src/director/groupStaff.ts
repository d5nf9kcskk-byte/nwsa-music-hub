import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { assignedStaffForGroup } from './groupStaffCore';
import type { Ensemble } from './types';
import type { Director } from './hooks/useDirectors';

export type { GroupStaffMember } from './groupStaffCore';
export { staffMemberForDirector, assignedStaffForGroup, staffForGroupPage } from './groupStaffCore';

/** Mirror assigned staff onto each ensemble doc so the public site can read it. */
export async function syncAllEnsembleStaff(
  directors: Director[],
  ensembles: Pick<Ensemble, 'id' | 'name'>[],
): Promise<void> {
  if (!db || ensembles.length === 0) return;
  const batch = writeBatch(db);
  for (const e of ensembles) {
    const staff = assignedStaffForGroup(e.id, directors, ensembles);
    batch.update(doc(db, 'ensembles', e.id), { staff });
  }
  await batch.commit();
}
