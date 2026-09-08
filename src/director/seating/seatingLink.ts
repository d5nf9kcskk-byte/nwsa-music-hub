import { ORG } from '../../org';

/**
 * Where a published seating chart lives (#seating-link).
 *
 * Charts used to render only INSIDE the ensemble page and the piece page, so
 * there was nothing to hand anyone: "the seating is on the Camerata page,
 * scroll past the repertoire" is not a link. A chart is a page of its own now
 * (src/public/PublicSeating.tsx, route `seating/:id` in main.tsx), and this is
 * the ONE spelling of its address — the editor's copy button, the announcement
 * a chart posts about itself, and the link picker all read it from here rather
 * than each writing the path out.
 *
 * Nothing new is published by having an address. `seatingCharts` is already a
 * world read in firestore.rules and the page shows the same `studentsPublic`
 * names the ensemble page does; this is a second door, not a widening.
 */

/** In-app path — what an announcement link or a router <Link> carries. */
export function seatingChartPath(chartId: string): string {
  return `/seating/${chartId}`;
}

/** Full address — what a director copies to paste into a text or an email. */
export function seatingChartUrl(chartId: string): string {
  return `${ORG.publicUrl.replace(/\/$/, '')}${seatingChartPath(chartId)}`;
}
