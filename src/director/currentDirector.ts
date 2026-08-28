/**
 * The signed-in director's resolved identity (name / roles / teacher scope),
 * cached outside React (mirrors the writeStatus.ts external-store pattern) so
 * write hooks — which aren't components and don't get props — can stamp
 * "who changed this" without threading the value through every call site.
 * Populated once by AuthGate right after the director's Firestore doc is
 * confirmed; cleared on sign-out.
 */
import { useSyncExternalStore } from 'react';
import {
  directorRoles,
  hasDirectorRole,
  isStaffMember,
  primaryDirectorRole,
} from './directorRoles';
import type { Director, DirectorRole } from './hooks/useDirectors';

export interface CurrentDirector {
  email: string;
  /** Resolved display name: the director doc's `name`, else the signed-in
   *  Google account's display name, else the email. Never blank. */
  name: string;
  /** All assigned access levels — may include director + teacher, etc. */
  roles: DirectorRole[];
  /** Primary role for attribution — highest privilege among `roles`. */
  role: DirectorRole;
  instruments: string[];
  assignedStudentIds: string[];
  /** Assistant-only: ensembles this Personnel Assistant may take roll for. */
  assignedEnsembleIds: string[];
}

let current: CurrentDirector | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

/** Called by AuthGate once the signed-in user's director doc is confirmed. */
export function setCurrentDirector(directorDoc: Director, googleDisplayName?: string | null) {
  const roles = directorRoles(directorDoc);
  current = {
    email: directorDoc.email,
    name: directorDoc.name?.trim() || googleDisplayName?.trim() || directorDoc.email,
    roles,
    role: primaryDirectorRole(directorDoc),
    instruments: directorDoc.instruments ?? [],
    assignedStudentIds: directorDoc.assignedStudentIds ?? [],
    assignedEnsembleIds: directorDoc.assignedEnsembleIds ?? [],
  };
  emit();
}

export function clearCurrentDirector() {
  current = null;
  emit();
}

/** Synchronous reads for use inside write functions (hooks), not components. */
export function currentDirectorName(): string | undefined {
  return current?.name;
}
export function currentDirectorEmail(): string | undefined {
  return current?.email;
}
export function currentDirectorRole(): DirectorRole {
  return current?.role ?? 'director';
}
export function currentDirectorRoles(): DirectorRole[] {
  return current?.roles ?? ['director'];
}
export function currentDirectorHasRole(role: DirectorRole): boolean {
  return hasDirectorRole(current, role);
}
export function currentDirectorIsStaff(): boolean {
  return isStaffMember(current);
}

export function useCurrentDirector(): CurrentDirector | null {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
    () => null,
  );
}
