#!/usr/bin/env node
/**
 * seed-as-org.mjs — Alpharetta Symphony demo sandbox seeder (#personnel).
 *
 * Populates the as-hub-demo Firebase project with a complete, FICTIONAL
 * demo season for the Alpharetta Symphony — the adult, semi-professional
 * org (docs/fair-copy/as-demo-plan.md). Follows scripts/seed-demo-org.mjs,
 * with the paid-roster collections in place of students: personnel (+
 * personnelContacts), contracts spanning every position category, the real
 * 2026-27 season concert dates, repertoire, and announcements. NO students,
 * NO public mirrors (the paid roster has none by design — firestore.rules
 * #personnel), and NO attendance records (the ServiceAttendance model is
 * decided but not built — do not seed data no rule or type exists for).
 *
 * SAFETY: hard-aborts unless the service account's project is exactly
 * `as-hub-demo` — this script must be physically unable to touch the NWSA
 * production project or the ASYO demo. Every person here is FICTIONAL: the
 * real Alpharetta Symphony publishes its musician, board, and staff pages,
 * and none of that goes into seed data (as-demo-plan.md).
 *
 * The seed writes with the Admin SDK, which bypasses firestore.rules — so
 * every doc below is shaped to the same key allowlists the rules pin
 * (#personnel in firestore.rules; types in src/director/types.ts). Money is
 * INTEGER CENTS everywhere and the field names say so.
 *
 * Idempotent: fixed doc ids + set() overwrite, so re-running resets the
 * sandbox to a clean demo state (extra docs demo users created are left
 * alone).
 *
 * Run:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat as-hub-demo-key.json)" \
 *     node scripts/seed-as-org.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEMO_PROJECT_ID = 'as-hub-demo';

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — aborting.');
  process.exit(1);
}
if (serviceAccount.project_id !== DEMO_PROJECT_ID) {
  console.error(
    `REFUSING to run: service account is for "${serviceAccount.project_id}", `
    + `and this script only ever seeds "${DEMO_PROJECT_ID}". `
    + 'Never point demo seeds at a production project.',
  );
  process.exit(1);
}

if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** YYYY-MM-DD, offsetDays from today (local time). */
function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
/** Next date ≥ today+minOffset that falls on `weekday` (0=Sun). */
function nextWeekday(weekday, minOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + minOffset);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}
function isoOf(date) { return date.toISOString().slice(0, 10); }

// ── Directors ──────────────────────────────────────────────────────────────
// Owner first; the AS personnel manager + music director get added from the
// in-app Directors screen after first sign-in (self-service, no redeploy).
//
// This MUST be an address that can complete a GOOGLE sign-in — that is the
// only provider the app offers. Seeding a non-Google address here locks
// everyone out of the demo's director side entirely: the owner is the only
// role that can add directors, so there is no way back in from the app. That
// happened once with a Yahoo address on the ASYO demo; hence the check below
// and the DEMO_OWNER_EMAIL override, so a wrong guess is fixed by re-running
// the seeder rather than by editing this file.
const OWNER_EMAIL = (process.env.DEMO_OWNER_EMAIL || 'nwsaorchestras@gmail.com')
  .trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(OWNER_EMAIL)) {
  console.error(`DEMO_OWNER_EMAIL ("${OWNER_EMAIL}") is not a valid email — aborting.`);
  process.exit(1);
}
const DIRECTORS = [
  { email: OWNER_EMAIL, role: 'owner', name: 'Demo Owner' },
];

// ── Ensembles ──────────────────────────────────────────────────────────────
// One adult orchestra plus a chamber series — matches the `orch`/`chamber`
// vanity slugs in config/orgs/as.json. Colors are the AS demo brand.
const ENSEMBLES = [
  { id: 'as-orchestra', name: 'Symphony Orchestra', order: 1, color: '#503593', defaultLocation: 'Rehearsal Hall', conductorName: 'Music Director' },
  { id: 'as-chamber', name: 'Chamber Series', order: 2, color: '#8a6fc4', defaultLocation: 'Recital Room' },
];

// ── Personnel — ALL FICTIONAL (see the safety note at the top) ─────────────
// Every position category from the plan is represented: chair
// (Concertmaster, Principal, Assistant Principal, Section, Substitute),
// podium (Conductor), staff (Librarian, Personnel Manager, Operations
// Manager, Executive Assistant, Bookkeeper). Keys stay inside the
// firestore.rules /personnel allowlist; contact details live in
// PERSONNEL_CONTACTS below and pay lives in CONTRACTS — never here.
const PERSONNEL = [
  // Chairs
  {
    id: 'as-p01', name: 'Halloran, Ingrid', preferredName: 'Ingrid',
    pronunciation: 'ING-rid HAL-or-an', instrument: 'Violin',
    section: 'Violin I', seat: 1, sectionLeader: true,
    ensembleIds: ['as-orchestra', 'as-chamber'], status: 'Contracted',
    notes: 'Concertmaster. Leads sectionals the hour before full rehearsal.',
  },
  {
    id: 'as-p02', name: 'Okonjo, Marcus', instrument: 'Cello',
    section: 'Cello', seat: 1, sectionLeader: true,
    ensembleIds: ['as-orchestra'], status: 'Contracted',
  },
  {
    id: 'as-p03', name: 'Vasiliev, Anya', instrument: 'Viola',
    section: 'Viola', seat: 2,
    ensembleIds: ['as-orchestra'], status: 'Contracted',
  },
  {
    id: 'as-p04', name: 'Whitcombe, Daniel', instrument: 'Violin',
    section: 'Violin II', seat: 4,
    ensembleIds: ['as-orchestra'], status: 'Contracted',
  },
  {
    id: 'as-p05', name: 'Fontaine, Amelia', instrument: 'Flute',
    doubles: ['Piccolo'], section: 'Woodwinds', seat: 1, sectionLeader: true,
    ensembleIds: ['as-orchestra'], status: 'Contracted',
  },
  {
    id: 'as-p06', name: 'Karvonen, Theo', instrument: 'Double Bass',
    section: 'Bass',
    ensembleIds: ['as-orchestra'], status: 'SubList',
    notes: 'Sub list. Owns a car that fits the bass — books own cartage.',
  },
  // Podium
  {
    id: 'as-p07', name: 'Reinholt, Clara', preferredName: 'Maestra Reinholt',
    pronunciation: 'RYNE-holt',
    ensembleIds: ['as-orchestra', 'as-chamber'], status: 'Contracted',
  },
  // Staff
  { id: 'as-p08', name: 'Adebayo, Simone', ensembleIds: ['as-orchestra'], status: 'Contracted', notes: 'Librarian.' },
  { id: 'as-p09', name: 'Castellan, Rufus', ensembleIds: ['as-orchestra'], status: 'Contracted', notes: 'Personnel manager.' },
  { id: 'as-p10', name: 'Lindgren, Petra', ensembleIds: ['as-orchestra'], status: 'Contracted', notes: 'Operations manager.' },
  { id: 'as-p11', name: 'Moreno, Silas', ensembleIds: ['as-orchestra'], status: 'Contracted', notes: 'Executive assistant.' },
  { id: 'as-p12', name: 'Okafor-Bailey, June', status: 'Contracted', notes: 'Bookkeeper. Remote; on site for settlement week.' },
];

// ── Personnel contacts (doc id === personnel id) ───────────────────────────
// Keys stay inside the firestore.rules /personnelContacts allowlist. W-9 is
// a STATUS ONLY — never a taxpayer id, in any field, ever (types.ts).
const PERSONNEL_CONTACTS = [
  {
    id: 'as-p01', email: 'ingrid.halloran@example.org', phone: '(555) 014-2201',
    address: '18 Juniper Row, Alpharetta, GA 30009',
    emergencyName: 'Sven Halloran', emergencyPhone: '(555) 014-2202',
    unionLocal: 'AFM Local 000 (demo)', w9Status: 'on-file',
  },
  {
    id: 'as-p02', email: 'm.okonjo@example.org', phone: '(555) 014-2203',
    address: '407 Bellwood Ct, Roswell, GA 30075', w9Status: 'on-file',
  },
  { id: 'as-p03', email: 'anya.vasiliev@example.org', phone: '(555) 014-2204', w9Status: 'requested' },
  { id: 'as-p04', email: 'd.whitcombe@example.org', w9Status: 'not-requested' },
  { id: 'as-p05', email: 'amelia.fontaine@example.org', phone: '(555) 014-2205', w9Status: 'on-file' },
  {
    id: 'as-p06', email: 'theo.karvonen@example.org', phone: '(555) 014-2206',
    emergencyName: 'Maija Karvonen', emergencyPhone: '(555) 014-2207',
    w9Status: 'requested',
  },
  { id: 'as-p07', email: 'c.reinholt@example.org', phone: '(555) 014-2208', w9Status: 'on-file' },
  { id: 'as-p08', email: 's.adebayo@example.org', w9Status: 'on-file' },
  { id: 'as-p09', email: 'r.castellan@example.org', phone: '(555) 014-2209', w9Status: 'on-file' },
  { id: 'as-p10', email: 'p.lindgren@example.org', w9Status: 'on-file' },
  { id: 'as-p11', email: 's.moreno@example.org', w9Status: 'requested' },
  { id: 'as-p12', email: 'june.ob@example.org', phone: '(555) 014-2210', w9Status: 'on-file' },
];

// ── Repertoire (public domain, matching the season programs below) ─────────
const PIECES = [
  {
    id: 'as-tchaik5', ensembleIds: ['as-orchestra'], order: 1,
    title: 'Symphony No. 5',
    fullTitle: 'Symphony No. 5 in E minor, Op. 64',
    composer: 'Pyotr Ilyich Tchaikovsky', composerDates: '1840–1893',
    catalogNumber: 'Op. 64', year: '1888', duration: 46,
    instrumentation: '3 2 2 2 — 4 2 3 1 — timp — str',
    programNotes: 'A fate motto stalks all four movements — and is finally marched off in triumph.',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.5,_Op.64_(Tchaikovsky,_Pyotr)',
  },
  {
    id: 'as-borodin-polovtsian', ensembleIds: ['as-orchestra'], order: 2,
    title: 'Polovtsian Dances',
    fullTitle: 'Polovtsian Dances, from Prince Igor',
    composer: 'Alexander Borodin', composerDates: '1833–1887',
    year: '1890', duration: 12,
    programNotes: 'Borodin the chemist wrote music on Sundays; these dances are the best argument for weekends ever made.',
    imslpUrl: 'https://imslp.org/wiki/Prince_Igor_(Borodin,_Aleksandr)',
  },
  {
    id: 'as-beethoven7', ensembleIds: ['as-orchestra'], order: 3,
    title: 'Symphony No. 7',
    fullTitle: 'Symphony No. 7 in A major, Op. 92',
    composer: 'Ludwig van Beethoven', composerDates: '1770–1827',
    catalogNumber: 'Op. 92', year: '1813', duration: 38,
    instrumentation: '2 2 2 2 — 2 2 0 0 — timp — str',
    movements: [
      { title: 'Poco sostenuto — Vivace', duration: 12 },
      { title: 'Allegretto', duration: 8 },
      { title: 'Presto', duration: 8 },
      { title: 'Allegro con brio', duration: 8 },
    ],
    programNotes: 'Wagner called it the apotheosis of the dance. The Allegretto has stopped every audience since 1813.',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.7,_Op.92_(Beethoven,_Ludwig_van)',
  },
  {
    id: 'as-ravel-tombeau', ensembleIds: ['as-chamber'], order: 1,
    title: 'Le Tombeau de Couperin',
    composer: 'Maurice Ravel', composerDates: '1875–1937',
    year: '1919', duration: 17,
    programNotes: 'Four baroque dances remembered through a very French haze — each movement a memorial to a friend.',
    imslpUrl: 'https://imslp.org/wiki/Le_tombeau_de_Couperin_(Ravel,_Maurice)',
  },
];

// ── Season events ──────────────────────────────────────────────────────────
// Concerts use the REAL 2026-27 Alpharetta Symphony season dates from
// docs/fair-copy/as-demo-plan.md (titles and dates are public season
// marketing, not personal data). Rehearsal services are pinned relative to
// "today" so Today/Now-Next are always alive in a demo, any month.
const VENUE = 'Alpharetta Performing Arts Center (demo)';
const SEASON_CONCERTS = [
  { id: 'as-concert-silver-screen', date: '2026-09-18', title: 'Music from the Silver Screen', pieceIds: [] },
  { id: 'as-concert-tchaik-borodin', date: '2026-10-30', title: 'Tchaikovsky and Borodin', pieceIds: ['as-tchaik5', 'as-borodin-polovtsian'] },
  { id: 'as-concert-holiday', date: '2026-11-28', title: 'An Alpharetta Holiday', pieceIds: [] },
  { id: 'as-concert-paris', date: '2027-02-12', title: 'Impressions of Paris', pieceIds: ['as-ravel-tombeau'] },
  { id: 'as-concert-beethoven7', date: '2027-04-30', title: "Beethoven's 7th", pieceIds: ['as-beethoven7'] },
  { id: 'as-concert-freedom', date: '2027-05-31', title: 'Let Freedom Ring!', pieceIds: [] },
];

function buildEvents() {
  const events = [];

  // A service TODAY so the Today view lights up in any demo, any weekday.
  events.push({
    id: 'as-today-service', type: 'Rehearsal', ensembleIds: ['as-orchestra'],
    date: iso(0), startTime: '19:00', endTime: '21:30',
    location: 'Rehearsal Hall', pieceIds: ['as-tchaik5', 'as-borodin-polovtsian'],
    status: 'Scheduled',
    notes: 'Full orchestra. Strings at 18:00 for the Tchaikovsky finale runs.',
  });

  // Weekly Tuesday evening services, 2 weeks back → 12 weeks ahead.
  const firstTuesday = nextWeekday(2, -14);
  for (let w = 0; w < 14; w++) {
    const d = new Date(firstTuesday);
    d.setDate(d.getDate() + w * 7);
    events.push({
      id: `as-svc-tue-${isoOf(d)}`, type: 'Rehearsal', ensembleIds: ['as-orchestra'],
      date: isoOf(d), startTime: '19:00', endTime: '21:30',
      location: 'Rehearsal Hall', pieceIds: ['as-tchaik5', 'as-borodin-polovtsian'],
      status: 'Scheduled',
    });
  }

  // One schedule change, so change-tracking demos itself.
  const cancelled = nextWeekday(2, 15);
  events.push({
    id: `as-svc-cancelled-${isoOf(cancelled)}`, type: 'Rehearsal',
    ensembleIds: ['as-chamber'], date: isoOf(cancelled),
    startTime: '18:00', endTime: '19:30', location: 'Recital Room',
    status: 'Cancelled',
    changeNote: 'Cancelled — venue in use for a facility event. Chamber reads resume the following week.',
  });

  // The 2026-27 season: each concert plus its dress rehearsal the evening
  // before (fixed ids/dates — the sub contract below names two of them).
  for (const c of SEASON_CONCERTS) {
    const dress = new Date(`${c.date}T12:00:00`);
    dress.setDate(dress.getDate() - 1);
    events.push(
      {
        id: `${c.id}-dress`, type: 'Rehearsal', ensembleIds: ['as-orchestra'],
        date: isoOf(dress), startTime: '19:00', endTime: '22:00',
        location: VENUE, title: `Dress — ${c.title}`,
        pieceIds: c.pieceIds, status: 'Scheduled',
      },
      {
        id: c.id, type: 'Concert', ensembleIds: ['as-orchestra'],
        date: c.date, startTime: '19:30', endTime: '21:30', title: c.title,
        location: VENUE, venueAddress: '2200 Encore Pkwy, Alpharetta, GA 30009',
        callTime: '18:15', dress: 'Concert black',
        pieceIds: c.pieceIds, status: 'Scheduled',
      },
    );
  }
  return events;
}

// ── Contracts — every position category, every rate basis, the lifecycle ───
// Generic placeholder prose (a real AS agreement was considered as the demo
// template and declined as too invasive — as-demo-plan.md); real language
// pastes into a ContractTemplate later without a schema change, which is why
// termsText is separate from the structured fields. All money is INTEGER
// CENTS. Shapes satisfy contractShapeOk() in firestore.rules, verbatim.
const TERMS = (position) =>
  `The Alpharetta Symphony (the "Orchestra") engages the undersigned as ${position} `
  + 'for the services listed, at the rates stated in this agreement. '
  + 'Attendance at contracted services is required; substitutions must be '
  + 'approved by the personnel manager in advance. Compensation is paid by '
  + 'check within 14 days of each concert cycle. This is generic demo '
  + 'language — not the Orchestra’s actual agreement text.';

const DAY = 86_400_000;
const NOW = Date.now();
const CONTRACTS = [
  // Chair — Concertmaster, per-service, fully executed.
  {
    id: 'as-c01', personnelId: 'as-p01', personnelName: 'Halloran, Ingrid',
    category: 'chair', position: 'Concertmaster', section: 'Violin I', seat: 1,
    ensembleIds: ['as-orchestra'], season: '2026-27',
    startDate: '2026-09-01', endDate: '2027-05-31',
    baseRateCents: 15000, baseRateBasis: 'per-service', baseRateQuantity: 40,
    termsText: TERMS('Concertmaster'), status: 'Countersigned',
    signature: 'Ingrid Halloran', signedAt: NOW - 30 * DAY,
    countersignedBy: 'Rufus Castellan', countersignedAt: NOW - 29 * DAY,
    createdAt: NOW - 35 * DAY,
  },
  // Chair — Principal Cello, per-service, fully executed.
  {
    id: 'as-c02', personnelId: 'as-p02', personnelName: 'Okonjo, Marcus',
    category: 'chair', position: 'Principal', section: 'Cello', seat: 1,
    ensembleIds: ['as-orchestra'], season: '2026-27',
    startDate: '2026-09-01', endDate: '2027-05-31',
    baseRateCents: 12500, baseRateBasis: 'per-service', baseRateQuantity: 40,
    termsText: TERMS('Principal Cello'), status: 'Countersigned',
    signature: 'Marcus Okonjo', signedAt: NOW - 28 * DAY,
    countersignedBy: 'Rufus Castellan', countersignedAt: NOW - 27 * DAY,
    createdAt: NOW - 35 * DAY,
  },
  // Chair — Assistant Principal Viola, signed, awaiting countersign.
  {
    id: 'as-c03', personnelId: 'as-p03', personnelName: 'Vasiliev, Anya',
    category: 'chair', position: 'Assistant Principal', section: 'Viola', seat: 2,
    ensembleIds: ['as-orchestra'], season: '2026-27',
    startDate: '2026-09-01', endDate: '2027-05-31',
    baseRateCents: 11000, baseRateBasis: 'per-service', baseRateQuantity: 40,
    termsText: TERMS('Assistant Principal Viola'), status: 'Signed',
    signature: 'Anya Vasiliev', signedAt: NOW - 2 * DAY,
    createdAt: NOW - 10 * DAY,
  },
  // Chair — Section Violin II, sent, not yet signed.
  {
    id: 'as-c04', personnelId: 'as-p04', personnelName: 'Whitcombe, Daniel',
    category: 'chair', position: 'Section', section: 'Violin II', seat: 4,
    ensembleIds: ['as-orchestra'], season: '2026-27',
    startDate: '2026-09-01', endDate: '2027-05-31',
    baseRateCents: 9500, baseRateBasis: 'per-service', baseRateQuantity: 40,
    termsText: TERMS('Section Violin'), status: 'Sent',
    createdAt: NOW - 5 * DAY,
  },
  // Chair — Principal Flute with a DOUBLING line item (piccolo).
  {
    id: 'as-c05', personnelId: 'as-p05', personnelName: 'Fontaine, Amelia',
    category: 'chair', position: 'Principal', section: 'Woodwinds', seat: 1,
    ensembleIds: ['as-orchestra'], season: '2026-27',
    startDate: '2026-09-01', endDate: '2027-05-31',
    baseRateCents: 12500, baseRateBasis: 'per-service', baseRateQuantity: 40,
    lineItems: [
      {
        id: 'as-c05-li1', type: 'Doubling', label: 'Piccolo doubling, all programs',
        amountCents: 2500, basis: 'per-service', quantity: 40,
      },
    ],
    termsText: TERMS('Principal Flute'), status: 'Countersigned',
    signature: 'Amelia Fontaine', signedAt: NOW - 25 * DAY,
    countersignedBy: 'Rufus Castellan', countersignedAt: NOW - 24 * DAY,
    createdAt: NOW - 35 * DAY,
  },
  // Chair — Substitute bass, per-service against NAMED services, carrying
  // the CARTAGE line item — the case this model was designed around
  // (as-demo-plan.md: cartage is a cost on a contract, never a position).
  {
    id: 'as-c06', personnelId: 'as-p06', personnelName: 'Karvonen, Theo',
    category: 'chair', position: 'Substitute', section: 'Bass',
    ensembleIds: ['as-orchestra'], season: '2026-27',
    eventIds: ['as-concert-tchaik-borodin-dress', 'as-concert-tchaik-borodin'],
    baseRateCents: 9500, baseRateBasis: 'per-service', baseRateQuantity: 2,
    lineItems: [
      {
        id: 'as-c06-li1', type: 'Cartage', label: 'Double bass cartage, both services',
        amountCents: 4000, basis: 'per-service', quantity: 2,
      },
    ],
    termsText: TERMS('Substitute Bass'), status: 'Countersigned',
    signature: 'Theo Karvonen', signedAt: NOW - 6 * DAY,
    countersignedBy: 'Rufus Castellan', countersignedAt: NOW - 5 * DAY,
    createdAt: NOW - 8 * DAY,
    notes: 'October program only. Re-engage for the holiday concert if the section needs a fifth.',
  },
  // Podium — Conductor, flat season fee.
  {
    id: 'as-c07', personnelId: 'as-p07', personnelName: 'Reinholt, Clara',
    category: 'podium', position: 'Conductor',
    ensembleIds: ['as-orchestra', 'as-chamber'], season: '2026-27',
    startDate: '2026-08-01', endDate: '2027-06-15',
    baseRateCents: 1800000, baseRateBasis: 'flat',
    termsText: TERMS('Music Director and Conductor'), status: 'Countersigned',
    signature: 'Clara Reinholt', signedAt: NOW - 60 * DAY,
    countersignedBy: 'Silas Moreno', countersignedAt: NOW - 59 * DAY,
    createdAt: NOW - 65 * DAY,
  },
  // Staff — Librarian, per-week during the season.
  {
    id: 'as-c08', personnelId: 'as-p08', personnelName: 'Adebayo, Simone',
    category: 'staff', position: 'Librarian',
    season: '2026-27', startDate: '2026-08-15', endDate: '2027-06-05',
    baseRateCents: 8500, baseRateBasis: 'per-week', baseRateQuantity: 42,
    termsText: TERMS('Librarian'), status: 'Countersigned',
    signature: 'Simone Adebayo', signedAt: NOW - 40 * DAY,
    countersignedBy: 'Rufus Castellan', countersignedAt: NOW - 39 * DAY,
    createdAt: NOW - 45 * DAY,
  },
  // Staff — Personnel Manager, flat season fee.
  {
    id: 'as-c09', personnelId: 'as-p09', personnelName: 'Castellan, Rufus',
    category: 'staff', position: 'Personnel Manager',
    season: '2026-27', startDate: '2026-08-01', endDate: '2027-06-15',
    baseRateCents: 600000, baseRateBasis: 'flat',
    termsText: TERMS('Personnel Manager'), status: 'Countersigned',
    signature: 'Rufus Castellan', signedAt: NOW - 55 * DAY,
    countersignedBy: 'Silas Moreno', countersignedAt: NOW - 54 * DAY,
    createdAt: NOW - 60 * DAY,
  },
  // Staff — Operations Manager, flat season fee.
  {
    id: 'as-c10', personnelId: 'as-p10', personnelName: 'Lindgren, Petra',
    category: 'staff', position: 'Operations Manager',
    season: '2026-27', startDate: '2026-08-01', endDate: '2027-06-15',
    baseRateCents: 750000, baseRateBasis: 'flat',
    termsText: TERMS('Operations Manager'), status: 'Countersigned',
    signature: 'Petra Lindgren', signedAt: NOW - 55 * DAY,
    countersignedBy: 'Silas Moreno', countersignedAt: NOW - 54 * DAY,
    createdAt: NOW - 60 * DAY,
  },
  // Staff — Executive Assistant, hourly, sent.
  {
    id: 'as-c11', personnelId: 'as-p11', personnelName: 'Moreno, Silas',
    category: 'staff', position: 'Executive Assistant',
    season: '2026-27', startDate: '2026-09-01', endDate: '2027-05-31',
    baseRateCents: 2400, baseRateBasis: 'hourly', baseRateQuantity: 300,
    termsText: TERMS('Executive Assistant'), status: 'Sent',
    createdAt: NOW - 3 * DAY,
  },
  // Staff — Bookkeeper, hourly, still a Draft (the one deletable state).
  {
    id: 'as-c12', personnelId: 'as-p12', personnelName: 'Okafor-Bailey, June',
    category: 'staff', position: 'Bookkeeper',
    season: '2026-27', startDate: '2026-09-01', endDate: '2027-06-30',
    baseRateCents: 3200, baseRateBasis: 'hourly', baseRateQuantity: 120,
    status: 'Draft',
    createdAt: NOW - DAY,
    notes: 'Rate pending board approval of the admin budget line.',
  },
  // A VOID contract — terminal state on display: an early concertmaster
  // agreement superseded by as-c01 when the quantity changed.
  {
    id: 'as-c13', personnelId: 'as-p01', personnelName: 'Halloran, Ingrid',
    category: 'chair', position: 'Concertmaster', section: 'Violin I', seat: 1,
    ensembleIds: ['as-orchestra'], season: '2026-27',
    startDate: '2026-09-01', endDate: '2027-05-31',
    baseRateCents: 15000, baseRateBasis: 'per-service', baseRateQuantity: 36,
    termsText: TERMS('Concertmaster'), status: 'Void',
    createdAt: NOW - 40 * DAY,
    notes: 'Superseded — service count rose to 40 when the chamber series was added. See as-c01.',
  },
];

// ── Announcements ──────────────────────────────────────────────────────────
const ANNOUNCEMENTS = [
  // Self-labeling: the sandbox says it's a sandbox, so nobody mistakes
  // fictional personnel/contracts/dates for real ones.
  {
    id: 'as-ann-demo-notice', ensembleId: null, title: 'Demo sandbox — explore freely',
    body: 'Everything here is fictional demo data: musicians, staff, contracts, services, and messages. Click anything, edit anything, issue a contract, post announcements — it all resets before your real season goes in. Nothing you do here can break anything.',
    priority: 'info', pinned: true, createdAt: NOW - 2 * DAY,
  },
  {
    id: 'as-ann-welcome', ensembleId: null, title: 'Welcome to the Alpharetta Symphony Hub',
    body: 'Service schedules, repertoire, concert details, and announcements now live in one place. Subscribe to the calendar and every called service lands on your phone automatically.',
    priority: 'important', pinned: true, createdAt: NOW - DAY,
  },
  {
    id: 'as-ann-october', ensembleId: 'as-orchestra', title: 'Tchaikovsky and Borodin — service order posted',
    body: 'The October cycle rehearsal order is posted. Dress is the Thursday before the concert at the hall; call 6:15 PM, concert black.',
    priority: 'info', createdAt: NOW - 3_600_000,
  },
];

const DOCUMENTS = [
  {
    id: 'as-doc-handbook', title: 'Musician Handbook 2026–27', category: 'Handbook',
    ensembleIds: [], audience: 'All', url: 'https://example.org/as-musician-handbook',
    description: 'Service etiquette, dress, substitution policy, and payment schedule.',
    createdAt: NOW - 5 * DAY,
  },
];

// ── Write everything ───────────────────────────────────────────────────────
(async () => {
  let count = 0;
  let batch = db.batch();
  const commitIfFull = async () => {
    if (++count % 400 === 0) { await batch.commit(); batch = db.batch(); }
  };
  const put = async (col, { id, ...data }) => {
    batch.set(db.collection(col).doc(id), data);
    await commitIfFull();
  };

  for (const d of DIRECTORS) {
    batch.set(db.collection('directors').doc(d.email), {
      email: d.email, name: d.name, role: d.role,
      addedBy: 'seed-as-org.mjs', addedAt: Date.now(),
    });
    await commitIfFull();
  }
  for (const e of ENSEMBLES) await put('ensembles', e);
  for (const p of PERSONNEL) await put('personnel', p);
  for (const pc of PERSONNEL_CONTACTS) await put('personnelContacts', pc);
  for (const c of CONTRACTS) await put('contracts', c);
  for (const p of PIECES) await put('repertoire', p);
  for (const ev of buildEvents()) await put('events', ev);
  for (const a of ANNOUNCEMENTS) await put('announcements', a);
  for (const doc of DOCUMENTS) await put('documents', doc);

  await batch.commit();
  console.log(`Seeded ${count} docs into ${DEMO_PROJECT_ID}:`);
  console.log(`  ${ENSEMBLES.length} ensembles, ${PERSONNEL.length} personnel (+${PERSONNEL_CONTACTS.length} contacts), ${CONTRACTS.length} contracts`);
  console.log(`  ${PIECES.length} pieces, ${buildEvents().length} events, ${ANNOUNCEMENTS.length} announcements, ${DOCUMENTS.length} documents`);
  console.log(`Owner: ${OWNER_EMAIL} — sign in with THAT Google account, then add the AS staff from the Directors screen.`);
})();
