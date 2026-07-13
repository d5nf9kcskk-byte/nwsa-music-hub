/**
 * Roster spreadsheet import — pure, dependency-free logic (parse, auto-map,
 * dry-run plan). No Firestore here: this computes what WOULD change so the UI
 * can preview it before any write. Ported from the recovered vanilla app's
 * util.js/store.js import helpers.
 */
import type { Student, StudentContact, Guardian, Ensemble } from '../types';

// ── CSV / TSV parsing ───────────────────────────────────────────────────────

/** Parse delimited text into rows of string cells. Handles quoted fields with
 *  "" escapes, CRLF, a leading BOM, and auto-detects tab vs comma. */
export function parseDelimited(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const nl = s.indexOf('\n');
  const firstLine = nl === -1 ? s : s.slice(0, nl);
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell); cell = '';
    } else if (c === '\n') {
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else if (c !== '\r') {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** True if the text is actually a binary Excel/Numbers file (starts with the
 *  ZIP "PK" signature) rather than CSV/TSV. */
export function looksBinary(text: string): boolean {
  return text.slice(0, 2) === 'PK';
}

// ── Header auto-mapping ─────────────────────────────────────────────────────

export type ColMap =
  | { kind: 'student'; field: 'name' | 'first' | 'last' | 'instrument' | 'grade' | 'section' | 'email' | 'ensemble' }
  | { kind: 'guardian'; idx: number; field: 'name' | 'relation' | 'email' | 'phone' }
  | { kind: 'extra' };

const norm = (h: string) => h.trim().toLowerCase();

/** Best-effort map of each header to a target field. Unknown columns are kept
 *  as `extra` (nothing is dropped). */
export function autoMapHeaders(headers: string[]): ColMap[] {
  return headers.map((raw): ColMap => {
    const h = norm(raw);
    // Guardian groups first (so "Parent Email" doesn't match the student email).
    if (/parent|guardian|mother|father|\bmom\b|\bdad\b|emergency|contact/.test(h)) {
      const digit = h.match(/(\d+)/);
      const idx = digit ? Math.max(1, parseInt(digit[1], 10)) : 1;
      const field: 'name' | 'relation' | 'email' | 'phone' =
        /e-?mail/.test(h) ? 'email'
        : /phone|cell|mobile|tel\b/.test(h) ? 'phone'
        : /relation/.test(h) ? 'relation'
        : 'name';
      return { kind: 'guardian', idx, field };
    }
    if (/^(student\s*)?full\s*name$|^(student\s*)?name$|^student$/.test(h)) return { kind: 'student', field: 'name' };
    if (/first\s*name|^first$|given/.test(h)) return { kind: 'student', field: 'first' };
    if (/last\s*name|^last$|surname|family/.test(h)) return { kind: 'student', field: 'last' };
    if (/instrument|voice\s*part/.test(h)) return { kind: 'student', field: 'instrument' };
    if (/grade|year\s*level/.test(h)) return { kind: 'student', field: 'grade' };
    if (/section|chair|\bpart\b/.test(h)) return { kind: 'student', field: 'section' };
    if (/ensemble|group|class|orchestra|band|choir/.test(h)) return { kind: 'student', field: 'ensemble' };
    if (/e-?mail/.test(h)) return { kind: 'student', field: 'email' };
    return { kind: 'extra' };
  });
}

// ── Row → import record ─────────────────────────────────────────────────────

export interface ImportRow {
  name: string;              // "Last, First" (matches the app's stored form)
  instrument?: string;
  grade?: string;
  section?: string;
  email?: string;            // student email
  ensembleIds: string[];
  guardians: Guardian[];
  extra: Record<string, string>;
}

/** "First Last" → "Last, First"; leaves an already-"Last, First" value alone. */
function toLastFirst(name: string): string {
  const n = name.trim();
  if (!n) return n;
  if (n.includes(',')) return n;
  const parts = n.split(/\s+/);
  if (parts.length < 2) return n;
  const last = parts.pop()!;
  return `${last}, ${parts.join(' ')}`;
}

const clean = (v: string | undefined) => (v ?? '').trim();

export function buildImportRows(rows: string[][], map: ColMap[], ensembles: Ensemble[], defaultEnsembleId: string): ImportRow[] {
  const ensByName = new Map(ensembles.map(e => [norm(e.name), e.id]));
  const headers = rows[0];
  return rows.slice(1).map(cells => {
    let name = '', first = '', last = '';
    let instrument = '', grade = '', section = '', email = '';
    const ensembleIds = new Set<string>();
    const guardianMap = new Map<number, Guardian>();
    const extra: Record<string, string> = {};
    map.forEach((m, i) => {
      const v = clean(cells[i]);
      if (!v) return;
      if (m.kind === 'extra') { extra[headers[i] || `col${i}`] = v; return; }
      if (m.kind === 'guardian') {
        const g: Guardian = guardianMap.get(m.idx) ?? {};
        g[m.field] = v;
        guardianMap.set(m.idx, g);
        return;
      }
      switch (m.field) {
        case 'name': name = v; break;
        case 'first': first = v; break;
        case 'last': last = v; break;
        case 'instrument': instrument = v; break;
        case 'grade': grade = v; break;
        case 'section': section = v; break;
        case 'email': email = v; break;
        case 'ensemble': { const id = ensByName.get(norm(v)); if (id) ensembleIds.add(id); break; }
      }
    });
    const fullName = name ? toLastFirst(name) : (last || first) ? `${last}, ${first}`.replace(/^, |, $/g, '') : '';
    if (defaultEnsembleId && ensembleIds.size === 0) ensembleIds.add(defaultEnsembleId);
    const guardians = [...guardianMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, g]) => g)
      .filter(g => g.name || g.email || g.phone);
    return { name: fullName, instrument, grade, section, email, ensembleIds: [...ensembleIds], guardians, extra };
  }).filter(r => r.name);
}

// ── Dry-run merge plan ──────────────────────────────────────────────────────

/** Order-independent match key: sorted, punctuation-stripped name tokens, so
 *  "Green, Piper" and "Piper Green" match. */
export function matchKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

export interface MergePlan {
  creates: ImportRow[];
  updates: { row: ImportRow; student: Student; changes: string[] }[];
  unchanged: number;
  ambiguous: { row: ImportRow; matches: Student[] }[];
}

function diffStudent(row: ImportRow, student: Student, contact: StudentContact | undefined): string[] {
  const ch: string[] = [];
  if (row.instrument && row.instrument !== student.instrument) ch.push('instrument');
  if (row.grade && row.grade !== (student.grade ?? '')) ch.push('grade');
  if (row.section && row.section !== (student.section ?? '')) ch.push('section');
  const newParentEmail = row.guardians[0]?.email ?? '';
  const newPhone = row.guardians[0]?.phone ?? '';
  if ((row.email && row.email !== (contact?.email ?? '')) ||
      (newParentEmail && newParentEmail !== (contact?.parentEmail ?? '')) ||
      (newPhone && newPhone !== (contact?.phone ?? '')) ||
      (row.guardians.length > (contact?.guardians?.length ?? 0))) ch.push('contacts');
  return ch;
}

export function planMerge(
  rows: ImportRow[],
  existing: Student[],
  contacts: Record<string, StudentContact>,
  mode: 'merge' | 'add',
): MergePlan {
  const byKey = new Map<string, Student[]>();
  for (const s of existing) {
    const k = matchKey(s.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(s);
  }
  const plan: MergePlan = { creates: [], updates: [], unchanged: 0, ambiguous: [] };
  for (const row of rows) {
    const matches = byKey.get(matchKey(row.name)) ?? [];
    if (matches.length === 0) { plan.creates.push(row); continue; }
    if (mode === 'add') { plan.unchanged++; continue; } // matches someone → skip in add-only mode
    if (matches.length > 1) { plan.ambiguous.push({ row, matches }); continue; }
    const student = matches[0];
    const changes = diffStudent(row, student, contacts[student.id]);
    if (changes.length === 0) plan.unchanged++;
    else plan.updates.push({ row, student, changes });
  }
  return plan;
}

/** Build the contact doc for a row, keeping the flat trio in sync with the
 *  primary guardian for back-compat. Returns null when there's nothing to store. */
export function contactFromRow(row: ImportRow): Omit<StudentContact, 'id'> | null {
  const g0 = row.guardians[0];
  const hasAny = row.email || row.guardians.length > 0 || Object.keys(row.extra).length > 0;
  if (!hasAny) return null;
  return {
    email: row.email || '',
    parentEmail: g0?.email || '',
    phone: g0?.phone || '',
    guardians: row.guardians,
    ...(Object.keys(row.extra).length ? { extra: row.extra } : {}),
  };
}
