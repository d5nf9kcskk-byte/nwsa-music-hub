import { resolveAssignedEnsembleIds } from './directorAssignments';
import { resolveMdcContact } from './staffMdcContacts';
import type { Ensemble } from './types';
import type { Director } from './hooks/useDirectors';

/** Public-facing staff on an ensemble/class page — synced from director assignments. */
export interface GroupStaffMember {
  name: string;
  mdcEmail: string;
  phone?: string;
}

export function staffMemberForDirector(
  d: Pick<Director, 'email' | 'name' | 'mdcEmail' | 'phone'>,
): GroupStaffMember | null {
  const contact = resolveMdcContact(d);
  const name = d.name?.trim() || contact?.name;
  if (!name) return null;
  return {
    name,
    mdcEmail: contact?.mdcEmail ?? '',
    phone: d.phone ?? contact?.phone,
  };
}

/** Directors/classroom teachers assigned to this group — never exposes Gmail login. */
export function assignedStaffForGroup(
  ensembleId: string,
  directors: Director[],
  ensembles: Pick<Ensemble, 'id' | 'name'>[],
): GroupStaffMember[] {
  const out: GroupStaffMember[] = [];
  for (const d of directors) {
    if (!resolveAssignedEnsembleIds(d, ensembles).includes(ensembleId)) continue;
    const s = staffMemberForDirector(d);
    if (s) out.push(s);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** What to show on a group page: assignments first, then conductorName lookup. */
export function staffForGroupPage(
  ensemble: Pick<Ensemble, 'id' | 'name' | 'conductorName' | 'staff'>,
  directors: Director[] | null,
  ensembles: Pick<Ensemble, 'id' | 'name'>[],
): GroupStaffMember[] {
  const live = directors ? assignedStaffForGroup(ensemble.id, directors, ensembles) : [];
  if (live.length) return live;
  if (ensemble.staff?.length) return ensemble.staff.filter(s => s.name);
  if (ensemble.conductorName?.trim()) {
    const c = resolveMdcContact({ email: '', name: ensemble.conductorName });
    if (c) return [c];
    return [{ name: ensemble.conductorName.trim(), mdcEmail: '' }];
  }
  return [];
}
