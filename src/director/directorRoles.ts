/**
 * Multi-role resolution for directors/{email} docs (#roles).
 * Dependency-free so rules selfchecks and hooks can share it.
 */
import type { StaffRole } from './types';
import { STAFF_ROLE_LABEL } from './types';

export type DirectorRole = StaffRole;

export type DirectorRoleFields = {
  role?: DirectorRole;
  roles?: DirectorRole[];
};

/** Highest-privilege role first — used for audit attribution and log labels. */
const ROLE_PRIORITY: DirectorRole[] = ['owner', 'director', 'teacher', 'assistant'];

/** Resolved role list — supports legacy single `role` and new `roles[]`. */
export function directorRoles(d: DirectorRoleFields | undefined | null): DirectorRole[] {
  if (!d) return ['director'];
  if (d.roles?.length) return d.roles;
  if (d.role) return [d.role];
  return ['director'];
}

export function hasDirectorRole(
  d: DirectorRoleFields | undefined | null,
  role: DirectorRole,
): boolean {
  return directorRoles(d).includes(role);
}

/** Owner or Director — full edit access except the Directors list (owner only). */
export function isStaffMember(d: DirectorRoleFields | undefined | null): boolean {
  const roles = directorRoles(d);
  return roles.includes('owner') || roles.includes('director');
}

/** Primary role for attribution / sign-in log — highest privilege wins. */
export function primaryDirectorRole(d: DirectorRoleFields | undefined | null): DirectorRole {
  const roles = directorRoles(d);
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return 'director';
}

/** @deprecated Use `directorRoles()` / `hasDirectorRole()` — alias of primary. */
export function directorRole(d: DirectorRoleFields | undefined | null): DirectorRole {
  return primaryDirectorRole(d);
}

/** Labels for the Directors list, e.g. "Director · Applied Teacher". */
export function directorRoleLabels(d: DirectorRoleFields | undefined | null): string {
  return directorRoles(d).map(r => STAFF_ROLE_LABEL[r]).join(' · ');
}
