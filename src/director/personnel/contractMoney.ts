import type { Contract, ContractLineItem, RateBasis } from '../types';

/**
 * Money display for the paid roster (#personnel). Every function here takes
 * INTEGER CENTS — the only representation this module stores (see the
 * `ContractLineItem.amountCents` note in types.ts) — and formats at the edge.
 * Totals are integer arithmetic on cents; dollar floats never enter a sum.
 *
 * Shared by the personnel screens (read-only contract rows) and, next, the
 * contract surfaces themselves — keep it presentation-free and additive.
 */

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "$1,234.56" (or "-$12.00" for a deduction). Input is integer cents. */
export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/** Short unit suffix for a per-unit basis; '' for a single agreed sum. */
export function basisSuffix(basis: RateBasis | 'one-time'): string {
  switch (basis) {
    case 'per-service': return '/service';
    case 'per-week':    return '/week';
    case 'hourly':      return '/hour';
    default:            return ''; // 'flat' and 'one-time' are one sum
  }
}

/**
 * One line item's contribution in cents — or null while a per-unit item has
 * no quantity yet. Unknown stays unknown; it never silently becomes ×1.
 */
export function lineItemTotalCents(li: ContractLineItem): number | null {
  if (li.basis === 'one-time' || li.basis === 'flat') return li.amountCents;
  return li.quantity == null ? null : li.amountCents * li.quantity;
}

/**
 * Estimated contract total in cents: base rate × expected quantity plus
 * every line item. Null when any per-unit piece is missing its quantity —
 * the ESTIMATE at issue time (types.ts); actual pay settles against the
 * services later.
 */
export function contractTotalCents(
  c: Pick<Contract, 'baseRateCents' | 'baseRateBasis' | 'baseRateQuantity' | 'lineItems'>,
): number | null {
  let total: number;
  if (c.baseRateBasis === 'flat') total = c.baseRateCents;
  else if (c.baseRateQuantity == null) return null;
  else total = c.baseRateCents * c.baseRateQuantity;
  for (const li of c.lineItems ?? []) {
    const t = lineItemTotalCents(li);
    if (t == null) return null;
    total += t;
  }
  return total;
}
