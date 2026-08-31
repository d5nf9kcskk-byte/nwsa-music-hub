/**
 * One CSV cell. The ONE definition — attendance, lessons, sign-ups and
 * concert check-in all export through it.
 *
 * There were four identical copies of the RFC 4180 quoting rule until the
 * concert check-in's college door started letting the public type the name
 * that lands in a cell (#concert-checkin). At that point the missing half of
 * the rule stopped being theoretical, and patching one copy would have left
 * the sign-ups export — which has taken public free text since the `'open'`
 * audience shipped — still wrong.
 *
 * Two jobs:
 *
 *   1. RFC 4180 quoting, so a comma or a newline inside a value cannot invent
 *      a column or a row.
 *   2. Neutralising a FORMULA. Excel, Numbers and Sheets all evaluate a cell
 *      whose text begins with = + - @ (or a tab/CR before one), so a person
 *      who types `=HYPERLINK("http://…","Click")` as their name is writing
 *      code into a spreadsheet a director will open. Quoting does not stop
 *      it — the quotes are stripped before the formula is read. A leading
 *      apostrophe does: it is the spreadsheet's own "this is text" marker,
 *      and it is not shown in the cell.
 *
 * Deliberately no ORG import and no DOM: scripts/sync-drive-photos.mjs pulls
 * checkinCsv.ts in under plain node, and everything it reaches has to load
 * there too.
 */

/** Leading characters a spreadsheet treats as the start of a formula. The tab
 *  and carriage return are in the set because they are skipped before the
 *  first significant character is read. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  const safe = FORMULA_LEAD.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
