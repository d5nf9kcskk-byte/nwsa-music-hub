#!/usr/bin/env node
/**
 * import-official-calendar.mjs
 *
 * Imports the official NWSA CALENDAR OF EVENTS 2026-27 brochure into
 * Firestore (run via the "Import Official Calendar" GitHub Action).
 *
 *  • MUSIC division events become full Concert events on the correct
 *    ensembles, with venue addresses and ticket prices (director-confirmed
 *    ensemble mappings, July 2026).
 *  • DANCE / THEATRE / VISUAL ARTS events are classified under division
 *    entries (created as ensembles with high sort orders so they list last).
 *  • Deletes ALL existing type==='Concert' events (replaced by this import)
 *    and any previous oc26-* import docs. Rehearsals, sectionals, and the
 *    seeded school-day entries are never touched.
 *
 * Idempotent: stable oc26-* ids; re-running converges on the same state.
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON (GitHub secret)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
let serviceAccount;
try { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — aborting.'); process.exit(1); }
if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/* ── Ensembles that must exist ─────────────────────────────────────────── */
// Philharmonic: named by the director for the baseline roster mapping.
// Division entries: high `order` so they sort after the music ensembles.
const ENSURE_ENSEMBLES = [
  { id: 'philharmonic', name: 'Philharmonic', order: 9 },
  { id: 'dance',        name: 'Dance',        order: 20, color: '#e11d8f' },
  { id: 'theatre',      name: 'Theatre',      order: 21, color: '#b45309' },
  { id: 'visual-arts',  name: 'Visual Arts',  order: 22, color: '#57534e' },
];

/* ── Venues (from the brochure's venue directory) ──────────────────────── */
const V = {
  wolfsonAud:   { location: 'MDC Wolfson Auditorium',                 venueAddress: '300 NE 2 Avenue, Room 1261, Miami' },
  chapman:      { location: 'MDC Wolfson Chapman Conference Center',  venueAddress: '245 NE 4 Street, Room 3210, Miami' },
  batten:       { location: 'MDC Wolfson James K. Batten Room',       venueAddress: '300 NE 2 Avenue, Room 2106, Miami' },
  lehman:       { location: 'MDC North Campus Lehman Theater',        venueAddress: '11380 NW 27 Avenue, Miami' },
  lyric:        { location: 'Black Archives Historic Lyric Theater',  venueAddress: '819 NW 2 Avenue, Miami' },
  trinity:      { location: 'Trinity Episcopal Cathedral',            venueAddress: '464 NE 16 Street, Miami' },
  knight:       { location: 'Adrienne Arsht Center — Knight Concert Hall', venueAddress: '1300 Biscayne Boulevard, Miami' },
  ziff:         { location: 'Adrienne Arsht Center — Ziff Ballet Opera House', venueAddress: '1300 Biscayne Boulevard, Miami' },
  danceTheater: { location: 'New World Dance Theater',                venueAddress: '25 NE 2 Street, 8th Floor, Miami' },
  gerrits:      { location: 'Louise O. Gerrits Theater',              venueAddress: '25 NE 2 Street, 8th Floor, Miami' },
  studios:      { location: 'NWSA Theatre Studios',                   venueAddress: '25 NE 2 Street, 9th Floor, Miami' },
  gallery:      { location: 'New World Gallery',                      venueAddress: '25 NE 2 Street, Lobby, Miami' },
  koubek:       { location: 'The Koubek Center at MDC',               venueAddress: '2705 SW 3 Street, Miami' },
  fillmore:     { location: 'The Fillmore Miami Beach at the Jackie Gleason Theater', venueAddress: '1700 Washington Avenue, Miami Beach' },
  aventura:     { location: 'Aventura Arts & Cultural Center',        venueAddress: '3385 NE 188 Street, Aventura' },
  moca:         { location: 'MOCA North Miami',                       venueAddress: '770 NE 125 Street, North Miami' },
  bakehouse:    { location: 'Bakehouse Art Complex',                  venueAddress: '561 NW 32 Street, Miami' },
  moad:         { location: 'MOAD Freedom Tower',                     venueAddress: '600 Biscayne Boulevard, Miami' },
};

const FREE   = 'Free and open to the public.';
const T10_5  = 'Tickets: General admission $10; students & seniors $5.';
const T12_5  = 'Tickets: General admission $12; students & seniors $5. Ages 12+.';
const T15_10 = 'Tickets: General admission $15; students & seniors $10. Ages 12+.';
const ALL_MUSIC = [
  'symphony-orchestra', 'wind-ensemble', 'camerata-string-orchestra',
  'jazz-ensemble', 'chamber-winds', 'college-chamber-orchestra',
  'high-school-choir', 'opera-orchestra', 'philharmonic',
];

let n = 0;
function ev(slug, type, ensembleIds, date, startTime, venue, title, notes, extra = {}) {
  n += 1;
  return {
    id: `oc26-${slug}`,
    type, ensembleIds, date, startTime,
    location: venue.location, venueAddress: venue.venueAddress,
    title, notes, status: 'Scheduled', ...extra,
  };
}

/* ── MUSIC DIVISION (director-confirmed ensemble mappings) ─────────────── */
const EVENTS = [
  // Faculty recitals: faculty perform; ALL students (all divisions) required to attend.
  ev('faculty-recital-aug', 'Concert', [], '2026-08-31', '18:30', V.wolfsonAud, 'NWSA Music Faculty Recital',
    `${FREE} All NWSA students (all divisions) are required to attend.`, { attendanceEnsembleIds: ALL_MUSIC }),
  ev('hs-pops', 'Concert', ['symphony-orchestra', 'wind-ensemble', 'high-school-choir'], '2026-09-28', '19:00', V.chapman,
    'High School Pops Concert', T10_5),
  ev('cco-concert-sep', 'Concert', ['college-chamber-orchestra'], '2026-09-29', '18:30', V.wolfsonAud,
    'College Chamber Orchestra Concert', FREE),
  ev('so-concert-oct', 'Concert', ['symphony-orchestra'], '2026-10-06', '19:00', V.chapman,
    'Symphony Orchestra Concert', T10_5),
  ev('hs-voice-oct', 'Concert', ['high-school-choir'], '2026-10-19', '19:00', V.wolfsonAud,
    'High School Voice Concert', T10_5),
  ev('we-jazz-oct', 'Concert', ['wind-ensemble', 'jazz-ensemble'], '2026-10-20', '19:00', V.chapman,
    'High School Wind Ensemble & Jazz Ensemble Concert', T10_5),
  ev('opera-scenes', 'Concert', ['college-chamber-orchestra'], '2026-10-26', '18:30', V.wolfsonAud,
    'Opera Scenes', `${FREE} NWSA College Opera Theatre Ensemble with the College Chamber Orchestra. Symphony Orchestra members are required to attend.`,
    { attendanceEnsembleIds: ['symphony-orchestra'] }),
  ev('concerto-winners', 'Concert', ['symphony-orchestra'], '2026-11-16', '19:00', V.lyric,
    "Concerto Competition Winners' Concert", FREE),
  ev('cc-comp-piano-nov', 'Concert', ['college-chamber-orchestra'], '2026-11-30', '18:30', V.batten,
    'College Chamber, Composition & Piano Recital', `${FREE} Symphony Orchestra members are required to attend.`,
    { attendanceEnsembleIds: ['symphony-orchestra'] }),
  ev('jazz-combos-dec', 'Concert', ['jazz-ensemble'], '2026-12-03', '19:00', V.wolfsonAud,
    'High School Jazz Combos Concert', FREE),
  ev('we-jazz-dec', 'Concert', ['wind-ensemble', 'jazz-ensemble'], '2026-12-09', '19:00', V.chapman,
    'High School Wind Ensemble & Jazz Ensemble Concert', T10_5),
  ev('choir-holiday', 'Concert', ['high-school-choir'], '2026-12-10', '19:00', V.trinity,
    'High School Choir Holiday Concert', T10_5),
  ev('faculty-recital-jan', 'Concert', [], '2027-01-25', '18:30', V.wolfsonAud, 'NWSA Music Faculty Recital',
    `${FREE} All NWSA students (all divisions) are required to attend.`, { attendanceEnsembleIds: ALL_MUSIC }),
  ev('we-jazz-feb', 'Concert', ['wind-ensemble', 'jazz-ensemble'], '2027-02-08', '19:00', V.chapman,
    'High School Wind Ensemble & Jazz Ensemble Concert', T10_5),
  ev('side-by-side', 'Concert', ['college-chamber-orchestra', 'symphony-orchestra'], '2027-02-09', '18:30', V.chapman,
    'NWSA + MDC Side by Side Ensemble Concert', FREE),
  ev('so-arsht', 'Concert', ['symphony-orchestra'], '2027-03-01', '19:30', V.knight,
    'NWSA Symphony Orchestra Concert', 'Tickets: General admission $20; students & seniors $10.'),
  ev('cendrillon-1', 'Concert', ['opera-orchestra'], '2027-04-10', '19:00', V.lehman,
    'Opera: Cendrillon', `Opera by Jules Massenet. NWSA College Opera Theatre Ensemble with the NWSA Opera Orchestra. ${T10_5.replace(' Ages 12+.', '')}`),
  ev('cendrillon-2', 'Concert', ['opera-orchestra'], '2027-04-11', '14:00', V.lehman,
    'Opera: Cendrillon', `Opera by Jules Massenet. NWSA College Opera Theatre Ensemble with the NWSA Opera Orchestra. ${T10_5.replace(' Ages 12+.', '')}`),
  ev('cc-comp-piano-apr', 'Concert', ['college-chamber-orchestra'], '2027-04-12', '18:30', V.wolfsonAud,
    'College Chamber, Composition & Piano Recital', `${FREE} Symphony Orchestra members are required to attend.`,
    { attendanceEnsembleIds: ['symphony-orchestra'] }),
  ev('hs-voice-apr', 'Concert', ['high-school-choir'], '2027-04-13', '19:00', V.wolfsonAud,
    'High School Voice Concert', T10_5),
  ev('jazz-combos-apr', 'Concert', ['jazz-ensemble'], '2027-04-29', '19:00', V.wolfsonAud,
    'High School Jazz Combos Concert', FREE),
  ev('choir-may', 'Concert', ['high-school-choir'], '2027-05-17', '19:00', V.wolfsonAud,
    'High School Choir Concert', T10_5),
  ev('phil-camerata', 'Concert', ['philharmonic', 'camerata-string-orchestra'], '2027-05-18', '19:00', V.chapman,
    'High School Philharmonic & Camerata Concert', T10_5),
  ev('we-jazz-may', 'Concert', ['wind-ensemble', 'jazz-ensemble'], '2027-05-19', '19:00', V.chapman,
    'High School Wind Ensemble & Jazz Ensemble Concert', T10_5),

  // The Nutcracker: Dance production, Symphony Orchestra performs (director-confirmed).
  ev('nutcracker-mat', 'Concert', ['symphony-orchestra', 'dance'], '2026-12-12', '14:00', V.fillmore,
    'The Nutcracker (matinee)', 'Tickets: General admission $15 – $35. NWSA Dance with the Symphony Orchestra.'),
  ev('nutcracker-eve', 'Concert', ['symphony-orchestra', 'dance'], '2026-12-12', '19:00', V.fillmore,
    'The Nutcracker (evening)', 'Tickets: General admission $15 – $35. NWSA Dance with the Symphony Orchestra.'),

  /* ── DANCE ─────────────────────────────────────────────────────────── */
  ev('dance-sampler', 'Event', ['dance'], '2026-10-17', '20:00', V.danceTheater, 'Daniel Lewis Dance Sampler',
    'Presented by NWSA, FDEO & Dance Now! Miami. Tickets: General admission $25; students & seniors $15.'),
  ev('battle-taylor', 'Event', ['dance'], '2026-10-24', '19:00', V.danceTheater, 'Robert Battle and Paul Taylor',
    'New World Dance Ensemble with special guest artist John Harnage, Paul Taylor Dance Company. NWSA 40th Anniversary Reception follows the performance. Tickets: General admission $20.'),
  ev('nwde-aventura', 'Event', ['dance'], '2026-11-13', '20:00', V.aventura, 'New World Dance Ensemble @ Aventura',
    'Tickets: General admission $12, at aventuracenter.org.'),
  ev('autumn-dances-1', 'Event', ['dance'], '2026-11-19', '19:00', V.danceTheater, 'Autumn Dances', 'New World Dance Ensemble. Tickets: General admission $10.'),
  ev('autumn-dances-2', 'Event', ['dance'], '2026-11-20', '19:00', V.danceTheater, 'Autumn Dances', 'New World Dance Ensemble. Tickets: General admission $10.'),
  ev('dancemakers-1', 'Event', ['dance'], '2026-12-04', '19:00', V.danceTheater, 'Dancemakers: New Works', 'Tickets: General admission $5.'),
  ev('dancemakers-2', 'Event', ['dance'], '2026-12-05', '19:00', V.danceTheater, 'Dancemakers: New Works', 'Tickets: General admission $5.'),
  ev('hs-choreography', 'Event', ['dance'], '2027-02-19', '19:00', V.danceTheater, 'NWSA High School Student Choreography', 'Tickets: General admission $5.'),
  ev('bfa-dance-1', 'Event', ['dance'], '2027-02-26', '19:00', V.danceTheater, 'College BFA Dance', 'Tickets: General admission $5.'),
  ev('bfa-dance-2', 'Event', ['dance'], '2027-02-27', '19:00', V.danceTheater, 'College BFA Dance', 'Tickets: General admission $5.'),
  ev('spring-dances-1', 'Event', ['dance'], '2027-04-22', '19:00', V.danceTheater, 'Spring Dances', 'Tickets: General admission $15; students & seniors $5.'),
  ev('spring-dances-2', 'Event', ['dance'], '2027-04-23', '19:00', V.danceTheater, 'Spring Dances', 'Tickets: General admission $15; students & seniors $5.'),
  ev('spring-dances-3', 'Event', ['dance'], '2027-04-24', '19:00', V.danceTheater, 'Spring Dances', 'Tickets: General admission $15; students & seniors $5.'),
  ev('spring-dances-4', 'Event', ['dance'], '2027-04-25', '14:00', V.danceTheater, 'Spring Dances (matinee)', 'Tickets: General admission $15; students & seniors $5.'),
  ev('hs-spring-dance-1', 'Event', ['dance'], '2027-05-07', '19:00', V.danceTheater, 'High School Spring Dance Concert', 'Tickets: General admission $15; students & seniors $5.'),
  ev('hs-spring-dance-2', 'Event', ['dance'], '2027-05-08', '14:00', V.danceTheater, 'High School Spring Dance Concert', 'Shows at 2pm & 7pm. Tickets: General admission $15; students & seniors $5.'),
  ev('hs-spring-dance-3', 'Event', ['dance'], '2027-05-14', '19:00', V.danceTheater, 'High School Spring Dance Concert', 'Tickets: General admission $15; students & seniors $5.'),
  ev('hs-spring-dance-4', 'Event', ['dance'], '2027-05-15', '14:00', V.danceTheater, 'High School Spring Dance Concert', 'Shows at 2pm & 7pm. Tickets: General admission $15; students & seniors $5.'),
  ev('senior-dance', 'Event', ['dance'], '2027-05-20', '19:00', V.danceTheater, 'High School Senior Dance Showcase', 'Tickets: General admission $5.'),

  /* ── THEATRE ───────────────────────────────────────────────────────── */
  ev('dracula-1', 'Event', ['theatre'], '2026-10-09', '19:30', V.gerrits, 'Dracula', `By Kate Hamill, directed by James Samuel Randolph. High School Mainstage Play. ${T12_5}`),
  ev('dracula-2', 'Event', ['theatre'], '2026-10-10', '14:00', V.gerrits, 'Dracula', `Shows at 2pm & 7:30pm. By Kate Hamill, directed by James Samuel Randolph. High School Mainstage Play. ${T12_5}`),
  ev('dracula-3', 'Event', ['theatre'], '2026-10-16', '19:30', V.gerrits, 'Dracula', `By Kate Hamill, directed by James Samuel Randolph. High School Mainstage Play. ${T12_5}`),
  ev('dracula-4', 'Event', ['theatre'], '2026-10-17', '14:00', V.gerrits, 'Dracula', `Shows at 2pm & 7:30pm. By Kate Hamill, directed by James Samuel Randolph. High School Mainstage Play. ${T12_5}`),
  ev('ordinary-days-1', 'Event', ['theatre'], '2026-10-22', '19:30', V.studios, 'Ordinary Days', 'Studio 5902. College Studio Musical by Adam Gwon, directed by Matthew Buffalo. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('ordinary-days-2', 'Event', ['theatre'], '2026-10-23', '19:30', V.studios, 'Ordinary Days', 'Studio 5902. College Studio Musical by Adam Gwon, directed by Matthew Buffalo. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('ordinary-days-3', 'Event', ['theatre'], '2026-10-24', '14:00', V.studios, 'Ordinary Days', 'Shows at 2pm & 7:30pm. Studio 5902. College Studio Musical by Adam Gwon, directed by Matthew Buffalo. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('tempest-1', 'Event', ['theatre'], '2026-11-20', '19:30', V.gerrits, 'The Tempest', `By William Shakespeare, directed by Jennifer de Castroverde. College Mainstage Play. ${T12_5}`),
  ev('tempest-2', 'Event', ['theatre'], '2026-11-21', '14:00', V.gerrits, 'The Tempest', `Shows at 2pm & 7:30pm. By William Shakespeare, directed by Jennifer de Castroverde. College Mainstage Play. ${T12_5}`),
  ev('tempest-3', 'Event', ['theatre'], '2026-12-04', '19:30', V.gerrits, 'The Tempest', `By William Shakespeare, directed by Jennifer de Castroverde. College Mainstage Play. ${T12_5}`),
  ev('tempest-4', 'Event', ['theatre'], '2026-12-05', '14:00', V.gerrits, 'The Tempest', `Shows at 2pm & 7:30pm. By William Shakespeare, directed by Jennifer de Castroverde. College Mainstage Play. ${T12_5}`),
  ev('one-festival-1', 'Event', ['theatre'], '2026-12-08', '16:30', V.koubek, 'The One Festival', 'Bill A at 4:30pm, Bill B at 7:30pm. College Senior Project coordinated by Andie Arthur. General admission $5. Ages 12+.'),
  ev('one-festival-2', 'Event', ['theatre'], '2026-12-09', '16:30', V.koubek, 'The One Festival', 'Bill C at 4:30pm, Bill A at 7:30pm. College Senior Project coordinated by Andie Arthur. General admission $5. Ages 12+.'),
  ev('one-festival-3', 'Event', ['theatre'], '2026-12-11', '16:30', V.koubek, 'The One Festival', 'Bill B at 4:30pm, Bill C at 7:30pm. College Senior Project coordinated by Andie Arthur. General admission $5. Ages 12+.'),
  ev('playwrights-1', 'Event', ['theatre'], '2027-01-12', '17:00', V.studios, "New Playwrights' Festival: Fringe Edition", 'Bill A at 5pm, Bill B at 7:30pm. Studios 5902, 5903, 5904, 5914. Coordinated by Maggie Maxwell. General admission $5. Ages 12+.'),
  ev('playwrights-2', 'Event', ['theatre'], '2027-01-13', '17:00', V.studios, "New Playwrights' Festival: Fringe Edition", 'Bill B at 5pm, Bill A at 7:30pm. Studios 5902, 5903, 5904, 5914. Coordinated by Maggie Maxwell. General admission $5. Ages 12+.'),
  ev('ppt-1', 'Event', ['theatre'], '2027-02-18', '19:30', V.studios, 'People, Places and Things', 'Studio 5903. By Duncan Macmillan, directed by Jennifer de Castroverde. College Studio Play. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('ppt-2', 'Event', ['theatre'], '2027-02-19', '19:30', V.studios, 'People, Places and Things', 'Studio 5903. By Duncan Macmillan, directed by Jennifer de Castroverde. College Studio Play. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('ppt-3', 'Event', ['theatre'], '2027-02-20', '14:00', V.studios, 'People, Places and Things', 'Shows at 2pm & 7:30pm. Studio 5903. By Duncan Macmillan, directed by Jennifer de Castroverde. College Studio Play. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('xanadu-1', 'Event', ['theatre'], '2027-02-26', '19:30', V.gerrits, 'Xanadu', `College Mainstage Musical. Book by Douglas Carter Beane; music & lyrics by Jeff Lynne and John Farrar; directed by Matthew Buffalo. NWSA Music division performs. ${T15_10}`),
  ev('xanadu-2', 'Event', ['theatre'], '2027-02-27', '14:00', V.gerrits, 'Xanadu', `Shows at 2pm & 7:30pm. College Mainstage Musical. Book by Douglas Carter Beane; music & lyrics by Jeff Lynne and John Farrar; directed by Matthew Buffalo. NWSA Music division performs. ${T15_10}`),
  ev('xanadu-3', 'Event', ['theatre'], '2027-03-05', '19:30', V.gerrits, 'Xanadu', `College Mainstage Musical. Book by Douglas Carter Beane; music & lyrics by Jeff Lynne and John Farrar; directed by Matthew Buffalo. NWSA Music division performs. ${T15_10}`),
  ev('xanadu-4', 'Event', ['theatre'], '2027-03-06', '14:00', V.gerrits, 'Xanadu', `Shows at 2pm & 7:30pm. College Mainstage Musical. Book by Douglas Carter Beane; music & lyrics by Jeff Lynne and John Farrar; directed by Matthew Buffalo. NWSA Music division performs. ${T15_10}`),
  ev('the-game-1', 'Event', ['theatre'], '2027-04-08', '19:30', V.gerrits, 'The Game', `By Bekah Brunstetter, directed by Alan Patrick Kenny. College Mainstage Play. ${T12_5}`),
  ev('the-game-2', 'Event', ['theatre'], '2027-04-09', '19:30', V.gerrits, 'The Game', `By Bekah Brunstetter, directed by Alan Patrick Kenny. College Mainstage Play. ${T12_5}`),
  ev('the-game-3', 'Event', ['theatre'], '2027-04-10', '14:00', V.gerrits, 'The Game', `Shows at 2pm & 7:30pm. By Bekah Brunstetter, directed by Alan Patrick Kenny. College Mainstage Play. ${T12_5}`),
  ev('into-woods-1', 'Event', ['theatre'], '2027-04-15', '19:30', V.studios, 'Into the Woods', 'Studio 5902. College Studio Musical by Stephen Sondheim & James Lapine, directed by James Samuel Randolph. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('into-woods-2', 'Event', ['theatre'], '2027-04-16', '19:30', V.studios, 'Into the Woods', 'Studio 5902. College Studio Musical by Stephen Sondheim & James Lapine, directed by James Samuel Randolph. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('into-woods-3', 'Event', ['theatre'], '2027-04-17', '14:00', V.studios, 'Into the Woods', 'Shows at 2pm & 7:30pm. Studio 5902. College Studio Musical by Stephen Sondheim & James Lapine, directed by James Samuel Randolph. General admission $5; limited seating, reserve online. Ages 12+.'),
  ev('anything-goes-1', 'Event', ['theatre'], '2027-04-30', '19:30', V.gerrits, 'Anything Goes', 'High School Mainstage Musical by Cole Porter, directed by Silas Hoover. NWSA Music division performs. Tickets: General admission $15; students & seniors $10. Ages 6+.'),
  ev('anything-goes-2', 'Event', ['theatre'], '2027-05-01', '14:00', V.gerrits, 'Anything Goes', 'Shows at 2pm & 7:30pm. High School Mainstage Musical by Cole Porter, directed by Silas Hoover. NWSA Music division performs. Tickets: General admission $15; students & seniors $10. Ages 6+.'),
  ev('anything-goes-3', 'Event', ['theatre'], '2027-05-07', '19:30', V.gerrits, 'Anything Goes', 'High School Mainstage Musical by Cole Porter, directed by Silas Hoover. NWSA Music division performs. Tickets: General admission $15; students & seniors $10. Ages 6+.'),
  ev('anything-goes-4', 'Event', ['theatre'], '2027-05-08', '14:00', V.gerrits, 'Anything Goes', 'Shows at 2pm & 7:30pm. High School Mainstage Musical by Cole Porter, directed by Silas Hoover. NWSA Music division performs. Tickets: General admission $15; students & seniors $10. Ages 6+.'),

  /* ── VISUAL ARTS (exhibition receptions + talk series; all free) ────── */
  ev('va-innominate', 'Event', ['visual-arts'], '2026-08-22', '17:00', V.gallery, 'Innominate Student Union: Main Offices — Opening Reception', `Exhibition runs August 22 – September 26. Reception 5–8pm. ${FREE}`),
  ev('va-living-networks', 'Event', ['visual-arts'], '2026-10-24', '17:00', V.gallery, 'Living Networks — Opening Reception', `Curated by O. Gustavo Plascencia. Exhibition runs October 24 – November 10. Reception 5–8pm. ${FREE}`),
  ev('va-interwoven', 'Event', ['visual-arts'], '2026-12-03', '17:00', V.gallery, 'Interwoven — Reception', `Youth Stewardship From Deep Ocean To Deep Space. Exhibition runs November 21 – January 5. Reception 5–8pm. ${FREE}`),
  ev('va-off-the-wall', 'Event', ['visual-arts'], '2027-02-27', '17:00', V.gallery, 'Off the Wall — Reception', `Exhibition runs January 19 – February 27. Reception 5–8pm. ${FREE}`),
  ev('va-bfa', 'Event', ['visual-arts'], '2027-04-24', '17:00', { location: 'Venue announced on the NWSA website', venueAddress: '' }, 'BFA Exhibition — Opening Reception', `Exhibition runs April 24 – May 8. Reception 5–8pm. ${FREE}`),
  ev('va-residencies', 'Event', ['visual-arts'], '2027-05-01', '17:00', V.gallery, 'Residencies — Opening Reception', `Curated by Jose Luis Garcia & Ryan Sluggett. Exhibition runs May 1–7. Reception 5–8pm. ${FREE}`),
  ev('va-prelude', 'Event', ['visual-arts'], '2027-05-15', '17:00', V.gallery, 'Prelude VII: 2027 Senior Showcase — Opening Reception', `Exhibition runs May 15–29. Reception 5–8pm. ${FREE}`),
  ev('va-meets-1', 'Event', ['visual-arts'], '2026-09-08', '14:00', V.wolfsonAud, 'New World Meets for Conversations: Jose Luis Garcia', `Alum & faculty. ${FREE}`),
  ev('va-meets-2', 'Event', ['visual-arts'], '2026-10-27', '14:00', V.wolfsonAud, 'New World Meets for Conversations: Nabila Santa-Cristo', `Alumna & faculty. ${FREE}`),
  ev('va-meets-3', 'Event', ['visual-arts'], '2027-01-26', '14:00', V.wolfsonAud, 'New World Meets for Conversations: Ryan Sluggett', `Faculty. ${FREE}`),
  ev('va-meets-4', 'Event', ['visual-arts'], '2027-02-16', '14:00', V.wolfsonAud, 'New World Meets for Conversations: Jenny Gifford', `Faculty. ${FREE}`),
  ev('va-cafecito-1', 'Event', ['visual-arts'], '2026-09-20', '14:00', V.moca, 'New World Meets for Cafecito', FREE),
  ev('va-cafecito-2', 'Event', ['visual-arts'], '2027-01-17', '14:00', V.bakehouse, 'New World Meets for Cafecito', FREE),
  ev('va-cafecito-3', 'Event', ['visual-arts'], '2027-02-07', '14:00', V.moad, 'New World Meets for Cafecito', FREE),

  /* ── SCHOOL-WIDE (Rising Stars signature showcase) ─────────────────── */
  // Exhibition runs March 15–21 with the reception on March 17 (brochure:
  // "SIGNATURE SHOWCASE EXHIBITION March 15-21; Reception: March 17; 5-8pm") —
  // this previously said March 18, off by a day from the printed brochure.
  ev('rising-stars-exhibit', 'Event', [], '2027-03-17', '17:00', V.gallery, 'Rising Stars Exhibition — Reception',
    `Rising Stars Signature Showcase. Exhibition runs March 15–21. Reception 5–8pm. ${FREE}`),
  ev('rising-stars-performance', 'Event', [], '2027-03-18', '19:30', V.ziff, 'Rising Stars: Performance & VIP Reception',
    'Rising Stars Signature Showcase, directed by Alan Patrick Kenny. Admission $35, $20; VIP $250, $150.'),

  /* ── SCHOOL-WIDE (Convergence — date confirmed, details TBD) ────────── */
  // startTime/location left blank (not undefined — the Admin SDK rejects
  // undefined field values) until the director fills them in from the
  // Schedule screen.
  ev('convergence', 'Event', [], '2026-09-12', '', { location: 'TBD', venueAddress: '' }, 'Convergence',
    'Time and location TBD.'),
];

/* ── Run ───────────────────────────────────────────────────────────────── */
async function run() {
  // 1. Ensure required ensembles/divisions exist (never overwrite existing).
  const ensSnap = await db.collection('ensembles').get();
  const have = new Set(ensSnap.docs.map(d => d.id));
  for (const { id, ...data } of ENSURE_ENSEMBLES) {
    if (!have.has(id)) {
      await db.collection('ensembles').doc(id).set(data);
      console.log(`Created ensemble/division: ${data.name}`);
    }
  }

  // 2. Delete replaced events: every Concert + any previous oc26-* import.
  const evSnap = await db.collection('events').get();
  const toDelete = evSnap.docs.filter(d => d.data().type === 'Concert' || d.id.startsWith('oc26-'));
  console.log(`Deleting ${toDelete.length} events (existing concerts + previous imports) of ${evSnap.size} total…`);
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch();
    toDelete.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // 3. Write the official calendar.
  for (let i = 0; i < EVENTS.length; i += 400) {
    const batch = db.batch();
    for (const { id, ...data } of EVENTS.slice(i, i + 400)) {
      batch.set(db.collection('events').doc(id), data);
    }
    await batch.commit();
  }
  const concerts = EVENTS.filter(e => e.type === 'Concert').length;
  console.log(`Imported ${EVENTS.length} events (${concerts} concerts, ${EVENTS.length - concerts} division/school events).`);
}

run().then(() => { console.log('Done.'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
