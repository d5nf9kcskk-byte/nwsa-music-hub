import { parseDelimited } from '../roster/rosterCsv.ts';
import { parseCentsInput } from './contractMoney.ts';
import type { PayMethod, PersonnelContact } from '../types.ts';

/**
 * Pure half of the personnel importer (#personnel): spreadsheet text in, a
 * plan out. No Firestore here, so the preview can show exactly what would be
 * written and the self-check can run it under plain node.
 *
 * THIS FILE IS THE ONLY GUARD against a taxpayer id or bank number arriving
 * by import. firestore.rules cannot look inside `extra` (a map of free text),
 * so any column that looks like one is refused outright, and so is any cell
 * that is shaped like an SSN or EIN.
 */

export interface ImportPerson {
  /** "Last, First": the form the roster stores and sorts by. */
  name: string;
  instrument?: string;
  section?: string;
  seat?: number;
  status: 'Contracted' | 'SubList';
  email?: string;
  phone?: string;
  address?: string;
  payMethod?: PayMethod;
  payHandle?: string;
  w9Status?: NonNullable<PersonnelContact['w9Status']>;
  position?: string;
  /** Per-service rate in cents when `services` is given, else one flat sum. */
  feeCents?: number;
  services?: number;
  extra: Record<string, string>;
}

export interface ImportPlan {
  people: ImportPerson[];
  /** Rows left out (blank name, already on the roster, repeated in the file). */
  skipped: string[];
  /** Things worth saying that did not stop a row. */
  notes: string[];
  /** Set when the whole file is refused; `people` is then empty. */
  refused?: string;
}

const REFUSED_HEADER = /\b(ssn|social\s*sec\w*|tin|ein|tax\s*(payer)?\s*(id|no|num)\w*|routing|account\s*(no|num)\w*|bank|iban|card\s*(no|num)\w*|credit\s*card|debit)\b/i;
const SSN_SHAPE = /^\d{3}-?\d{2}-?\d{4}$/;
const EIN_SHAPE = /^\d{2}-\d{7}$/;

/** A value shaped like a Social Security or employer id: never stored. The
 *  importer refuses a file holding one; the Personnel card refuses the field. */
export function refusedCell(v: string): boolean {
  const t = v.trim();
  return SSN_SHAPE.test(t) || EIN_SHAPE.test(t);
}

type Field =
  | 'name' | 'first' | 'last' | 'instrument' | 'section' | 'seat' | 'status' | 'email' | 'phone'
  | 'address' | 'payMethod' | 'payHandle' | 'w9' | 'position' | 'fee' | 'services' | 'extra';

/** Which field a header names. Specific before general: "Pay method" must
 *  not fall into the fee column. */
export function fieldFor(raw: string): Field {
  const h = raw.trim().toLowerCase();
  if (/pay(ment)?\s*(method|type)|paid\s*by|^method$/.test(h)) return 'payMethod';
  if (/handle|zelle|venmo|paypal|pay\s*(to|id)/.test(h)) return 'payHandle';
  if (/w-?9/.test(h)) return 'w9';
  if (/^(full\s*)?name$|^player$|^musician$/.test(h)) return 'name';
  if (/first\s*name|^first$|given/.test(h)) return 'first';
  if (/last\s*name|^last$|surname|family/.test(h)) return 'last';
  if (/instrument/.test(h)) return 'instrument';
  if (/section|^part$/.test(h)) return 'section';
  if (/^(seat|chair|stand)$/.test(h)) return 'seat';
  if (/status|sub\s*list/.test(h)) return 'status';
  if (/e-?mail/.test(h)) return 'email';
  if (/phone|cell|mobile|^tel/.test(h)) return 'phone';
  if (/address/.test(h)) return 'address';
  if (/^(position|role)$/.test(h)) return 'position';
  if (/services|calls|# ?of/.test(h)) return 'services';
  if (/fee|rate|^pay$|amount/.test(h)) return 'fee';
  return 'extra';
}

/** "Rania Khoury" -> "Khoury, Rania"; "Khoury, Rania" is left alone. */
export function toLastFirst(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n || n.includes(',')) return n;
  const parts = n.split(' ');
  if (parts.length < 2) return n;
  const last = parts.pop()!;
  return `${last}, ${parts.join(' ')}`;
}

const nameKey = (n: string) => toLastFirst(n).toLowerCase();

function methodOf(v: string): PayMethod | undefined {
  const t = v.toLowerCase();
  return (['zelle', 'venmo', 'paypal', 'check'] as const).find(m => t.includes(m)) ?? (t.includes('cheque') ? 'check' : undefined);
}

export function planPersonnelImport(text: string, existingNames: string[]): ImportPlan {
  const out: ImportPlan = { people: [], skipped: [], notes: [] };
  const rows = parseDelimited(text);
  if (rows.length < 2) { out.refused = 'Nothing to import: the first row should be the column headings, then one person per row.'; return out; }
  const headers = rows[0].map(h => h.trim());
  const bad = headers.find(h => REFUSED_HEADER.test(h));
  if (bad) {
    out.refused = `The column “${bad}” looks like a taxpayer id or bank number. The Hub never stores those. Remove the column and import again.`;
    return out;
  }
  const cellBad = rows.slice(1).flat().find(refusedCell);
  if (cellBad !== undefined) {
    out.refused = 'A cell is shaped like a Social Security or employer id number. The Hub never stores those. Remove it and import again.';
    return out;
  }
  const fields = headers.map(fieldFor);
  if (!fields.includes('name') && !(fields.includes('first') && fields.includes('last'))) {
    out.refused = 'No name column found. Use a heading like “Name”, or “First name” and “Last name”.';
    return out;
  }
  const seen = new Set(existingNames.map(nameKey));
  rows.slice(1).forEach((cells, r) => {
    const at = `Row ${r + 2}`;
    const p: ImportPerson = { name: '', status: 'Contracted', extra: {} };
    let first = '', last = '', feeText = '', impliedMethod: PayMethod | undefined;
    fields.forEach((f, i) => {
      const v = (cells[i] ?? '').trim();
      if (!v) return;
      switch (f) {
        case 'name': p.name = toLastFirst(v); break;
        case 'first': first = v; break;
        case 'last': last = v; break;
        case 'instrument': p.instrument = v; break;
        case 'section': p.section = v; break;
        case 'seat': if (/^\d+$/.test(v) && Number(v) >= 1) p.seat = Number(v); break;
        case 'status': if (/sub/i.test(v)) p.status = 'SubList'; break;
        case 'email': p.email = v; break;
        case 'phone': p.phone = v; break;
        case 'address': p.address = v; break;
        case 'payMethod': p.payMethod = methodOf(v); break;
        case 'payHandle': p.payHandle = v.slice(0, 120); impliedMethod = methodOf(headers[i]); break;
        case 'w9': p.w9Status = /^(y|yes|true|on.?file|received|x)$/i.test(v) ? 'on-file' : /request/i.test(v) ? 'requested' : 'not-requested'; break;
        case 'position': p.position = v; break;
        case 'fee': feeText = v; break;
        case 'services': if (/^\d+$/.test(v)) p.services = Number(v); break;
        case 'extra': p.extra[headers[i] || `col${i + 1}`] = v.slice(0, 500); break;
      }
    });
    if (!p.name && first && last) p.name = `${last}, ${first}`;
    if (!p.name) { out.skipped.push(`${at}: no name`); return; }
    const key = nameKey(p.name);
    if (seen.has(key)) { out.skipped.push(`${at}: ${p.name} is already on the roster or earlier in the file`); return; }
    seen.add(key);
    if (!p.payMethod && impliedMethod) p.payMethod = impliedMethod;
    if (feeText) {
      const cents = parseCentsInput(feeText);
      if (cents == null) out.notes.push(`${at}: ${p.name}: “${feeText}” is not a dollar amount, so no contract draft was made`);
      else p.feeCents = cents;
    }
    out.people.push(p);
  });
  return out;
}

/** The contract draft's shape for a person, or null when they have no fee. */
export function draftContractFor(p: ImportPerson) {
  if (p.feeCents == null) return null;
  const podium = /conductor|director/i.test(p.position ?? '');
  return {
    category: podium ? 'podium' as const : p.instrument ? 'chair' as const : 'staff' as const,
    position: p.position || (podium ? 'Conductor' : p.instrument ? (p.status === 'SubList' ? 'Substitute' : 'Section') : 'Staff'),
    baseRateCents: p.feeCents,
    baseRateBasis: p.services ? 'per-service' as const : 'flat' as const,
    ...(p.services ? { baseRateQuantity: p.services } : {}),
  };
}
