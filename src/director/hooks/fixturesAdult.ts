import { addDays, todayStr } from '../utils';
import type {
  Announcement, CalendarEvent, Contract, ContractLineItem, ContractStatus, ContractTemplate, Ensemble,
  LibraryDocument, Payment, Personnel, PersonnelContact, RepertoirePiece, ServiceAttendance, SignupForm,
} from '../types';

/**
 * Local development fixtures for an ADULT orchestra (#personnel): one paid
 * orchestra in the week of a concert, where fixtures.ts is a school. In a
 * personnel-org build fixtures.ts hands out the ADULT_* lists in place of its
 * own, and the paid-roster hooks read the FIXTURE_* lists, which have no
 * school counterpart.
 *
 * Usage:  VITE_ORG=as VITE_FIXTURES=1 npm run dev   ("hub-fixtures-adult" in
 * .claude/launch.json), then /director/personnel.
 *
 * Everyone here is invented. Addresses are @example.org, phone numbers come
 * from the reserved 555-01xx range, and nobody has a street address. The
 * repository is public: nothing about a real person goes in this file.
 *
 * Every list is gated HERE, on the two build-time literals, and not only where
 * it is read. The `!db && FIXTURES_ON` guard in the hooks decides what is
 * SERVED, but it cannot keep a list out of a bundle: FIXTURES_ON is an
 * imported binding, folded only inside the chunk that defines it, and the
 * paid-roster hooks sit in another chunk. Names and pay figures must not
 * ship, so in any build that is not both a personnel org and VITE_FIXTURES=1
 * each list below compiles to an empty one. This file also imports nothing
 * from ../personnel: it lands in the public chunk, and an import would bring
 * that code along with it.
 */
declare const __ORG_PERSONNEL__: boolean;

/** Dates pinned relative to today, so Today always has a rehearsal on it. */
const day = (offset: number) => addDays(todayStr(), offset);
const ago = (days: number) => Date.now() - days * 86_400_000;
/** "Okwuosa, Amara" → "Amara Okwuosa": a typed signature, and half an address. */
const firstLast = (name: string) => name.split(', ').reverse().join(' ');

export const ADULT_ENSEMBLES: Ensemble[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  { id: 'orchestra', name: 'Orchestra', order: 1, defaultLocation: 'Rehearsal Hall', conductorName: 'Camille Desrosiers' },
] : [];

/** The concert's program, in order. */
const PROGRAM = ['fx-fledermaus', 'fx-blue-danube', 'fx-thunder-lightning', 'fx-voices-of-spring', 'fx-feuerfest', 'fx-radetzky'];

// Public-domain New Year's staples. Instrumentation is as IMSLP and Wikipedia
// list it for each work; editions differ.
export const ADULT_PIECES: RepertoirePiece[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  {
    // Flute 2's sha256 is fixturePartPdf()'s sample (#parts-reader), so the reader's "Updated" test has a real hash to compare.
    id: 'fx-fledermaus', ensembleIds: ['orchestra'], order: 1, title: 'Overture to Die Fledermaus',
    composer: 'Johann Strauss II', composerDates: '1825–1899', year: '1874', duration: 9,
    instrumentation: '2 2 2 2 — 4 2 3 0 — timp, perc — str',
    eventIds: ['fx-new-years-concert'],
    memberParts: [{ label: 'Score', role: 'score', path: 'members/parts/fx-fledermaus/Score v2.pdf', sha256: '' }, { label: 'Flute 1', role: 'part', path: 'members/parts/fx-fledermaus/Flute 1 v2.pdf', sha256: '' }, { label: 'Flute 2', role: 'part', path: 'members/parts/fx-fledermaus/Flute 2 v2.pdf', sha256: '0a1145bf78f692e4cafc7b40ae1b5ff785b2d08b8c714b5a95bb2f8f7b5f5662' }, { label: 'Piccolo', role: 'part', path: 'members/parts/fx-fledermaus/Piccolo v2.pdf', sha256: '' }, { label: 'Violins I', role: 'part', path: 'members/parts/fx-fledermaus/Violins I v2.pdf', sha256: '' }, { label: 'Violins II', role: 'part', path: 'members/parts/fx-fledermaus/Violins II v2.pdf', sha256: '' }, { label: 'Violas', role: 'part', path: 'members/parts/fx-fledermaus/Violas v2.pdf', sha256: '' }, { label: 'Cellos', role: 'part', path: 'members/parts/fx-fledermaus/Cellos v2.pdf', sha256: '' }, { label: 'Basses', role: 'part', path: 'members/parts/fx-fledermaus/Basses v2.pdf', sha256: '' }],
  },
  {
    id: 'fx-blue-danube', ensembleIds: ['orchestra'], order: 2, title: 'The Blue Danube',
    fullTitle: 'An der schönen blauen Donau (The Blue Danube), Op. 314', composer: 'Johann Strauss II',
    composerDates: '1825–1899', catalogNumber: 'Op. 314', year: '1866', duration: 10,
    instrumentation: '2 2 2 2 — 4 2 1 1 — timp, perc — hp — str',
    programNotes: 'Composed in 1866 and first sung by the Vienna Men’s Choral Association on 15 February 1867. The orchestral version followed that year, for the World’s Fair in Paris.',
    eventIds: ['fx-new-years-concert'],
    // Members-only parts (#member-sign-in): what the Bottega ingest writes.
    memberParts: [{ label: 'Score', role: 'score', path: 'members/parts/fx-blue-danube/Score v2.pdf', sha256: '' }, { label: 'Flute 1', role: 'part', path: 'members/parts/fx-blue-danube/Flute 1 v2.pdf', sha256: '' }, { label: 'Flute 2', role: 'part', path: 'members/parts/fx-blue-danube/Flute 2 v2.pdf', sha256: 'be2c764f20c9b2b879013b64766e0457be698b61be67b06fcc0fd29b07e32063' }, { label: 'Oboe 1', role: 'part', path: 'members/parts/fx-blue-danube/Oboe 1 v2.pdf', sha256: '' }, { label: 'Violins I', role: 'part', path: 'members/parts/fx-blue-danube/Violins I v2.pdf', sha256: '' }, { label: 'Violins II', role: 'part', path: 'members/parts/fx-blue-danube/Violins II v2.pdf', sha256: '' }, { label: 'Violas', role: 'part', path: 'members/parts/fx-blue-danube/Violas v2.pdf', sha256: '' }, { label: 'Cellos', role: 'part', path: 'members/parts/fx-blue-danube/Cellos v2.pdf', sha256: '' }, { label: 'Basses', role: 'part', path: 'members/parts/fx-blue-danube/Basses v2.pdf', sha256: '' }, { label: 'Harp', role: 'part', path: 'members/parts/fx-blue-danube/Harp v2.pdf', sha256: '' }],
  },
  {
    id: 'fx-thunder-lightning', ensembleIds: ['orchestra'], order: 3, title: 'Thunder and Lightning Polka',
    fullTitle: 'Unter Donner und Blitz (Thunder and Lightning Polka), Op. 324', composer: 'Johann Strauss II',
    composerDates: '1825–1899', catalogNumber: 'Op. 324', year: '1868', duration: 3,
    instrumentation: '2 2 2 2 — 4 3 3 1 — perc — str',
    eventIds: ['fx-new-years-concert'],
  },
  {
    id: 'fx-voices-of-spring', ensembleIds: ['orchestra'], order: 4, title: 'Voices of Spring',
    fullTitle: 'Frühlingsstimmen (Voices of Spring), Op. 410', composer: 'Johann Strauss II',
    composerDates: '1825–1899', catalogNumber: 'Op. 410', year: '1882', duration: 7,
    instrumentation: '2 2 2 2 — 4 2 3 0 — timp, perc — hp — str',
    eventIds: ['fx-new-years-concert'],
  },
  {
    id: 'fx-feuerfest', ensembleIds: ['orchestra'], order: 5, title: 'Feuerfest! Polka',
    fullTitle: 'Feuerfest! Polka, Op. 269', composer: 'Josef Strauss',
    composerDates: '1827–1870', catalogNumber: 'Op. 269', year: '1869', duration: 3,
    instrumentation: '2 2 2 2 — 4 2 3 0 — perc — str', percussion: 'anvil, snare drum, bass drum, cymbals',
    programNotes: '“Fireproof!” A polka française commissioned by the Wertheim company to celebrate its 20,000th safe. The percussionist plays an anvil.',
    eventIds: ['fx-new-years-concert'],
  },
  {
    id: 'fx-radetzky', ensembleIds: ['orchestra'], order: 6, title: 'Radetzky March',
    fullTitle: 'Radetzky March, Op. 228', composer: 'Johann Strauss I',
    composerDates: '1804–1849', catalogNumber: 'Op. 228', year: '1848', duration: 3,
    instrumentation: '3 2 2 2 — 4 2 3 0 — perc — str',
    eventIds: ['fx-new-years-concert'],
  },
] : [];

// Tonight is the first of four services: two evening rehearsals, the dress,
// then the concert. Kept in date order: nothing sorts fixture events, and the
// roll sheet opens on the first one that is not in the past.
export const ADULT_EVENTS: CalendarEvent[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  {
    id: 'fx-rehearsal-1', type: 'Rehearsal', ensembleIds: ['orchestra'],
    date: day(0), startTime: '19:00', endTime: '21:30', location: 'Rehearsal Hall',
    pieceIds: ['fx-fledermaus', 'fx-blue-danube', 'fx-voices-of-spring'], status: 'Scheduled',
    notes: 'Fledermaus first, then both waltzes; the harp is not needed before 8:00. Park in the lot behind the building. The side door is open from 6:15 for basses, harp and percussion.',
  },
  {
    id: 'fx-rehearsal-2', type: 'Rehearsal', ensembleIds: ['orchestra'],
    date: day(1), startTime: '19:00', endTime: '21:30', location: 'Rehearsal Hall',
    pieceIds: ['fx-thunder-lightning', 'fx-feuerfest', 'fx-radetzky', 'fx-fledermaus'], status: 'Scheduled',
    notes: 'The polkas and the march first, then Fledermaus again. Same lot, same side door.',
  },
  {
    id: 'fx-dress', type: 'Rehearsal', ensembleIds: ['orchestra'], title: 'Dress rehearsal',
    date: day(2), startTime: '19:00', endTime: '22:00', location: 'Concert Hall',
    pieceIds: PROGRAM, status: 'Scheduled',
    notes: 'A run in program order, then spots. Load in through the stage door from 5:30 PM. Cases stay in the wings, not in the house. Street clothes.',
  },
  {
    id: 'fx-new-years-concert', type: 'Concert', ensembleIds: ['orchestra'], title: "New Year's Concert",
    date: day(3), startTime: '19:30', endTime: '21:00', location: 'Concert Hall',
    callTime: '18:30', dress: 'Concert black', pieceIds: PROGRAM, status: 'Scheduled',
    notes: 'The stage door opens at 5:30 PM. Park in the garage behind the hall and bring your ticket to the stage door to have it stamped. Tuning on stage at 7:20.',
  },
] : [];

// Pinned first, then newest, the order useAnnouncements sorts into.
export const ADULT_ANNOUNCEMENTS: Announcement[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  {
    id: 'fx-ann-schedule', ensembleId: null, title: "New Year's Concert: the schedule is posted",
    body: 'Two evening rehearsals, the dress and the concert are on the calendar, with the order for each night in its notes. Subscribe to the calendar and every call lands on your phone.',
    priority: 'important', pinned: true, createdAt: ago(3),
    links: [{ label: "New Year's Concert", url: '/event/fx-new-years-concert' }],
  },
  {
    id: 'fx-ann-load-in', ensembleId: null, title: 'Parking and load-in at the hall',
    body: 'Park in the garage behind the hall and bring your ticket to the stage door. Basses, harp and percussion: the loading dock is open from 5:30 PM for the dress and the concert.',
    priority: 'info', createdAt: ago(1),
  },
  {
    id: 'fx-ann-dress', ensembleId: null, title: 'Concert dress',
    body: 'Concert black, head to toe: long sleeves, black shoes and black socks. No fragrance on stage.',
    priority: 'info', createdAt: ago(2),
  },
] : [];

export const ADULT_DOCUMENTS: LibraryDocument[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  {
    id: 'fx-doc-schedule', title: "New Year's Concert: rehearsal and concert schedule", category: 'Calendar',
    ensembleIds: ['orchestra'], url: 'https://example.org/schedule',
    description: 'All four services on one page, with the rehearsal order for each night.',
    createdAt: ago(3),
  },
  {
    id: 'fx-doc-load-in', title: 'Parking and load-in', category: 'Other',
    ensembleIds: [], url: 'https://example.org/load-in',
    description: 'Where to park, which door to use, and where cases go.',
    createdAt: ago(4),
  },
  {
    id: 'fx-doc-dress', title: 'Concert dress', category: 'Policy',
    ensembleIds: [], url: 'https://example.org/dress',
    createdAt: ago(5),
  },
] : [];

// One form, open to anyone with the link: the only audience that needs no
// student roster. No time slots, which are anchored to a student.
export const ADULT_SIGNUPS: SignupForm[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  {
    id: 'fx-signup-players', title: "New Year's Concert: player details",
    intro: 'Confirm that you are playing, and tell the personnel manager what you need at the hall.',
    audienceMode: 'open', ensembleIds: [], families: [], deadline: day(1),
    questions: [
      { id: 'q0', label: 'Instrument', type: 'short', required: true },
      { id: 'q1', label: 'Are you available for all four services?', type: 'yesno', required: true },
      { id: 'q2', label: 'Do you need the loading dock (bass, harp, percussion)?', type: 'yesno' },
      { id: 'q3', label: 'Anything the personnel manager should know?', type: 'long' },
    ],
    collectEmail: true, collectPhone: true,
    createdAt: ago(3),
  },
] : [];

// ── The paid roster ─────────────────────────────────────────────────────
// In score order. Winds are one on a part: the section is the instrument and
// the seat is the part. Everyone with a section plays; the conductor has only
// the ensemble, and the two staff have neither, so they are never on a roll.
export const FIXTURE_PERSONNEL: Personnel[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  { id: 'fx-p01', name: 'Khoury, Rania', instrument: 'Flute', section: 'Flute', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p02', name: 'Kowalczyk, Dominik', pronunciation: 'koh-VAHL-chik', instrument: 'Flute', doubles: ['Piccolo'], section: 'Flute', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p03', name: 'Teixeira, Ines', instrument: 'Oboe', section: 'Oboe', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p04', name: 'Oyelaran, Tobi', instrument: 'Oboe', section: 'Oboe', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p05', name: 'Seo, Minjun', instrument: 'Clarinet', section: 'Clarinet', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p06', name: 'Abernathy, Quentin', instrument: 'Clarinet', section: 'Clarinet', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p07', name: 'Dlamini, Nomsa', instrument: 'Bassoon', section: 'Bassoon', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p08', name: 'Feldstein, Micah', instrument: 'Bassoon', section: 'Bassoon', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p09', name: 'Raman, Kavya', instrument: 'Horn', section: 'Horn', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p10', name: 'MacTavish, Fergus', preferredName: 'Gus', instrument: 'Horn', section: 'Horn', seat: 2, ensembleIds: ['orchestra'], status: 'SubList' },
  { id: 'fx-p11', name: 'Baptiste, Renee', instrument: 'Trumpet', section: 'Trumpet', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p12', name: 'Zhou, Kai', instrument: 'Trumpet', section: 'Trumpet', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p13', name: 'Ostrowski, Marek', instrument: 'Trombone', section: 'Trombone', ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p14', name: 'Al-Masri, Yusuf', instrument: 'Timpani', section: 'Timpani', ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p15', name: 'Kealoha, Noelani', instrument: 'Percussion', section: 'Percussion', ensembleIds: ['orchestra'], status: 'SubList', notes: 'Brings the anvil for Feuerfest.' },
  { id: 'fx-p16', name: 'Vanterpool, Celeste', instrument: 'Harp', section: 'Harp', ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p17', name: 'Okwuosa, Amara', instrument: 'Violin', section: 'Violin I', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted', notes: 'Concertmaster.' },
  { id: 'fx-p18', name: 'Lindqvist, Soren', instrument: 'Violin', section: 'Violin I', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p19', name: 'Takeda, Miyu', instrument: 'Violin', section: 'Violin I', seat: 3, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p20', name: 'Whitlow, Jerome', instrument: 'Violin', section: 'Violin I', seat: 4, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p21', name: 'Bakshi, Meera', instrument: 'Violin', section: 'Violin II', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p22', name: 'Morrow, Caleb', instrument: 'Violin', section: 'Violin II', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p23', name: 'Dvorkin, Oksana', instrument: 'Violin', section: 'Violin II', seat: 3, ensembleIds: ['orchestra'], status: 'SubList' },
  { id: 'fx-p24', name: 'Santangelo, Dario', instrument: 'Viola', section: 'Viola', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p25', name: 'Tran, Minh-Chau', instrument: 'Viola', section: 'Viola', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p26', name: 'Villanueva, Rafael', instrument: 'Cello', section: 'Cello', seat: 1, sectionLeader: true, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p27', name: 'Eriksen, Maren', instrument: 'Cello', section: 'Cello', seat: 2, ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p28', name: 'Dimaculangan, Paolo', instrument: 'Double Bass', section: 'Bass', ensembleIds: ['orchestra'], status: 'Contracted' },
  { id: 'fx-p29', name: 'Desrosiers, Camille', ensembleIds: ['orchestra'], status: 'Contracted', notes: 'Conductor.' },
  { id: 'fx-p30', name: 'Brightwater, Jonah', status: 'Contracted', notes: 'Librarian.' },
  { id: 'fx-p31', name: 'Mwangi, Priscilla', status: 'Contracted', notes: 'Personnel manager.' },
] : [];

/** Where a contact record differs: the paperwork still to chase, and one
 *  emergency contact. Everyone not named here has a W-9 on file. */
const CONTACT_DIFFERS: Record<string, Partial<PersonnelContact>> = {
  'fx-p10': { w9Status: 'requested' },
  'fx-p12': { w9Status: 'requested' },
  'fx-p15': { w9Status: 'not-requested' },
  'fx-p17': { emergencyName: 'Chidi Okwuosa', emergencyPhone: '555-0190' },
  'fx-p22': { w9Status: 'requested' },
  'fx-p23': { w9Status: 'not-requested', phone: '' },
};

/** How each person is paid, in rotation. Handles are made up: the reserved
 *  example.org domain, 555-01xx numbers, and invented names. */
const PAY: ((p: Personnel) => Pick<PersonnelContact, 'payMethod' | 'payHandle'>)[] = [
  p => ({ payMethod: 'zelle', payHandle: `${firstLast(p.name).toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.')}@example.org` }),
  p => ({ payMethod: 'venmo', payHandle: `@${firstLast(p.name).toLowerCase().replace(/[^a-z]/g, '')}` }),
  () => ({ payMethod: 'check' }),
  p => ({ payMethod: 'paypal', payHandle: `${firstLast(p.name).toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.')}@example.org` }),
];

/** Keyed by personnel id, the shape usePersonnelContacts returns. */
export const FIXTURE_PERSONNEL_CONTACTS: Record<string, PersonnelContact> = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES
  ? Object.fromEntries(FIXTURE_PERSONNEL.map((p, i): [string, PersonnelContact] => [p.id, {
      id: p.id,
      email: `${firstLast(p.name).toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.')}@example.org`,
      phone: `555-01${String(i + 1).padStart(2, '0')}`,
      w9Status: 'on-file',
      ...PAY[i % PAY.length](p),
      ...CONTACT_DIFFERS[p.id],
    }]))
  : {};

// Sample wording. The {{tokens}} are filled from each contract's own fields
// when it is shown (personnel/contractTerms.ts), so no figure is typed twice.
const TERMS = '{{orgName}} engages {{name}} ({{position}}) for the services from {{startDate}} through {{endDate}}, '
  + 'at {{baseRate}} plus any amounts itemized in this agreement, for an estimated total of {{estimatedTotal}}.\n\n'
  + 'Sample wording for local fixtures. It is not an agreement.';

export const FIXTURE_CONTRACT_TEMPLATES: ContractTemplate[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  { id: 'fx-tmpl-chair', name: 'Per-service engagement', category: 'chair', bodyText: TERMS, version: 1 },
] : [];

/** Two rehearsals, the dress and the concert. */
const SERVICES = 4;

/** Money on top of the base rate. INTEGER CENTS, like every amount here. */
const LINE_ITEMS: Record<string, ContractLineItem> = {
  'fx-p02': { id: 'doubling', type: 'Doubling', label: 'Piccolo', amountCents: 2000, basis: 'per-service', quantity: SERVICES },
  'fx-p15': { id: 'cartage', type: 'Cartage', label: 'Percussion and anvil', amountCents: 4000, basis: 'per-service', quantity: SERVICES },
  'fx-p16': { id: 'cartage', type: 'Cartage', label: 'Harp, dress and concert', amountCents: 7500, basis: 'per-service', quantity: 2 },
  'fx-p17': { id: 'overscale', type: 'Overscale', label: 'Concertmaster', amountCents: 5000, basis: 'per-service', quantity: SERVICES },
  'fx-p28': { id: 'cartage', type: 'Cartage', label: 'Double bass', amountCents: 3500, basis: 'per-service', quantity: SERVICES },
};
/** What a section leader with no line of their own above is paid for leading. */
const PRINCIPAL: ContractLineItem = { id: 'overscale', type: 'Overscale', label: 'Principal', amountCents: 2500, basis: 'per-service', quantity: SERVICES };

/** Whose paperwork is still moving. Everyone not named here is countersigned. */
const CONTRACT_STATUS: Record<string, ContractStatus> = {
  'fx-p14': 'Signed', 'fx-p26': 'Signed',
  'fx-p12': 'Sent', 'fx-p22': 'Sent', 'fx-p23': 'Sent',
  'fx-p10': 'Draft', 'fx-p15': 'Draft',
};

/** What every engagement for this concert shares, with the stamps its state implies. */
function engagement(id: string, status: ContractStatus = CONTRACT_STATUS[id] ?? 'Countersigned') {
  const name = FIXTURE_PERSONNEL.find(p => p.id === id)?.name ?? '';
  return {
    id: `fx-c-${id}`, personnelId: id, personnelName: name,
    startDate: day(0), endDate: day(3), termsText: TERMS, status, createdAt: ago(21),
    ...(status === 'Signed' || status === 'Countersigned' ? { signature: firstLast(name), signedAt: ago(9) } : {}),
    ...(status === 'Countersigned' ? { countersignedBy: 'Priscilla Mwangi', countersignedAt: ago(8) } : {}),
  };
}

export const FIXTURE_CONTRACTS: Contract[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  // The players: $110.00 a service, plus what the chair adds. The second
  // bassoon has none yet, so the roster's "No contract" nudge has a row.
  ...FIXTURE_PERSONNEL.filter(p => p.section && p.id !== 'fx-p08').map((p): Contract => {
    const line = LINE_ITEMS[p.id] ?? (p.sectionLeader ? PRINCIPAL : undefined);
    return {
      ...engagement(p.id),
      category: 'chair',
      position: p.id === 'fx-p17' ? 'Concertmaster' : p.status === 'SubList' ? 'Substitute' : p.sectionLeader ? 'Principal' : 'Section',
      section: p.section, seat: p.seat, ensembleIds: ['orchestra'],
      baseRateCents: 11000, baseRateBasis: 'per-service', baseRateQuantity: SERVICES,
      lineItems: line ? [line] : [],
      // The harp is called for the dress and the concert only: a named list of services.
      ...(p.id === 'fx-p16' ? { eventIds: ['fx-dress', 'fx-new-years-concert'], baseRateQuantity: 2 } : {}),
      templateId: 'fx-tmpl-chair', templateVersion: 1,
    };
  }),
  // Podium and staff: one agreed sum each.
  { ...engagement('fx-p29'), category: 'podium', position: 'Conductor', baseRateCents: 250000, baseRateBasis: 'flat' },
  { ...engagement('fx-p30'), category: 'staff', position: 'Librarian', baseRateCents: 40000, baseRateBasis: 'flat' },
  { ...engagement('fx-p31'), category: 'staff', position: 'Personnel Manager', baseRateCents: 60000, baseRateBasis: 'flat' },
  // Void is terminal and kept: the concertmaster's first offer, replaced
  // when the dress rehearsal was added and three services became four.
  {
    ...engagement('fx-p17', 'Void'), id: 'fx-c-void', createdAt: ago(30),
    category: 'chair', position: 'Concertmaster', section: 'Violin I', seat: 1, ensembleIds: ['orchestra'],
    baseRateCents: 11000, baseRateBasis: 'per-service', baseRateQuantity: 3,
    lineItems: [{ ...LINE_ITEMS['fx-p17'], quantity: 3 }],
    notes: 'Replaced when the dress rehearsal was added: three services became four.',
  },
] : [];

// Roll at tonight's rehearsal, part way through: winds, brass and percussion
// are marked and the strings are not, so the sheet shows every state at once.
// The winds because the sheet lists in score order, which puts them on top.
export const FIXTURE_SERVICE_ATTENDANCE: ServiceAttendance[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES
  ? FIXTURE_PERSONNEL.filter(p => p.instrument && p.id !== 'fx-p16' && !['Violin', 'Viola', 'Cello', 'Double Bass'].includes(p.instrument)).map(p => ({
      // The id firestore.rules enforces: one record per person per service.
      id: `fx-rehearsal-1__${p.id}`, personnelId: p.id, eventId: 'fx-rehearsal-1',
      status: p.id === 'fx-p12' ? 'Absent' : p.id === 'fx-p06' ? 'Excused' : 'Present',
      updatedAt: ago(0), updatedBy: 'Priscilla Mwangi', updatedByRole: 'director',
    }))
  : [];

/** What a contract is worth at issue, in cents. Mirrors contractMoney.ts,
 *  which this file may not import (it lands in the public chunk). */
const worth = (c: Contract) =>
  c.baseRateCents * (c.baseRateBasis === 'flat' ? 1 : c.baseRateQuantity ?? 1)
  + (c.lineItems ?? []).reduce((n, li) => n + li.amountCents * (li.basis === 'per-service' ? li.quantity ?? 1 : 1), 0);

/** Paid so far: the first seven countersigned players in full by Zelle or
 *  Venmo, one of them in two instalments, a part payment, and the conductor's
 *  deposit. Everyone else is still owed. */
export const FIXTURE_PAYMENTS: Payment[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES
  ? FIXTURE_CONTRACTS.filter(c => c.status === 'Countersigned').slice(0, 7).flatMap((c, i): Payment[] => {
      const method = FIXTURE_PERSONNEL_CONTACTS[c.personnelId]?.payMethod || 'check';
      const base = { contractId: c.id, personnelId: c.personnelId, method, updatedBy: 'Priscilla Mwangi', updatedByRole: 'director' as const };
      const total = worth(c);
      if (i === 1) return [{ ...base, id: `fx-pay-${i}`, amountCents: Math.round(total / 2), paidOn: day(-2), reference: 'first half' }];
      if (i === 2) return [
        { ...base, id: `fx-pay-${i}a`, amountCents: 20000, paidOn: day(-5) },
        { ...base, id: `fx-pay-${i}b`, amountCents: total - 20000, paidOn: day(-1), note: 'Balance after the dress.' },
      ];
      return [{ ...base, id: `fx-pay-${i}`, amountCents: total, paidOn: day(-1) }];
    })
  : [];

/** Players invited to sign in (#member-sign-in): the second flute has set a
 *  password, the concertmaster's invitation is still waiting. `?role=member`
 *  shows the second flute's own home. */
export const FIXTURE_MEMBER_ENTRIES: { email: string; personnelId: string; name?: string; invitedAt?: number; passwordSet?: boolean }[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  { email: 'dominik.kowalczyk@example.org', personnelId: 'fx-p02', name: 'Dominik Kowalczyk', invitedAt: ago(6), passwordSet: true },
  { email: 'amara.okwuosa@example.org', personnelId: 'fx-p17', name: 'Amara Okwuosa', invitedAt: ago(1) },
] : [];
/** Whose home `?role=member` shows in fixtures. */
export const FIXTURE_MEMBER_PERSONNEL_ID = 'fx-p02';

/**
 * Messages to players (#messages): office threads, a Sent list, section chat
 * links. Types are inlined (this file may not import ../office: it lands in
 * the public chunk). The second flute (`?role=member`) has an office thread
 * with an unread reply; the concertmaster has written to the office.
 */
const fxThread = (personnelId: string, name: string, lastFrom: 'member' | 'staff', lastText: string, lastAt: number, read: { staffReadAt?: number; memberReadAt?: number }) =>
  ({ personnelId, name, lastFrom, lastText, lastAt, ...read });
export const FIXTURE_THREADS = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  fxThread('fx-p17', 'Okwuosa, Amara', 'member', 'Is the dress rehearsal call 6:00 or 6:30? My bus gets in at 6:10.', Date.now() - 40 * 60_000, { staffReadAt: ago(2) }),
  fxThread('fx-p02', 'Kowalczyk, Dominik', 'staff', 'Yes, the piccolo part is in your Hub now. Open it from My parts.', Date.now() - 3 * 3_600_000, { staffReadAt: Date.now(), memberReadAt: ago(1) }),
  fxThread('fx-p26', 'Villanueva, Rafael', 'staff', 'Got it, thank you. Your check goes out Friday.', ago(1), { staffReadAt: Date.now(), memberReadAt: Date.now() }),
] : [];
export const FIXTURE_THREAD_MESSAGES: Record<string, { id: string; from: 'member' | 'staff'; text: string; at: number; byName?: string }[]> = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? {
  'fx-p17': [
    { id: 'm1', from: 'staff', text: 'Welcome to the Hub, Amara. Your concertmaster parts are up.', at: ago(3), byName: 'Camille' },
    { id: 'm2', from: 'member', text: 'Thank you! Is the dress rehearsal call 6:00 or 6:30? My bus gets in at 6:10.', at: Date.now() - 40 * 60_000 },
  ],
  'fx-p02': [
    { id: 'm1', from: 'member', text: 'Could I also get the piccolo part for the Fledermaus? I double on it.', at: ago(1) },
    { id: 'm2', from: 'staff', text: 'Yes, the piccolo part is in your Hub now. Open it from My parts.', at: Date.now() - 3 * 3_600_000, byName: 'Camille' },
  ],
  'fx-p26': [
    { id: 'm1', from: 'member', text: 'Has my fee for the Saturday service been sent?', at: ago(2) },
    { id: 'm2', from: 'staff', text: 'Got it, thank you. Your check goes out Friday.', at: ago(1), byName: 'Camille' },
  ],
} : {};
const fxTo = (rows: [string, string, string, string?][]) => rows.map(([personnelId, name, state, error]) => ({ personnelId, name, state, ...(error ? { error } : {}) }));
export const FIXTURE_BROADCASTS = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  { id: 'fx-b1', byEmail: 'camille@example.org', subject: 'Dress rehearsal call is 6:30', body: 'Hi {name},\n\nThe call for Saturday’s dress is 6:30, not 6:00. Black and bring your stand light.', audience: 'all', queuedAt: Date.now() - 2 * 3_600_000, status: 'queued', counts: { send: 28, noAddress: 2 } },
  { id: 'fx-b2', byEmail: 'camille@example.org', subject: 'Strings: bowings are final', body: 'The bowings in your folder are final. Please mark them tonight.', audience: 'section', section: 'Violin I', queuedAt: ago(1), status: 'queued', counts: { send: 3, noAddress: 1 } },
  { id: 'fx-b3', byEmail: 'camille@example.org', subject: 'Parking for Sunday', body: 'Use the north lot.', audience: 'all', queuedAt: ago(2), status: 'refused', reason: 'The Hub has reached its daily limit for email. Nothing was sent. Try tomorrow, or send this one from your own email.' },
] : [];
export const FIXTURE_BROADCAST_TO: Record<string, ReturnType<typeof fxTo>> = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? {
  'fx-b1': fxTo([
    ['fx-p01', 'Khoury, Rania', 'sent'], ['fx-p02', 'Kowalczyk, Dominik', 'sent'], ['fx-p03', 'Teixeira, Ines', 'sent'], ['fx-p04', 'Oyelaran, Tobi', 'sent'],
    ['fx-p05', 'Seo, Minjun', 'sent'], ['fx-p06', 'Abernathy, Quentin', 'failed', 'The address was rejected — check the email on the player’s contact record.'],
    ['fx-p09', 'Raman, Kavya', 'queued'], ['fx-p10', 'MacTavish, Fergus', 'queued'], ['fx-p13', 'Ostrowski, Marek', 'sent'], ['fx-p14', 'Al-Masri, Yusuf', 'sent'],
    ['fx-p16', 'Vanterpool, Celeste', 'no-address'], ['fx-p28', 'Dimaculangan, Paolo', 'no-address'],
  ]),
  'fx-b2': fxTo([['fx-p17', 'Okwuosa, Amara', 'sent'], ['fx-p18', 'Lindqvist, Soren', 'sent'], ['fx-p19', 'Takeda, Miyu', 'sent'], ['fx-p20', 'Whitlow, Jerome', 'no-address']]),
} : {};
export const FIXTURE_SECTION_LINKS: { section: string; url: string }[] = __ORG_PERSONNEL__ && import.meta.env.VITE_FIXTURES ? [
  { section: 'Flute', url: 'https://chat.whatsapp.com/fixture-flutes' },
  { section: 'Violin I', url: 'https://groupme.com/join_group/fixture-violin-1' },
] : [];
