import type { AssignmentType } from '../types';

/**
 * A playing exam's instructions are a page of typed text — eighteen parts,
 * one per instrument — and until now the only copy of it lived in React state
 * until Save. One stray tap on the backdrop, one phone call, one reload, and
 * it was gone (#assignment-draft). So every keystroke goes to localStorage as
 * it is typed, and the form opens on whatever is there.
 *
 * Deliberately NOT Firestore: a half-written exam in `assignments` is a
 * published exam — the collection is world-readable and the student site
 * lists what it finds. A draft is this browser's business until Save.
 *
 * Three fields are deliberately left out. `attachments` are uploaded to
 * Storage and already survive on their own; `publishAt` and `rubric` both
 * carry a meaningful "not set" that JSON cannot tell from "absent" — the same
 * trap the pendingActions CLEAR sentinel exists for — and getting either
 * wrong would quietly change when an exam posts or how it is scored, which is
 * worse than retyping them.
 */
export interface AssignmentDraft {
  title: string;
  type: AssignmentType;
  description: string;
  dueDate: string;
  ensembleIds: string[];
  studentIds: string[];
  formUrl: string;
  acceptsVideo: boolean;
  maxVideoMinutes: number;
  maxVideoSizeMB: number;
  googleDriveFolderId: string;
  pieceIds: string[];
  savedAt: number;
}

/** One key per assignment, so editing Exam #1 never restores Exam #2's draft,
 *  and the unsaved new one has a slot of its own. */
export function assignmentDraftKey(assignmentId?: string): string {
  return `dir.assignment.draft.${assignmentId ?? 'new'}`;
}

export function readDraft(key: string): Partial<AssignmentDraft> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Partial<AssignmentDraft>;
  } catch {
    // Private mode, cleared site data, or a corrupt value. A form that opens
    // empty is fine; a form that throws on open is not.
    return null;
  }
}

export function writeDraft(key: string, draft: Omit<AssignmentDraft, 'savedAt'>): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* quota or private mode — the form still works, it just won't survive */ }
}

export function clearDraft(key: string): void {
  try { localStorage.removeItem(key); } catch { /* nothing to clean up */ }
}

/** "Saved 2 minutes ago", for the line under the title. */
export function draftAge(savedAt?: number, now = Date.now()): string {
  if (!savedAt) return '';
  const mins = Math.floor((now - savedAt) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
