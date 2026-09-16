#!/usr/bin/env node
/**
 * seed-season-repertoire.mjs
 *
 * Upserts Grant's confirmed 2026–27 orchestra repertoire into Firestore
 * `repertoire`, and links those pieces onto the matching concert events
 * (`pieceIds` + `pieceMovements` where a subset is performed).
 *
 * Idempotent: stable document IDs (`rp26-*`). Re-running overwrites the
 * seeded fields on those docs (and the linked concerts' pieceIds) so the
 * Hub stays aligned with the season program.
 *
 * Does NOT invent Drive/parts URLs. Skips WE/Chorus placeholders, unlocked
 * Opera Scenes numbers, and other directors' TBD picks.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// `--selfcheck` exercises fixEventPieces() with no credentials and no writes.
const SELFCHECK = process.argv.includes('--selfcheck');
// `--sweep-only` skips the seed and runs only the events pass (see run()).
const SWEEP_ONLY = process.argv.includes('--sweep-only');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw && !SELFCHECK) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
let db;
if (!SELFCHECK) {
  if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
  db = getFirestore();
}

const NOW = Date.now();
const BY = 'Grant Gilman (season seed)';

const SO = 'symphony-orchestra';
const WE = 'wind-ensemble';
const CHOIR = 'high-school-choir';
const CCO = 'college-chamber-orchestra';
const CAM = 'camerata-string-orchestra';
const PHIL = 'philharmonic';
const OPERA = 'opera-orchestra';

/** @type {Record<string, object>} */
const PIECES = {};

function piece(id, data) {
  PIECES[id] = {
    order: data.order ?? 0,
    updatedAt: NOW,
    updatedBy: BY,
    ...data,
  };
}

/* ─── Sept 28 — NWSA Pops ─────────────────────────────────────────────── */

piece('rp26-star-spangled-banner', {
  order: 10,
  ensembleIds: [SO, WE],
  title: 'The Star-Spangled Banner',
  fullTitle: 'The Star-Spangled Banner (harmonized and orchestrated by Igor Stravinsky)',
  composer: 'John Stafford Smith',
  composerDates: '1750–1836',
  arranger: 'Igor Stravinsky',
  year: '1814; arr. 1941',
  instrumentation: '3[1.2.pic] 2[1.2.eh] 2[1.2.bcl] 2[1.2.cbsn] — 4 3 3 1 — tmp — SATB — str',
  percussion: 'timpani',
  duration: 2,
  programNotes:
    'Francis Scott Key’s lyric on Smith’s Anacreontic melody is here in Igor Stravinsky’s 1941 harmonization and orchestration (Mercury), finished July 4, 1941: full orchestra with SATB chorus and Stravinsky’s unmistakable voice-leading on the national anthem.',
  // Freedom Tower reuses this library entry; the arrangement performed there
  // is not settled (the Stravinsky orchestration above is the Pops reading),
  // which is recorded on the event, not forked into a second anthem doc.
  eventIds: ['oc26-hs-pops', 'oc26-freedom-tower-oct'],
});

piece('rp26-american-salute', {
  order: 20,
  ensembleIds: [SO, WE],
  title: 'American Salute',
  fullTitle: 'American Salute',
  composer: 'Morton Gould',
  composerDates: '1913–1996',
  year: '1942',
  catalogNumber: 'BFOM00013',
  instrumentation: '3[1.2.pic] 2 3[1.2.bcl] 2 — 4 3 3 1 — tmp+perc — hp — pf — gtr — str',
  percussion: 'timpani, snare drum, bass drum, cymbals, mallet percussion',
  duration: 6,
  programNotes:
    'Gould wrote American Salute in 1942 as a wartime concert showpiece built on the Civil War song “When Johnny Comes Marching Home.” The 1943 published orchestration keeps the tune in constant transformation—fanfare, march, and jazz-tinged episode—before a broad closing statement.',
  eventIds: ['oc26-hs-pops', 'oc26-freedom-tower-oct'],
});

piece('rp26-hoe-down', {
  order: 30,
  ensembleIds: [SO],
  title: 'Hoe-Down',
  fullTitle: 'Hoe-Down, from Rodeo',
  composer: 'Aaron Copland',
  composerDates: '1900–1990',
  year: '1942',
  catalogNumber: 'from Four Dance Episodes from Rodeo',
  instrumentation: '3 2 2eh 2 — 4 3 3 1 — tmp+perc — pf — str',
  percussion: 'timpani, xylophone, wood block, snare drum, bass drum, cymbals',
  duration: 4,
  programNotes:
    'Rodeo (1942) is Copland’s ballet of American cowboy life; Hoe-Down is the final dance episode, a barn-dance built on fiddling tunes including “Bonyparte” and “McLeod’s Reel.” Extracted for the concert hall, it became one of Copland’s most familiar orchestral calling cards.',
  eventIds: ['oc26-hs-pops'],
});

piece('rp26-battle-hymn-wilhousky', {
  order: 40,
  ensembleIds: [SO, WE, CHOIR],
  title: 'Battle Hymn of the Republic',
  fullTitle: 'Battle Hymn of the Republic',
  composer: 'William Steffe / Julia Ward Howe',
  composerDates: 'Howe 1819–1910',
  arranger: 'Peter J. Wilhousky',
  year: '1861 / arr. 1944',
  instrumentation: '2 2 2 2 — 4 2 3 1 — tmp+perc — str + SATB (+ WE)',
  percussion: 'timpani, snare drum, bass drum, cymbals',
  duration: 3,
  programNotes:
    'Howe’s Civil War lyric rides a camp-meeting tune associated with William Steffe. Wilhousky’s mid-century concert arrangement—chorus and orchestra in a cumulative build—has been a staple of American combined-forces programs since the 1940s.',
  eventIds: ['oc26-hs-pops'],
});

piece('rp26-1812-finale-modified', {
  order: 50,
  ensembleIds: [SO, WE, CHOIR],
  title: '1812 Overture — Finale (modified)',
  fullTitle: 'Ouverture solennelle “1812,” Op. 49 — Finale (modified)',
  composer: 'Pyotr Ilyich Tchaikovsky',
  composerDates: '1840–1893',
  catalogNumber: 'Op. 49',
  year: '1880',
  instrumentation: '2[1.2.pic] 2 2 2 — 4 2 3 1 — tmp+perc — str + SATB (+ WE)',
  percussion: 'timpani, bass drum, cymbals, snare drum, triangle, cannon/effects as available',
  duration: 6,
  programNotes:
    'Tchaikovsky’s 1812 Overture commemorates Russia’s defense against Napoleon; its finale piles on artillery, bells, and the imperial anthem. This NWSA version replaces the Russian anthem with the American national anthem and brings in SATB chorus on adapted Gettysburg Address text at the chorale.',
  eventIds: ['oc26-hs-pops'],
});

piece('rp26-stars-and-stripes', {
  order: 60,
  ensembleIds: [SO, WE, CHOIR],
  title: 'The Stars and Stripes Forever',
  fullTitle: 'The Stars and Stripes Forever',
  composer: 'John Philip Sousa',
  composerDates: '1854–1932',
  year: '1896',
  instrumentation: '2[1.2.pic] 2 2 2 — 4 2 3 1 — tmp+perc — str (+ WE + chorus as performed)',
  percussion: 'timpani, snare drum, bass drum, cymbals',
  duration: 4,
  programNotes:
    'Sousa’s 1896 march—later designated the National March of the United States—pairs a swaggering trio with the famous piccolo obligato. Tonight it closes the Pops as an encore for Orchestra, Wind Ensemble, and Chorus together.',
  eventIds: ['oc26-hs-pops', 'oc26-freedom-tower-oct'],
});

/* ─── Sept 29 — College Chamber Orchestra ─────────────────────────────────
 * Re-programmed in the app 2026-09-16: Mozart 33 and the Boccherini came off
 * the concert, and three works Grant added in the app went on. They stay in
 * the library with `eventIds: []` — dropped from the PROGRAM, not retired.
 */

piece('rp26-mozart-33', {
  order: 100,
  ensembleIds: [CCO],
  title: 'Symphony No. 33',
  fullTitle: 'Symphony No. 33 in B-flat major, K. 319',
  composer: 'Wolfgang Amadeus Mozart',
  composerDates: '1756–1791',
  catalogNumber: 'K. 319',
  year: '1779',
  instrumentation: '0 2 0 2 — 2 0 0 0 — str',
  duration: 17,
  movements: [
    { title: 'Allegro assai', duration: 5 },
    { title: 'Andante moderato', duration: 5 },
    { title: 'Menuetto', duration: 3 },
    { title: 'Finale: Allegro assai', duration: 4 },
  ],
  programNotes:
    'Mozart completed K. 319 in Salzburg in July 1779, scoring it for the lean Classical wind choir of two oboes, two bassoons, and two horns with strings. The four-movement design balances a bright opening Allegro with a gracious Andante, a courtly Menuetto, and a sparkling finale; tonight’s timing assumes few or no repeats.',
  imslpUrl: 'https://imslp.org/wiki/Symphony_No.33_in_B-flat_major,_K.319_(Mozart,_Wolfgang_Amadeus)',
  // Off the Sept 29 program as of 2026-09-16 (see the section note above).
  eventIds: [],
});

piece('rp26-down-a-country-lane', {
  order: 110,
  ensembleIds: [CCO],
  title: 'Down a Country Lane',
  fullTitle: 'Down a Country Lane',
  composer: 'Aaron Copland',
  composerDates: '1900–1990',
  year: '1962',
  instrumentation: 'str',
  duration: 4,
  programNotes:
    'Copland first wrote Down a Country Lane in 1962 as a short piano piece for young players, later arranging it for school orchestra. The music is deliberately spare—open intervals and a walking melody that evoke a quiet rural landscape without rustic pastiche.',
  eventIds: ['oc26-cco-concert-sep'],
});

piece('rp26-boccherini-musica-notturna', {
  order: 120,
  ensembleIds: [CCO],
  title: 'La Musica Notturna delle Strade di Madrid',
  fullTitle: 'String Quintet in C major, Op. 30 No. 6, G. 324 — La Musica Notturna delle Strade di Madrid',
  composer: 'Luigi Boccherini',
  composerDates: '1743–1805',
  catalogNumber: 'Op. 30 No. 6 / G. 324',
  year: '1780',
  instrumentation: 'str quintet 2.1.2.0 (2 vn, va, 2 vc)',
  duration: 13,
  programNotes:
    'Boccherini’s “Night Music of the Streets of Madrid” is a programmatic string quintet that stages an evening on the Spanish capital’s streets—military tattoo, beggars’ Ave Maria, the paseo, and the retreat. Performed here in the original one-to-a-part quintet scoring (2 violins, viola, 2 cellos).',
  imslpUrl: 'https://imslp.org/wiki/6_String_Quintets,_G.319-324_(Op.30)_(Boccherini,_Luigi)',
  // Off the Sept 29 program as of 2026-09-16 (see the section note above).
  eventIds: [],
});

piece('rp26-souvenir-de-florence', {
  order: 130,
  ensembleIds: [CCO],
  title: 'Souvenir de Florence',
  fullTitle: 'Souvenir de Florence, Op. 70',
  composer: 'Pyotr Ilyich Tchaikovsky',
  composerDates: '1840–1893',
  catalogNumber: 'Op. 70',
  year: '1890; rev. 1891–92',
  instrumentation: 'str sextet 2.2.2.0 (2 vn, 2 va, 2 vc)',
  duration: 35,
  movements: [
    { title: 'Allegro con spirito', duration: 11 },
    { title: 'Adagio cantabile e con moto', duration: 10 },
    { title: 'Allegretto moderato', duration: 6 },
    { title: 'Allegro vivace', duration: 8 },
  ],
  programNotes:
    'Tchaikovsky sketched this string sextet after a stay in Florence and finished the familiar version in 1891–92. Despite the Italian title, the music speaks his Russian lyric voice—especially the long-breathed Adagio—while the outer movements demand chamber-music clarity at orchestral intensity. Dean’s Ensemble personnel play within CCO; not separately billed.',
  imslpUrl: 'https://imslp.org/wiki/Souvenir_de_Florence,_Op.70_(Tchaikovsky,_Pyotr)',
  eventIds: ['oc26-cco-concert-sep'],
});

/* ─── Nutcracker ballet (one library entry; Act II movements for pickers) ─ */

// Full Act II numbers so directors can choose the whole act, divertissement
// only, Pas de Deux, or any subset on a concert or rehearsal.
const NUT_MOVEMENTS = [
  { title: 'Scene 10 — The Magic Castle (Clara and the Nutcracker)', duration: 4 },
  { title: 'Scene 11 — Clara and the Prince / Arrival of the Sugar Plum Fairy', duration: 5 },
  { title: 'Scene 12 — Divertissement: Chocolate (Spanish Dance)', duration: 1 },
  { title: 'Scene 12 — Divertissement: Coffee (Arabian Dance)', duration: 3 },
  { title: 'Scene 12 — Divertissement: Tea (Chinese Dance)', duration: 1 },
  { title: 'Scene 12 — Divertissement: Trepak (Russian Dance)', duration: 1 },
  { title: 'Scene 12 — Divertissement: Dance of the Reed Flutes', duration: 2 },
  { title: 'Scene 12 — Divertissement: Mother Ginger and the Polichinelles', duration: 3 },
  { title: 'Scene 13 — Waltz of the Flowers', duration: 7 },
  { title: 'Scene 14 — Pas de Deux: Intrada', duration: 5 },
  { title: 'Scene 14 — Pas de Deux: Variation I (Tarantella / Cavalier)', duration: 1 },
  { title: 'Scene 14 — Pas de Deux: Variation II (Dance of the Sugar Plum Fairy)', duration: 2 },
  { title: 'Scene 14 — Pas de Deux: Coda', duration: 2 },
  { title: 'Scene 15 — Final Waltz and Apotheosis', duration: 5 },
];

piece('rp26-nutcracker-ballet', {
  order: 200,
  ensembleIds: [SO],
  title: 'Nutcracker ballet',
  fullTitle: 'The Nutcracker, Op. 71 — Act II',
  composer: 'Pyotr Ilyich Tchaikovsky',
  composerDates: '1840–1893',
  catalogNumber: 'Op. 71',
  year: '1892',
  instrumentation: '3[1.2.pic] 2 2[1.2.bcl] 2 — 4 2 3 1 — tmp+perc — 2hp — cel — str',
  percussion: 'timpani, snare drum, tambourine, triangle, cymbals, bass drum, glockenspiel, castanets (as scored per number)',
  duration: 42,
  movements: NUT_MOVEMENTS,
  programNotes:
    'Act II of The Nutcracker opens in the Kingdom of Sweets. Clara is entertained by a divertissement of character dances and the Waltz of the Flowers before the Pas de Deux for the Sugar Plum Fairy and her Cavalier and the Final Waltz and Apotheosis. One library entry covers every Act II number; each concert or rehearsal picks the subset performed that day (Festival I, Sleep No More, Concerto Competition, December Fillmore shows with Armour Dance, or a Camerata strings sectional).',
  imslpUrl: 'https://imslp.org/wiki/The_Nutcracker_(ballet),_Op.71_(Tchaikovsky,_Pyotr)',
  eventIds: [
    'oc26-workshop-1-nutcracker',
    'oc26-so-concert-oct',
    'oc26-concerto-winners',
    'oc26-nutcracker-mat',
    'oc26-nutcracker-eve',
    // Freedom Tower takes ONE number from Act II — Chocolate (Spanish Dance),
    // index 2 — via pieceMovements below. No second Nutcracker doc.
    'oc26-freedom-tower-oct',
  ],
});

/* ─── Oct 4 — Freedom Tower (working title) ───────────────────────────────
 * Two new entries only. The anthem, Stars and Stripes, American Salute and
 * the Nutcracker Spanish Dance are the EXISTING library docs above, linked
 * to this concert as well. Parts come through Copista, so `partsLinks` stays
 * empty here and program notes are deliberately unwritten.
 */

piece('rp26-falla-ritual-fire-dance', {
  order: 205,
  ensembleIds: [SO],
  title: 'Ritual Fire Dance',
  fullTitle: 'Danza ritual del fuego (Ritual Fire Dance), from El amor brujo',
  composer: 'Manuel de Falla',
  composerDates: '1876–1946',
  catalogNumber: 'from El amor brujo',
  year: '1915; rev. 1916, 1925',
  duration: 4,
  partsLinks: [],
  notes: 'Freedom Tower — Spanish half of the program. Standard published duration; time it in rehearsal, the set has a hard 20-minute cap. Edition/version TBD; parts via Copista.',
  eventIds: ['oc26-freedom-tower-oct'],
});

piece('rp26-bizet-les-toreadors', {
  order: 210,
  ensembleIds: [SO],
  title: 'Les Toréadors',
  fullTitle: 'Les Toréadors, from Carmen Suite No. 1',
  composer: 'Georges Bizet',
  composerDates: '1838–1875',
  catalogNumber: 'Carmen Suite No. 1, final movement',
  year: '1875',
  duration: 2,
  partsLinks: [],
  notes: 'Freedom Tower — Spanish-theme selection. Standard published duration; time it in rehearsal, the set has a hard 20-minute cap. Parts via Copista.',
  eventIds: ['oc26-freedom-tower-oct'],
});

/* ─── Oct 6 — Sleep No More ───────────────────────────────────────────── */

piece('rp26-chadwick-rip-van-winkle', {
  order: 220,
  ensembleIds: [SO],
  title: 'Overture to Rip Van Winkle',
  fullTitle: 'Overture to Rip Van Winkle',
  composer: 'George Whitefield Chadwick',
  composerDates: '1854–1931',
  catalogNumber: 'F. 14 / L. 2.1',
  year: '1879; rev. 1929',
  instrumentation: '2[1.2.pic] 2 2 2 — 4 2 3 1 — tmp+perc — str',
  percussion: 'timpani, percussion as in Eastman/Fischer rental',
  duration: 10,
  programNotes:
    'Chadwick’s early Leipzig overture (1879, revised 1929) takes Washington Irving’s Hudson Valley sleeper as a romantic orchestral character study—somnolent opening, rustic scherzo energy, and a broad American lyricism that already points toward Chadwick’s later New England voice.',
  eventIds: ['oc26-so-concert-oct'],
});

piece('rp26-rhapsody-in-blue-1942', {
  order: 230,
  ensembleIds: [SO],
  title: 'Rhapsody in Blue',
  fullTitle: 'Rhapsody in Blue (1942 symphonic orchestration)',
  composer: 'George Gershwin',
  composerDates: '1898–1937',
  arranger: 'Ferde Grofé',
  year: '1924; orch. 1942',
  instrumentation: '2 2 2[1.2.bcl] 2 — 3 3 3 1 — tmp+3 — 2asx.tsx — bjo — str',
  percussion: 'timpani, snare drum, bass drum, cymbals, suspended cymbal, glockenspiel, triangle, tam-tam',
  duration: 17,
  soloistName: 'Ciro Fodere',
  soloistInstrument: 'piano',
  programNotes:
    'Gershwin’s 1924 “experiment in modern music,” written for Paul Whiteman’s band, became a concert staple in Ferde Grofé’s successive orchestrations. The 1942 symphonic version—solo piano with full orchestra, saxophones, and banjo—is the Daniels-catalog scoring used for this program: clarinet glissando, bluesy episodes, and the great lyrical tune for full orchestra.',
  eventIds: ['oc26-so-concert-oct'],
});

piece('rp26-marche-des-princesses', {
  order: 240,
  ensembleIds: [SO],
  title: 'Marche des Princesses',
  fullTitle: 'Marche des Princesses, from Cendrillon',
  composer: 'Jules Massenet',
  composerDates: '1842–1912',
  catalogNumber: 'from Cendrillon (suite), mvt. VII',
  year: '1899',
  instrumentation: '3[1.2.pic] 2 2 2 — 4 2 3 1 — tmp+2 — hp — str',
  percussion: 'timpani, snare drum (tambour militaire), bass drum, cymbals, triangle',
  duration: 4,
  programNotes:
    'Massenet’s Cendrillon (1899) retells Perrault’s Cinderella with French lyric elegance and fairy-tale color. The Marche des Princesses—drawn from Act IV and published as the finale of Massenet’s own concert suite—is a ceremonial procession for the eligible princesses at the ball: bright piccolo writing, martial percussion, and a broad lyrical strain before the cortège strides to its close.',
  imslpUrl: 'https://imslp.org/wiki/Cendrillon_(suite)_(Massenet,_Jules)',
  eventIds: ['oc26-so-concert-oct'],
});

/* ─── Mar 1 — Arsht ───────────────────────────────────────────────────── */

piece('rp26-delibes-cortege', {
  order: 300,
  ensembleIds: [SO],
  title: 'Cortège de Bacchus',
  fullTitle: 'Cortège de Bacchus, from Sylvia',
  composer: 'Léo Delibes',
  composerDates: '1836–1891',
  catalogNumber: 'from Sylvia',
  year: '1876',
  instrumentation: '2 2 2 2 — 4 2 3 1 — tmp+perc — hp — str',
  percussion: 'timpani, snare drum, bass drum, cymbals, triangle',
  duration: 5,
  programNotes:
    'Delibes’s ballet Sylvia (1876) ends Act III with a festive procession for Bacchus. Lifted into the concert hall, the Cortège is a sparkling French ballet march—bright winds, ceremonial brass, and a lyrical middle strain—perfect as a concert opener.',
  eventIds: ['oc26-so-arsht'],
});

piece('rp26-lincoln-portrait', {
  order: 310,
  ensembleIds: [SO],
  title: 'Lincoln Portrait',
  fullTitle: 'Lincoln Portrait',
  composer: 'Aaron Copland',
  composerDates: '1900–1990',
  year: '1942',
  instrumentation: '2 2 2 2 — 4 3 3 1 — tmp+perc — hp — cel — str',
  percussion: 'timpani, snare drum, bass drum, cymbals, xylophone, glockenspiel (as scored)',
  duration: 14,
  programNotes:
    'Commissioned in 1942, Copland’s Lincoln Portrait frames excerpts from Lincoln’s letters and speeches—including the Gettysburg Address—with orchestral paraphrases of American tunes such as “Camptown Races” and “On Springfield Mountain.” Brass fanfares and open-interval harmony support the spoken text rather than compete with it.',
  eventIds: ['oc26-so-arsht'],
});

piece('rp26-tchaik-sym-5', {
  order: 320,
  ensembleIds: [SO],
  title: 'Symphony No. 5',
  fullTitle: 'Symphony No. 5 in E minor, Op. 64',
  composer: 'Pyotr Ilyich Tchaikovsky',
  composerDates: '1840–1893',
  catalogNumber: 'Op. 64',
  year: '1888',
  instrumentation: '3[1.2.pic] 2 2 2 — 4 2 3 1 — tmp — str',
  percussion: 'timpani',
  duration: 45,
  movements: [
    { title: 'Andante — Allegro con anima', duration: 15 },
    { title: 'Andante cantabile, con alcuna licenza', duration: 12 },
    { title: 'Valse: Allegro moderato', duration: 6 },
    { title: 'Finale: Andante maestoso — Allegro vivace', duration: 12 },
  ],
  programNotes:
    'Tchaikovsky’s Fifth (1888) is built on a recurring “Fate” motto that darkens the first movement, softens into the famous horn Andante, dances through a waltz, and is finally transformed in the E-major finale. It remains one of the central Romantic symphonies of the concert repertoire.',
  imslpUrl: 'https://imslp.org/wiki/Symphony_No.5,_Op.64_(Tchaikovsky,_Pyotr)',
  eventIds: ['oc26-so-arsht'],
});

/* ─── May 18 — Philharmonic & Camerata ────────────────────────────────── */

piece('rp26-khachaturian-spartacus-adagio', {
  order: 400,
  ensembleIds: [PHIL, CAM],
  title: 'Adagio of Spartacus and Phrygia',
  fullTitle: 'Adagio of Spartacus and Phrygia, from Spartacus Suite No. 2',
  composer: 'Aram Khachaturian',
  composerDates: '1903–1978',
  catalogNumber: 'from Spartacus Suite No. 2',
  year: '1955 (ballet); suite later',
  instrumentation: '3[1.2.pic] 2[1.2.ca] 2[1.2.bcl] 2 — 4 3 3 1 — tmp+perc — cel — hp — pf — str',
  percussion: 'timpani, percussion as in Suite No. 2 set',
  duration: 9,
  programNotes:
    'From Khachaturian’s ballet Spartacus, the Adagio of Spartacus and Phrygia is a long-breathed love duet for the Thracian rebel and his companion. Suite No. 2 opens with this movement: broad string cantabile, harp and celesta color, and a climax that made the Adagio famous far beyond the ballet stage.',
  eventIds: ['oc26-phil-camerata'],
});

piece('rp26-mascagni-intermezzo', {
  order: 410,
  ensembleIds: [PHIL, CAM],
  title: 'Intermezzo',
  fullTitle: 'Intermezzo, from Cavalleria rusticana',
  composer: 'Pietro Mascagni',
  composerDates: '1863–1945',
  catalogNumber: 'from Cavalleria rusticana',
  year: '1890',
  instrumentation: 'pic.fl.ob.cl (cued) — hp — org — str',
  duration: 4,
  programNotes:
    'Mascagni’s one-act Cavalleria rusticana (1890) pauses after the Easter drama for this wordless Intermezzo—an intimate string hymn with harp and organ that became the opera’s best-known orchestral excerpt. Brass and percussion are tacet throughout the number.',
  imslpUrl: 'https://imslp.org/wiki/Cavalleria_rusticana_(Mascagni,_Pietro)',
  eventIds: ['oc26-phil-camerata'],
});

/* ─── Camerata MPA set (library; no dedicated Hub concert yet) ────────── */

piece('rp26-holberg-suite', {
  order: 500,
  ensembleIds: [CAM],
  title: 'Holberg Suite',
  fullTitle: 'From Holberg’s Time — Suite in the Olden Style, Op. 40',
  composer: 'Edvard Grieg',
  composerDates: '1843–1907',
  catalogNumber: 'Op. 40',
  year: '1884 (piano); arr. for string orchestra 1885',
  instrumentation: 'str',
  duration: 20,
  movements: [
    { title: 'Praeludium (Allegro vivace)', duration: 3 },
    { title: 'Sarabande (Andante)', duration: 4 },
    { title: 'Gavotte (Allegretto) — Musette', duration: 4 },
    { title: 'Air (Andante religioso)', duration: 5 },
    { title: 'Rigaudon (Allegro con brio)', duration: 4 },
  ],
  programNotes:
    'Ludvig Holberg, the Danish-Norwegian playwright who gave eighteenth-century Scandinavia its comic stage, turned two hundred in 1884, and Bergen — his birthplace and Grieg’s — threw him a party. Grieg wrote this suite for it. He took five dance forms Holberg’s contemporaries would have recognized (prelude, sarabande, gavotte with musette, air, rigaudon) and wrote them in his own harmonic language, so the piece looks backward and sounds unmistakably Norwegian at the same time. He scored it first for piano, then rewrote it the following year for string orchestra, and that is the version that took hold. The writing asks the strings to do everything: the Praeludium runs on relentless sixteenths, the Air opens into some of the most exposed lyric playing in the string repertoire, and the Rigaudon hands solo violin and viola a duet before the whole band drives it home.',
  notes: 'Edition: C.F. Peters first edition — score plate 6887, parts plate 6888 (EP 1931). Score 20 pp.; parts Vn I 7, Vn II 7, Va 7, Vc 4, Cb 3. Rehearsal letters A–V are printed in both score and parts and they align. Public domain. Scans carry pencil bowings and fingerings from a Stavanger library copy — erase or reprint clean before handing to students. MPA movement not yet chosen — the whole suite is filed and linked so any movement can be pulled.',
  imslpUrl: 'https://imslp.org/wiki/Holberg_Suite,_Op.40_(Grieg,_Edvard)',
  partsSharedUrl: 'https://drive.google.com/drive/folders/1MKfrijOVfNEHH5exuferZgtK7CMf3ynZ',
  partsLinks: [
    { instrument: 'Full Score', url: 'https://drive.google.com/file/d/1IpQ6kEyYsb8aM635Obx9jb_e7f3trD7y/view' },
    { instrument: 'Violin I', url: 'https://drive.google.com/file/d/1QU_cIoKZJBO5joQ-wGGAKOio0__F8e6L/view' },
    { instrument: 'Violin II', url: 'https://drive.google.com/file/d/1rSIuUdXW0brkl10Jgxo_OLzfIKgtl9Nf/view' },
    { instrument: 'Viola', url: 'https://drive.google.com/file/d/1AHr43UezZ-62T5V-kLuw9Zxbw1ON8MG_/view' },
    { instrument: 'Violoncello', url: 'https://drive.google.com/file/d/1owsVIvR3fgCTiABDAiefDBQ6yGrt5JUN/view' },
    { instrument: 'Contrabass', url: 'https://drive.google.com/file/d/1iXo8jUfvKVxT90SLsAOF7jZyb14_tClr/view' },
  ],
});

piece('rp26-capriol-suite', {
  order: 510,
  ensembleIds: [CAM],
  title: 'Capriol Suite',
  fullTitle: 'Capriol Suite',
  composer: 'Peter Warlock',
  composerDates: '1894–1930',
  year: '1926',
  instrumentation: 'str',
  duration: 10,
  movements: [
    { title: 'Basse-Danse', duration: 2 },
    { title: 'Pavane', duration: 2 },
    { title: 'Tordion', duration: 1 },
    { title: 'Bransles', duration: 2 },
    { title: 'Pieds-en-l\'air', duration: 2 },
    { title: 'Mattachins (Sword Dance)', duration: 1 },
  ],
  programNotes:
    'Warlock’s 1926 Capriol Suite freely reimagines Renaissance dances from Arbeau’s Orchésographie for string orchestra. This season programs the slow fifth movement, Pieds-en-l’air.',
  notes: 'MPA: Pieds-en-l\'air only (movement 5).',
  imslpUrl: 'https://imslp.org/wiki/Capriol_Suite_(Warlock,_Peter)',
});

piece('rp26-danzas-de-panama', {
  order: 520,
  ensembleIds: [CAM, PHIL],
  title: 'Danzas de Panamá',
  fullTitle: 'Danzas de Panamá',
  composer: 'William Grant Still',
  composerDates: '1895–1978',
  year: '1948',
  instrumentation: 'str',
  duration: 12,
  movements: [
    { title: 'Tamborito', duration: 3 },
    { title: 'Mejorana y Socavón', duration: 3 },
    { title: 'Punto', duration: 3 },
    { title: 'Cumbia y Congo', duration: 3 },
  ],
  programNotes:
    'Still’s Danzas de Panamá (1948) presents four Panamanian dance types for string orchestra—Tamborito, Mejorana y Socavón, Punto, and Cumbia y Congo—with rhythmic bite and lyric warmth characteristic of his mid-century concert style.',
  notes: 'MPA: one movement (TBD which). May Philharmonic & Camerata concert: full suite.',
  eventIds: ['oc26-phil-camerata'],
});

/* ─── Apr — Cendrillon (production listing) ───────────────────────────── */

piece('rp26-cendrillon-opera', {
  order: 600,
  ensembleIds: [OPERA],
  title: 'Cendrillon',
  fullTitle: 'Cendrillon',
  composer: 'Jules Massenet',
  composerDates: '1842–1912',
  year: '1899',
  instrumentation: 'opera pit (edition/cuts TBD)',
  duration: 150,
  programNotes:
    'Massenet’s Cendrillon (Opéra-Comique, 1899) is a fairy-tale opéra comique after Perrault: Lucette, her stepsisters, the Fairy Godmother, and the Prince meet across four acts of lyrical French melody and enchanted orchestral color. NWSA College Opera Theatre Ensemble and Opera Orchestra present the work in April; casting and cuts are still being set.',
  eventIds: ['oc26-cendrillon-1', 'oc26-cendrillon-2'],
});

/* ─── Concert ↔ piece links (ordered programs) ────────────────────────── */

/** @type {Record<string, { pieceIds: string[], pieceMovements?: Record<string, number[]>, title?: string, notesPatch?: string }>} */
const CONCERTS = {
  'oc26-hs-pops': {
    pieceIds: [
      'rp26-star-spangled-banner',
      'rp26-american-salute',
      'rp26-hoe-down',
      'rp26-battle-hymn-wilhousky',
      'rp26-1812-finale-modified',
      'rp26-stars-and-stripes',
    ],
  },
  // The live program as Grant set it in the app on 2026-09-16, in his order.
  // Three of these are app-created library docs, so they have random ids
  // rather than `rp26-*` ones and are NOT in PIECES above — the app owns them
  // and this table only links them. Titles given so the ids are readable.
  'oc26-cco-concert-sep': {
    pieceIds: [
      'rp26-down-a-country-lane',
      'TuVUQa7drXuOP1eCAQA6', // Beethoven — Symphony 7, II. Allegretto
      '8wMBzJ7UvbJRGasgt4je', // Borodin — Polovtsian Dances, 1st Theme
      'rp26-souvenir-de-florence',
      'AGOE3ctJFoCoaQBvHhwd', // Prokofiev — Marche from The Love for Three Oranges
    ],
  },
  'oc26-workshop-1-nutcracker': {
    title: 'Festival I — The Nutcracker Project',
    pieceIds: ['rp26-nutcracker-ballet'],
    // All Act II movements available; no subset locked for the workshop day.
  },
  // Listed order, not final performance order (director, Sept 2026).
  'oc26-freedom-tower-oct': {
    pieceIds: [
      'rp26-star-spangled-banner',
      'rp26-stars-and-stripes',
      'rp26-american-salute',
      'rp26-falla-ritual-fire-dance',
      'rp26-nutcracker-ballet',
      'rp26-bizet-les-toreadors',
    ],
    pieceMovements: {
      // Chocolate (Spanish Dance) only.
      'rp26-nutcracker-ballet': [2],
    },
  },
  'oc26-so-concert-oct': {
    title: 'Sleep No More',
    pieceIds: [
      'rp26-chadwick-rip-van-winkle',
      'rp26-rhapsody-in-blue-1942',
      'rp26-marche-des-princesses',
      'rp26-nutcracker-ballet',
    ],
    pieceMovements: {
      // Intrada, Coda, Final Waltz & Apotheosis
      'rp26-nutcracker-ballet': [9, 12, 13],
    },
  },
  'oc26-concerto-winners': {
    pieceIds: ['rp26-nutcracker-ballet'],
    pieceMovements: {
      // Spanish, Arabian, Chinese, Trepak, Reed Flutes, Waltz of the Flowers
      'rp26-nutcracker-ballet': [2, 3, 4, 5, 6, 8],
    },
  },
  'oc26-so-arsht': {
    pieceIds: [
      'rp26-delibes-cortege',
      'rp26-lincoln-portrait',
      'rp26-tchaik-sym-5',
    ],
  },
  'oc26-phil-camerata': {
    pieceIds: [
      'rp26-khachaturian-spartacus-adagio',
      'rp26-mascagni-intermezzo',
      'rp26-danzas-de-panama',
    ],
  },
  'oc26-nutcracker-mat': {
    pieceIds: ['rp26-nutcracker-ballet'],
  },
  'oc26-nutcracker-eve': {
    pieceIds: ['rp26-nutcracker-ballet'],
  },
  'oc26-cendrillon-1': {
    pieceIds: ['rp26-cendrillon-opera'],
  },
  'oc26-cendrillon-2': {
    pieceIds: ['rp26-cendrillon-opera'],
  },
};

// Remap events still pointing at the retired Act II doc, and drop any
// pieceMovements key for a piece the event does not program.
// Old Act II indices → new ballet Act II list (opening scenes + full Pas de Deux inserted).
const OLD_TO_NEW = { 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9, 8: 12, 9: 13 };
const OLD = 'rp26-nutcracker-act-ii';
const NEW = 'rp26-nutcracker-ballet';

/**
 * The corrected { pieceIds, pieceMovements } for one event doc, or null when
 * it is already correct (so a sweep doesn't churn every event's updatedAt).
 * Stale keys are inert to every reader — they all look movements up by a piece
 * that is in `pieceIds` — so this is tidying, not a fix for a visible bug.
 * @param {{ pieceIds?: string[], pieceMovements?: Record<string, number[]> }} e
 */
function fixEventPieces(e) {
  const ids = e.pieceIds || [];
  const pieceIds = [...new Set(ids.map(id => (id === OLD ? NEW : id)))];
  const pm = { ...(e.pieceMovements || {}) };
  // Only an event still LISTING the retired doc carries a movement selection
  // worth remapping. A stray key on an event whose pieceIds already moved on
  // is stale data and is dropped below — never remapped over the real one.
  if (ids.includes(OLD) && pm[OLD]) {
    pm[NEW] = [...new Set(pm[OLD].map(i => OLD_TO_NEW[i] ?? i))].sort((a, b) => a - b);
  }
  for (const k of Object.keys(pm)) if (!pieceIds.includes(k)) delete pm[k];
  const same =
    JSON.stringify(pieceIds) === JSON.stringify(ids) &&
    JSON.stringify(pm) === JSON.stringify(e.pieceMovements || {});
  return same ? null : { pieceIds, pieceMovements: pm };
}

/** Apply fixEventPieces() across `events`; returns how many docs were written. */
async function sweepEvents() {
  const allEvents = await db.collection('events').get();
  let n = 0;
  for (const d of allEvents.docs) {
    const fix = fixEventPieces(d.data());
    if (!fix) continue;
    await d.ref.update(fix);
    n++;
    console.log(`  swept ${d.id}`);
  }
  console.log(`Swept ${n} of ${allEvents.size} events.`);
  return n;
}

async function run() {
  // `--sweep-only` runs the events pass and NOTHING else. The CONCERTS table
  // above is the season as seeded, not as programmed since: a director who
  // re-programs a concert in the app (oc26-cco-concert-sep, Sept 2026) has
  // the newer truth, and a full re-run would hand the concert back its
  // seeded program. Use this when the reason to run is the sweep.
  if (SWEEP_ONLY) {
    console.log('sweep-only: repertoire upserts and concert links skipped.');
    return sweepEvents();
  }

  const writer = db.bulkWriter();
  let nPieces = 0;
  for (const [id, data] of Object.entries(PIECES)) {
    writer.set(db.collection('repertoire').doc(id), data, { merge: true });
    nPieces++;
  }
  // Retired: Act II was a second Nutcracker doc. One ballet entry now.
  writer.delete(db.collection('repertoire').doc('rp26-nutcracker-act-ii'));

  let nConcerts = 0;
  for (const [eventId, patch] of Object.entries(CONCERTS)) {
    const ref = db.collection('events').doc(eventId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`Concert ${eventId} missing — skipping piece link (import calendar first).`);
      continue;
    }
    const update = {
      pieceIds: patch.pieceIds,
      pieceMovements: patch.pieceMovements || {},
    };
    if (patch.title) update.title = patch.title;
    // mergeFields, NOT { merge: true }: merge builds its update mask from the
    // LEAVES of the data, so `pieceMovements` deep-merges and keys from retired
    // piece ids survive every run (which is the opposite of what this write
    // wants, and is how oc26-so-concert-oct collected two of them). mergeFields
    // masks the named field itself, so the whole map is replaced.
    writer.set(ref, update, { mergeFields: Object.keys(update) });
    nConcerts++;
  }

  await writer.close();

  const nMigrated = await sweepEvents();

  console.log(`Upserted ${nPieces} repertoire pieces; linked ${nConcerts} concerts; migrated/swept ${nMigrated} events.`);
}

function selfcheck() {
  const eq = (a, b, msg) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.error(`FAIL ${msg}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`);
      process.exit(1);
    }
  };

  // The live oc26-so-concert-oct shape: the seeded key plus two stale ones.
  eq(
    fixEventPieces({
      pieceIds: ['rp26-chadwick-rip-van-winkle', NEW],
      pieceMovements: { [NEW]: [9, 12, 13], O5i8gpy6DG3rCQ4sh6BT: [10, 11], [OLD]: [7, 8, 9] },
    }),
    { pieceIds: ['rp26-chadwick-rip-van-winkle', NEW], pieceMovements: { [NEW]: [9, 12, 13] } },
    'stale keys dropped, seeded selection untouched',
  );

  // A stray OLD key must never be remapped OVER the real selection.
  eq(
    fixEventPieces({ pieceIds: [NEW], pieceMovements: { [NEW]: [2], [OLD]: [0] } }),
    { pieceIds: [NEW], pieceMovements: { [NEW]: [2] } },
    'stray Act II key does not clobber the ballet selection',
  );

  // An event still LISTING the retired doc is migrated, indices remapped.
  eq(
    fixEventPieces({ pieceIds: [OLD], pieceMovements: { [OLD]: [0, 8] } }),
    { pieceIds: [NEW], pieceMovements: { [NEW]: [2, 12] } },
    'Act II migration',
  );

  // Already correct → no write (an events-wide sweep must not churn updatedAt).
  eq(fixEventPieces({ pieceIds: [NEW], pieceMovements: { [NEW]: [2] } }), null, 'unchanged = null');
  eq(fixEventPieces({}), null, 'empty event = null');
  // Absent pieceMovements means "every movement" — never invent an empty map.
  eq(fixEventPieces({ pieceIds: [NEW] }), null, 'no movement map = null');

  console.log('seed-season-repertoire.selfcheck: ok');
}

if (SELFCHECK) {
  selfcheck();
} else {
  run()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
