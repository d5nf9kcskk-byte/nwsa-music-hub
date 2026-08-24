import type { Contract, ContractTemplate } from '../types.ts';
import { formatCents, basisSuffix, contractTotalCents } from './contractMoney.ts';

/**
 * Contract prose for the paid roster (#personnel): the `{{placeholder}}`
 * vocabulary, the resolver that fills tokens from a Contract's STRUCTURED
 * fields, and the neutral starter templates the editor offers.
 *
 * The prose never becomes a second source of truth for the numbers: a
 * template's `bodyText` holds tokens, a contract freezes that text verbatim
 * at issue (`termsText` + `templateId`/`templateVersion`), and the numbers
 * are substituted at RENDER time from the same structured fields the rules
 * freeze once the contract is signed. Editing a template after issue
 * therefore never changes anyone's terms, and a rate never lives in two
 * places.
 *
 * Imported by the personnel screens AND by scripts/seed-as-org.mjs (Node
 * strips the types — the generate-feeds pattern), which is why imports here
 * carry explicit `.ts` extensions and why this module must stay free of
 * browser/org globals: the org name is an argument, not an ORG read.
 */

/** The tokens the resolver understands, with the help text the editor shows. */
export const CONTRACT_TOKENS: { token: string; meaning: string }[] = [
  { token: '{{orgName}}',   meaning: 'the organization’s full name' },
  { token: '{{name}}',      meaning: 'the person’s name as stamped on the contract' },
  { token: '{{position}}',  meaning: 'the contracted position, e.g. Principal' },
  { token: '{{section}}',   meaning: 'the contracted section, e.g. Violin I' },
  { token: '{{seat}}',      meaning: 'the contracted seat number' },
  { token: '{{season}}',    meaning: 'the season label, e.g. 2026-27' },
  { token: '{{startDate}}', meaning: 'the engagement start date, written out' },
  { token: '{{endDate}}',   meaning: 'the engagement end date, written out' },
  { token: '{{baseRate}}',  meaning: 'the base rate with its basis, e.g. $150.00/service' },
  { token: '{{quantity}}',  meaning: 'the expected number of services / weeks / hours' },
  { token: '{{estimatedTotal}}', meaning: 'the estimated total including line items' },
];

/** "2026-09-01" → "September 1, 2026". Anything unparsable passes through. */
function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Fill `{{placeholder}}` tokens in contract prose from the contract's
 * structured fields. A KNOWN token whose field is empty renders an em dash —
 * a visible gap on the printed page beats silently vanishing text. An
 * UNKNOWN token is left verbatim, so a typo in a template shows up as
 * exactly what it is instead of disappearing.
 */
export function resolveContractTokens(
  text: string,
  c: Pick<Contract,
    'personnelName' | 'position' | 'section' | 'seat' | 'season'
    | 'startDate' | 'endDate'
    | 'baseRateCents' | 'baseRateBasis' | 'baseRateQuantity' | 'lineItems'>,
  orgName: string,
): string {
  const total = contractTotalCents(c);
  const values: Record<string, string | undefined> = {
    orgName: orgName,
    name: c.personnelName,
    position: c.position || undefined,
    section: c.section || undefined,
    seat: c.seat != null ? String(c.seat) : undefined,
    season: c.season || undefined,
    startDate: c.startDate ? longDate(c.startDate) : undefined,
    endDate: c.endDate ? longDate(c.endDate) : undefined,
    baseRate: `${formatCents(c.baseRateCents)}${basisSuffix(c.baseRateBasis)}`,
    quantity: c.baseRateQuantity != null ? String(c.baseRateQuantity) : undefined,
    estimatedTotal: total != null ? formatCents(total) : undefined,
  };
  return text.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (raw, key: string) =>
    key in values ? (values[key] ?? '—') : raw);
}

/**
 * Neutral starter templates, one per position category. DELIBERATELY
 * placeholder language: building from a real Alpharetta Symphony agreement
 * was considered and declined as too invasive (docs/fair-copy/as-demo-plan.md),
 * and each starter says so in its own closing line. Real language pastes
 * over `bodyText` later without touching the schema — that is the whole
 * point of keeping prose out of the structured fields.
 */
export const STARTER_TEMPLATES: Pick<ContractTemplate, 'name' | 'category' | 'bodyText'>[] = [
  {
    name: 'Musician engagement (per service)',
    category: 'chair',
    bodyText:
      '{{orgName}} (the “Orchestra”) engages {{name}} (the “Musician”) '
      + 'as {{position}}, {{section}}, for the {{season}} season, '
      + 'from {{startDate}} through {{endDate}}.\n\n'
      + 'The Orchestra will compensate the Musician at {{baseRate}} for an expected '
      + '{{quantity}} services, plus any additional amounts itemized in this agreement, '
      + 'for an estimated total of {{estimatedTotal}}. Actual compensation is settled '
      + 'against services performed.\n\n'
      + 'Attendance at contracted services is required. A Musician unable to attend a '
      + 'service must arrange a substitute with the personnel manager in advance. '
      + 'Compensation is paid within fourteen days of the close of each concert cycle.\n\n'
      + 'This is generic placeholder language for demonstration — it is not the '
      + 'Orchestra’s agreement text and creates no obligation.',
  },
  {
    name: 'Podium engagement',
    category: 'podium',
    bodyText:
      '{{orgName}} (the “Orchestra”) engages {{name}} as {{position}} '
      + 'for the {{season}} season, from {{startDate}} through {{endDate}}.\n\n'
      + 'The engagement covers musical preparation and direction of the Orchestra’s '
      + 'rehearsals and performances as scheduled for the season. The Orchestra will '
      + 'compensate the engaged artist at {{baseRate}}, plus any additional amounts '
      + 'itemized in this agreement, for an estimated total of {{estimatedTotal}}.\n\n'
      + 'Programming, scheduling, and personnel decisions are made in consultation with '
      + 'the Orchestra’s leadership.\n\n'
      + 'This is generic placeholder language for demonstration — it is not the '
      + 'Orchestra’s agreement text and creates no obligation.',
  },
  {
    name: 'Staff agreement',
    category: 'staff',
    bodyText:
      '{{orgName}} (the “Orchestra”) engages {{name}} as {{position}} '
      + 'for the {{season}} season, from {{startDate}} through {{endDate}}.\n\n'
      + 'The Orchestra will compensate the staff member at {{baseRate}}, plus any '
      + 'additional amounts itemized in this agreement, for an estimated total of '
      + '{{estimatedTotal}}. Duties are as agreed with the Orchestra’s leadership '
      + 'and may be adjusted by mutual consent.\n\n'
      + 'This is generic placeholder language for demonstration — it is not the '
      + 'Orchestra’s agreement text and creates no obligation.',
  },
];
