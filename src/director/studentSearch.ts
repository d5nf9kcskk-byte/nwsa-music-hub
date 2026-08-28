import type { Student } from './types';

/** Searchable strings for a student — name, instrument, grade (incl. digits). */
export function studentSearchFields(
  s: Pick<Student, 'name' | 'preferredName' | 'instrument' | 'grade'>,
): string[] {
  const grade = String(s.grade ?? '').trim();
  const digits = grade.replace(/\D/g, '');
  const out = [s.name, s.preferredName, s.instrument, grade];
  if (digits && digits !== grade) out.push(digits);
  if (digits) out.push(`grade ${digits}`);
  return out.filter((x): x is string => !!x && x.length > 0);
}

/** True when query matches any studentSearchFields value (case-insensitive). */
export function studentMatchesQuery(
  s: Pick<Student, 'name' | 'preferredName' | 'instrument' | 'grade'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return studentSearchFields(s).some(f => f.toLowerCase().includes(q));
}
