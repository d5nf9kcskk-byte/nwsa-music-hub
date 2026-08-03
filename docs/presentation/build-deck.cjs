const pptxgen = require('pptxgenjs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');   // repo root, wherever it's checked out
const OUT = path.join(REPO, 'docs/presentation/NWSA-Music-Hub-Directors.pptx');
const LOGO = path.join(REPO, 'public/nwsa-logo.png');

/* ── Palette: the app's own brand teal (#0d7e8e, the PWA theme-color) ── */
const TEAL = '0D7E8E';
const DEEP = '0A5560';
const DARKBG = '0C272E';
const GOLD = 'B8862B';
const INK = '17272B';
const MUTED = '5C6E73';
const CARD = 'F1F6F7';
const CARDLINE = 'D8E4E6';
const WHITE = 'FFFFFF';

const HEAD = 'Cambria';
const BODY = 'Calibri';

const W = 13.333, H = 7.5;
const M = 0.7;              // side margin
const CW = W - M * 2;       // content width

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'NWSA Music Hub';
pres.title = 'NWSA Music Hub — for the Dean and Directors';

const shadow = () => ({ type: 'outer', color: '9FB3B7', blur: 10, offset: 2, angle: 90, opacity: 0.28 });

/* ── Slide scaffolding ─────────────────────────────────────────────── */

function light(title, kicker) {
  const s = pres.addSlide();
  s.background = { color: WHITE };
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: CW, h: 0.28, fontFace: BODY, fontSize: 12, bold: true,
      color: TEAL, charSpacing: 2, margin: 0,
    });
  }
  s.addText(title, {
    x: M, y: kicker ? 0.72 : 0.55, w: CW, h: 0.75, fontFace: HEAD, fontSize: 36,
    bold: true, color: INK, margin: 0, valign: 'top',
  });
  return s;
}

function dark(kicker) {
  const s = pres.addSlide();
  s.background = { color: DARKBG };
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.55, w: CW, h: 0.3, fontFace: BODY, fontSize: 12, bold: true,
      color: '7FC3CD', charSpacing: 2, margin: 0,
    });
  }
  return s;
}

/** Repeated motif: a filled teal disc holding a numeral or short glyph. */
function badge(s, x, y, label, opts = {}) {
  const d = opts.size ?? 0.42;
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d, fill: { color: opts.fill ?? TEAL },
  });
  s.addText(String(label), {
    x, y, w: d, h: d, align: 'center', valign: 'middle', margin: 0,
    fontFace: BODY, fontSize: opts.fontSize ?? 15, bold: true, color: opts.color ?? WHITE,
  });
}

function card(s, x, y, w, h, opts = {}) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: opts.fill ?? CARD },
    line: { color: opts.line ?? CARDLINE, width: 1 },
    shadow: opts.shadow === false ? undefined : shadow(),
  });
}

/** Badge + heading + body, used for list rows across many slides. */
function row(s, x, y, w, n, head, sub, opts = {}) {
  badge(s, x, y + 0.04, n, opts.badge);
  const tx = x + 0.62;
  s.addText(head, {
    x: tx, y, w: w - 0.62, h: 0.34, margin: 0, fontFace: BODY, fontSize: 17,
    bold: true, color: opts.headColor ?? INK, valign: 'top',
  });
  if (sub) {
    s.addText(sub, {
      x: tx, y: y + 0.36, w: w - 0.62, h: opts.subH ?? 0.62, margin: 0,
      fontFace: BODY, fontSize: 14.5, color: opts.subColor ?? MUTED, valign: 'top',
    });
  }
}

const notes = [];
function n(text) { notes.push(text); }

/* ══════════════════════════════════════════════════════════════════════
   1 — Title
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = dark();
  // Logo on a white tile so the teal wordmark keeps its contrast.
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.5, w: 1.5, h: 2.0, rectRadius: 0.08, fill: { color: WHITE },
  });
  s.addImage({ path: LOGO, x: M + 0.35, y: 1.7, w: 0.8, h: 1.6 });

  s.addText('NWSA Music Hub', {
    x: 2.6, y: 1.62, w: 9.6, h: 1.0, margin: 0, fontFace: HEAD, fontSize: 54,
    bold: true, color: WHITE,
  });
  s.addText('Why it exists · How you’ll use it · Why it’s less work', {
    x: 2.6, y: 2.68, w: 9.6, h: 0.45, margin: 0, fontFace: BODY, fontSize: 21,
    color: '9FD2DA',
  });
  s.addText('New World School of the Arts — Music Division', {
    x: 2.6, y: 3.3, w: 9.6, h: 0.35, margin: 0, fontFace: BODY, fontSize: 15,
    color: '7FA6AE',
  });

  s.addText(
    'For the Dean, and the directors of Wind Ensemble, Jazz Ensemble and High School Choir',
    { x: M, y: 4.55, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, color: 'B9D8DD' },
  );
  s.addText('Three stops for questions — please use them.', {
    x: M, y: 5.0, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15,
    italic: true, color: GOLD,
  });
  n([
    'Greet by name. One sentence: why it exists, how you use it, why it is less work.',
    'Promise three question breaks - and mean it.',
    'FILL IN: names of the Dean and the three directors.',
    'Say "New World School of the Arts" in full at least once today.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   2 — Three things
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Three things, then you decide', 'What this meeting is');
  const items = [
    ['1', 'Why it exists', 'The problem it removes — not a feature list.'],
    ['2', 'How you use it', 'Your ensemble, shown live on a phone.'],
    ['3', 'Why it’s faster', 'The structural reason, not a sales number.'],
  ];
  const cw = 3.85, gap = 0.42;
  items.forEach(([num, head, sub], i) => {
    const x = M + i * (cw + gap);
    card(s, x, 2.05, cw, 2.75);
    badge(s, x + 0.35, 2.35, num, { size: 0.55, fontSize: 20 });
    s.addText(head, {
      x: x + 0.35, y: 3.05, w: cw - 0.7, h: 0.4, margin: 0,
      fontFace: BODY, fontSize: 20, bold: true, color: INK,
    });
    s.addText(sub, {
      x: x + 0.35, y: 3.5, w: cw - 0.7, h: 0.75, margin: 0,
      fontFace: BODY, fontSize: 14.5, color: MUTED,
    });
  });
  s.addText('When those three are done, we’re done — and the rest is your questions.', {
    x: M, y: 5.45, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 16, italic: true, color: DEEP,
  });
  n([
    'Why - How - Why faster.',
    'Telling them when you will be done lets them relax and listen.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   3 — The problem
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('The same fact, entered four times', 'The problem');
  const left = 5.6;
  s.addText(
    'The problem was never that we were disorganized.\n\nIt was that every fact about this department had to be entered more than once — and the copies drifted apart.',
    { x: M, y: 1.95, w: left, h: 1.9, margin: 0, fontFace: BODY, fontSize: 17.5, color: INK, lineSpacing: 28 },
  );
  card(s, M, 4.35, left, 1.9, { fill: 'FBF4E3', line: 'E8D9B0' });
  s.addText(
    'Attendance was the worst of it. The old Notion workspace was fine on a laptop — and impossible on a phone in front of an ensemble. So roll went on paper, and got typed up later. Or never.',
    { x: M + 0.3, y: 4.6, w: left - 0.6, h: 1.5, margin: 0, fontFace: BODY, fontSize: 15.5, color: '5A4A22' },
  );

  const rx = M + left + 0.6;
  const rw = CW - left - 0.6;
  const four = [
    ['The calendar', 'changed by hand'],
    ['The parents', 'told individually, all evening'],
    ['The wall', 'still says the old time'],
    ['The students', 'who weren’t in the room are simply wrong'],
  ];
  four.forEach(([head, sub], i) => {
    row(s, rx, 2.0 + i * 1.05, rw, i + 1, head, sub, { subH: 0.5 });
  });
  n([
    'Every fact had to be entered more than once.',
    'Attendance was worst: Notion was fine on a laptop, impossible on a phone in front of an ensemble - so roll went on paper and got typed later, or never.',
    'FILL IN - YOUR OWN 30-SECOND STORY GOES HERE. First person. Specific. The evening of texts, the parent who drove for a cancelled rehearsal, the stack of paper roll sheets.',
    'This is the only emotional beat in the talk. Do not skip it.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   4 — One place, two doors
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('One place. Two doors.', 'How it’s built');
  const cw = 5.9, gap = CW - cw * 2;
  const cols = [
    ['The public site', TEAL, [
      'Students, parents, anyone',
      'No login. No password. No app to install.',
      'Today’s schedule, calendar, concerts, their own schedule, their sheet music, announcements',
    ]],
    ['The Director Panel', DEEP, [
      'You — signed in with Google, by invitation',
      'Everything above, plus the ability to change it',
      'Roll, roster, schedule, repertoire, documents, announcements',
    ]],
  ];
  cols.forEach(([head, color, lines], i) => {
    const x = M + i * (cw + gap);
    card(s, x, 1.95, cw, 3.45);
    s.addText(head, {
      x: x + 0.4, y: 2.25, w: cw - 0.8, h: 0.45, margin: 0,
      fontFace: HEAD, fontSize: 24, bold: true, color,
    });
    s.addText(lines.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < lines.length - 1 } })), {
      x: x + 0.4, y: 2.9, w: cw - 0.8, h: 2.35, margin: 0,
      fontFace: BODY, fontSize: 15.5, color: INK, paraSpaceAfter: 12,
    });
  });
  s.addText('Same information. Same moment. There is no third place, and no export step in between.', {
    x: M, y: 5.85, w: CW, h: 0.45, margin: 0, fontFace: BODY, fontSize: 17, italic: true, color: DEEP, align: 'center',
  });
  n([
    'Public site: no login, no app, anyone. Director Panel: Google sign-in, invited.',
    'Same data, different door. No export step between them.',
    'If the panel is on screen, point at the dark band: "Director Panel - editing area - the student side shows what you set here."',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   5 — The rule (dark)
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = dark('The one idea');
  s.addText('You set it once.\nEveryone sees it.', {
    x: M, y: 1.5, w: CW, h: 2.2, margin: 0, fontFace: HEAD, fontSize: 60,
    bold: true, color: WHITE, lineSpacing: 66,
  });
  s.addText('Cancel a rehearsal in the app and you are not also posting it somewhere. The cancellation IS the notice.', {
    x: M, y: 3.95, w: 10.6, h: 0.7, margin: 0, fontFace: BODY, fontSize: 19, color: '9FD2DA',
  });
  const chips = ['the front page of the site', 'every affected student’s schedule', 'the calendars people subscribed to'];
  const cwid = 3.85, gap = 0.42;
  chips.forEach((t, i) => {
    const x = M + i * (cwid + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 5.0, w: cwid, h: 0.85, rectRadius: 0.1,
      fill: { color: '143840' }, line: { color: '2C5A64', width: 1 },
    });
    s.addText(t, {
      x: x + 0.2, y: 5.0, w: cwid - 0.4, h: 0.85, margin: 0, align: 'center', valign: 'middle',
      fontFace: BODY, fontSize: 14.5, color: 'CFE6EA',
    });
  });
  s.addText('One action. You don’t chase it afterward.', {
    x: M, y: 6.1, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 16, italic: true, color: GOLD,
  });
  n([
    'If they remember one sentence from today, this is it. Say it twice, slowly.',
    'Cancel a rehearsal -> red banner + every student schedule + subscribed phone calendars.',
    'One action, no chasing.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   6 — What a family sees
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('What a family sees', 'Live — the public site');
  const lw = 6.5;
  const rows = [
    ['A red strip, or nothing', 'Anything cancelled or moved today shows at the very top. No red strip means today is normal — and that is the whole point.'],
    ['Find your name once', 'The site remembers that student on that device. From then on it’s their rehearsals, their concerts, their part.'],
    ['Two kids? Save both', 'Parent mode holds several students at once.'],
  ];
  rows.forEach(([head, sub], i) => {
    row(s, M, 1.95 + i * 1.32, lw, i + 1, head, sub, { subH: 0.85 });
  });
  const rx = M + lw + 0.5;
  const rw = CW - lw - 0.5;
  card(s, rx, 1.95, rw, 3.3, { fill: DEEP, line: DEEP });
  s.addText('No account.\nNo password.\nNothing to install.', {
    x: rx + 0.35, y: 2.3, w: rw - 0.7, h: 1.65, margin: 0,
    fontFace: HEAD, fontSize: 22, bold: true, color: WHITE, lineSpacing: 36,
  });
  s.addText('An account is a wall. We don’t need one to tell somebody when rehearsal is.', {
    x: rx + 0.35, y: 4.15, w: rw - 0.7, h: 0.8, margin: 0,
    fontFace: BODY, fontSize: 14, italic: true, color: 'A8D3DA',
  });
  s.addText('LIVE: Home → My Schedule → look up a real student by name.', {
    x: M, y: 6.15, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, bold: true, color: TEAL,
  });
  n([
    'LIVE DEMO A. Home page - point at where the red change strip appears. No strip = normal day, and that is the point.',
    'Then My Schedule -> look up a real student by name. The site remembers them on that device. Parent mode holds several kids.',
    'Line: "no account, no password to reset."',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   7 — Today
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Your day starts here', 'Live — the Director Panel');
  // Illustrative card showing the SHAPE of a Today card (labels, not data).
  const cx = M, cy = 2.0, cwid = 6.5, chg = 3.0;
  card(s, cx, cy, cwid, chg, { fill: WHITE, line: CARDLINE });
  s.addShape(pres.ShapeType.roundRect, {
    x: cx + 0.25, y: cy + 0.28, w: 0.12, h: chg - 0.56, rectRadius: 0.06, fill: { color: TEAL },
  });
  s.addText('Ensemble', {
    x: cx + 0.55, y: cy + 0.28, w: cwid - 0.9, h: 0.4, margin: 0,
    fontFace: BODY, fontSize: 20, bold: true, color: INK,
  });
  s.addText('start – end time      ·      room      ·      how many are expected', {
    x: cx + 0.55, y: cy + 0.75, w: cwid - 0.9, h: 0.35, margin: 0,
    fontFace: BODY, fontSize: 14, color: MUTED,
  });
  s.addText('what you’re rehearsing — the pieces linked to it', {
    x: cx + 0.55, y: cy + 1.12, w: cwid - 0.9, h: 0.35, margin: 0,
    fontFace: BODY, fontSize: 14, color: MUTED,
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: cx + 0.55, y: cy + 1.95, w: 3.9, h: 0.5, rectRadius: 0.08,
    fill: { color: 'E7F3EF' }, line: { color: 'BCDBD0', width: 1 },
  });
  s.addText('✓  Roll taken — time, and by whom', {
    x: cx + 0.55, y: cy + 1.95, w: 3.9, h: 0.5, margin: 0, align: 'center', valign: 'middle',
    fontFace: BODY, fontSize: 13, bold: true, color: '2C6A55',
  });
  s.addText('the shape of every card — your real screen shows your ensembles', {
    x: cx, y: cy + chg + 0.12, w: cwid, h: 0.3, margin: 0,
    fontFace: BODY, fontSize: 12, italic: true, color: MUTED,
  });

  const rx = M + cwid + 0.55;
  const rw = CW - cwid - 0.55;
  s.addText('Underneath it, without looking anything up:', {
    x: rx, y: 1.95, w: rw, h: 0.35, margin: 0, fontFace: BODY, fontSize: 15, bold: true, color: DEEP,
  });
  const under = [
    ['Anything cancelled or changed today', ''],
    ['Every lesson pulling a student out', ''],
    ['Unexcused absences nobody has dealt with', ''],
    ['Filter to just your ensemble — it remembers', ''],
  ];
  under.forEach(([head], i) => {
    row(s, rx, 2.45 + i * 0.88, rw, i + 1, head, '', { subH: 0.1 });
  });
  s.addText('One screen. That’s the morning.', {
    x: rx, y: 5.95, w: rw, h: 0.4, margin: 0, fontFace: BODY, fontSize: 16, italic: true, color: DEEP,
  });
  n([
    'LIVE DEMO B. Read one REAL card off your own screen rather than this illustration.',
    'Time, room, "N expected", and the roll receipt: "not taken yet" or "taken 2:14 - 3 absent".',
    'Below: today\'s changes, lessons pulling students out, unexcused-absence reminder.',
    'Filter to one ensemble - it remembers your choice.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   8 — Take roll
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('You mark the exceptions. Nothing else.', 'Live — Take Roll');
  const pills = [
    ['Absent', 'C24545'], ['Late', 'B8862B'], ['Excused', '2C6A85'], ['Lesson', '5C4A8A'],
  ];
  const pw = 2.55, gap = 0.35;
  pills.forEach(([label, color], i) => {
    const x = M + i * (pw + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 1.95, w: pw, h: 0.85, rectRadius: 0.42, fill: { color }, line: { color, width: 1 },
    });
    s.addText(label, {
      x, y: 1.95, w: pw, h: 0.85, margin: 0, align: 'center', valign: 'middle',
      fontFace: BODY, fontSize: 19, bold: true, color: WHITE,
    });
  });
  s.addText('Everyone else is present. You don’t touch them.', {
    x: M, y: 3.05, w: CW, h: 0.55, margin: 0, fontFace: HEAD, fontSize: 30, bold: true, color: INK,
  });

  const notes3 = [
    ['A lesson isn’t an absence', 'You give the time window and a reason — required. Now the empty chair is documented.'],
    ['It watches while you work', 'How late they were. Their last five rehearsals, as dots. Absences a parent reported ahead. A warning if every trumpet is out.'],
    ['Finish roll — summary', 'Who’s out, one tap to call or email home, and a clean list to copy.'],
  ];
  const cw3 = 3.85, g3 = 0.42;
  notes3.forEach(([head, sub], i) => {
    const x = M + i * (cw3 + g3);
    card(s, x, 4.0, cw3, 2.45);
    s.addText(head, {
      x: x + 0.3, y: 4.25, w: cw3 - 0.6, h: 0.6, margin: 0,
      fontFace: BODY, fontSize: 16, bold: true, color: DEEP,
    });
    s.addText(sub, {
      x: x + 0.3, y: 4.85, w: cw3 - 0.6, h: 1.4, margin: 0,
      fontFace: BODY, fontSize: 13.5, color: MUTED,
    });
  });
  n([
    'LIVE DEMO C - ON YOUR PHONE. Do the taps, do not describe them.',
    'Absent -> Late -> Lesson (time window + REQUIRED reason) -> point at the count chips (they filter) -> Finish roll - summary -> call / email / copy.',
    'Land it: "that was three taps, because three people were out."',
    'Quiet extras: minutes-late recorded, last-5-rehearsal dots, parent-reported absences waiting on the row, section-gap warning.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   9 — Why that's faster (dark, stat)
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = dark('Why that’s faster');
  s.addText('80 students.\n4 of them out.', {
    x: M, y: 1.7, w: 5.9, h: 1.6, margin: 0, fontFace: BODY, fontSize: 27, color: '9FD2DA', lineSpacing: 42,
  });
  s.addText('4 taps', {
    x: M, y: 3.3, w: 5.9, h: 1.6, margin: 0, fontFace: HEAD, fontSize: 96, bold: true, color: WHITE,
  });
  s.addText('Nobody out is zero taps.', {
    x: M, y: 5.05, w: 5.9, h: 0.4, margin: 0, fontFace: BODY, fontSize: 17, italic: true, color: GOLD,
  });

  const rx = 7.2, rw = W - rx - M;
  s.addText('Most systems make the work grow with the size of your ensemble — eighty students, eighty marks, every day, whether or not anything happened.', {
    x: rx, y: 1.7, w: rw, h: 1.9, margin: 0, fontFace: BODY, fontSize: 18, color: 'CFE6EA', lineSpacing: 30,
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: rx, y: 3.75, w: rw, h: 1.25, rectRadius: 0.1, fill: { color: '143840' }, line: { color: '2C5A64', width: 1 },
  });
  s.addText('Here the work grows with the number of absences — not with the size of the room.', {
    x: rx + 0.3, y: 3.9, w: rw - 0.6, h: 1.0, margin: 0,
    fontFace: BODY, fontSize: 17, bold: true, color: WHITE,
  });
  s.addText('I have not timed the old way against the new way, so I’m not claiming a number of minutes. What changed is the shape of the work — and that it finishes in the room.', {
    x: rx, y: 5.25, w: rw, h: 1.2, margin: 0, fontFace: BODY, fontSize: 14, italic: true, color: '8FB9C1',
  });
  n([
    'Elsewhere work scales with roster size. Here it scales with absences.',
    'VERIFY: use your real roster number if it is on screen, otherwise say "about eighty".',
    'SAY OUT LOUD that you have not timed it. No minutes claims anywhere today.',
    'Finished in the room = finished. No evening typing up paper.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   10 — Roll answers questions later
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Four things you get for free', 'After the taps');
  const items = [
    ['Receipt', 'The event records when roll was taken, and by whom. “Did Tuesday get done?” is a glance, not a reconstruction.'],
    ['Pattern', 'Each student’s last five rehearsals, as dots, right on the roll screen. A pattern is visible without looking anything up.'],
    ['Follow-up queue', 'Unexcused absences from the past week collect in one place. Clear each with Excuse, Contacted, or Dismiss — a queue meant to reach empty.'],
    ['Export', 'The attendance you want as a spreadsheet file, whenever somebody needs it in writing.'],
  ];
  const cw = 5.9, ch = 1.85, gx = CW - cw * 2, gy = 0.32;
  items.forEach(([head, sub], i) => {
    const x = M + (i % 2) * (cw + gx);
    const y = 1.95 + Math.floor(i / 2) * (ch + gy);
    card(s, x, y, cw, ch);
    badge(s, x + 0.32, y + 0.3, i + 1, { size: 0.44, fontSize: 15 });
    s.addText(head, {
      x: x + 0.92, y: y + 0.28, w: cw - 1.25, h: 0.4, margin: 0,
      fontFace: BODY, fontSize: 19, bold: true, color: DEEP,
    });
    s.addText(sub, {
      x: x + 0.92, y: y + 0.72, w: cw - 1.25, h: 0.85, margin: 0,
      fontFace: BODY, fontSize: 13.5, color: MUTED,
    });
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.85, w: CW, h: 0.72, rectRadius: 0.1, fill: { color: 'FBF4E3' }, line: { color: 'E8D9B0', width: 1 },
  });
  s.addText('Questions — before I move on from roll, because it’s the thing you’ll do every day.', {
    x: M + 0.3, y: 5.85, w: CW - 0.6, h: 0.72, margin: 0, valign: 'middle',
    fontFace: BODY, fontSize: 16, bold: true, color: '5A4A22',
  });
  n([
    'Receipt (when + who). Pattern (five dots). Follow-up queue (Excuse / Contacted / Dismiss). Export to spreadsheet.',
    'PAUSE 1 - two minutes. "Questions on roll before I move on?"',
    'If silence: name one person, ask one specific question, count to five.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   11 — When the day changes
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('When the day changes', 'Live — Schedule Change');
  const acts = ['Swap two blocks', 'Shift a time', 'Move the room', 'Cancel it'];
  const pw = 2.9, gap = (CW - pw * 4) / 3;
  acts.forEach((t, i) => {
    const x = M + i * (pw + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 1.9, w: pw, h: 0.8, rectRadius: 0.1, fill: { color: DEEP }, line: { color: DEEP },
    });
    s.addText(t, {
      x, y: 1.9, w: pw, h: 0.8, margin: 0, align: 'center', valign: 'middle',
      fontFace: BODY, fontSize: 16, bold: true, color: WHITE,
    });
  });
  s.addText('One edit. Then, without you doing anything else:', {
    x: M, y: 2.95, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 17, bold: true, color: INK,
  });
  const outs = [
    ['Tagged as changed', 'on the event itself'],
    ['Red banner', 'on the public front page'],
    ['A notice offered', 'posted as an urgent announcement'],
  ];
  const ow = 3.85, og = 0.42;
  outs.forEach(([head, sub], i) => {
    const x = M + i * (ow + og);
    card(s, x, 3.45, ow, 1.15);
    s.addText(head, {
      x: x + 0.28, y: 3.6, w: ow - 0.56, h: 0.38, margin: 0,
      fontFace: BODY, fontSize: 16.5, bold: true, color: DEEP,
    });
    s.addText(sub, {
      x: x + 0.28, y: 3.98, w: ow - 0.56, h: 0.4, margin: 0,
      fontFace: BODY, fontSize: 13.5, color: MUTED,
    });
  });
  card(s, M, 4.85, CW, 1.35, { fill: 'EEF6F7', line: 'C7DEE2' });
  s.addText('Revert to normal', {
    x: M + 0.35, y: 5.02, w: 3.2, h: 0.4, margin: 0, fontFace: BODY, fontSize: 18, bold: true, color: TEAL,
  });
  s.addText('The app snapshots the original before your first change, so reverting restores exactly what was there — and pulls the notice back down. You can never be stuck having damaged the calendar.', {
    x: M + 3.6, y: 4.98, w: CW - 3.95, h: 0.95, margin: 0, fontFace: BODY, fontSize: 14.5, color: INK,
  });
  s.addText('And for the day school closes: one button cancels everything on that date and posts one notice.', {
    x: M, y: 6.35, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: MUTED,
  });
  n([
    'LIVE DEMO. Pick a real upcoming rehearsal and shift it 15 minutes on screen - don\'t describe the buttons, tap them.',
    'The moment you save: point at the public site in a second tab/window - the red banner is already there. That\'s the whole demo.',
    'Then show Revert to normal undoing it, banner gone.',
    'Close a day = one button cancels everything on a date and posts one notice. Mention it; demo only if time allows.',
    'VERIFY the local phrasing for a school closure day.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   12 — Subs and pull-outs
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Borrow a student. Keep your roster.', 'Live — Temporary Roster Changes');
  const cw = 5.9, gap = CW - cw * 2;
  card(s, M, 1.95, cw, 3.5);
  s.addText('What you do', {
    x: M + 0.4, y: 2.15, w: cw - 0.8, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 22, bold: true, color: TEAL,
  });
  const doL = [
    'Add a student for one event — or for a date range',
    'Or pull one out for the same',
    'Give a reason. It’s required.',
  ];
  s.addText(doL.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < doL.length - 1 } })), {
    x: M + 0.4, y: 2.7, w: cw - 0.8, h: 1.6, margin: 0, fontFace: BODY, fontSize: 15.5, color: INK, paraSpaceAfter: 10,
  });
  s.addText('It expires by itself.', {
    x: M + 0.4, y: 4.7, w: cw - 0.8, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: DEEP,
  });

  const x2 = M + cw + gap;
  card(s, x2, 1.95, cw, 3.5, { fill: DEEP, line: DEEP });
  s.addText('What it never touches', {
    x: x2 + 0.4, y: 2.15, w: cw - 0.8, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 22, bold: true, color: WHITE,
  });
  s.addText('Your permanent roster.', {
    x: x2 + 0.4, y: 2.75, w: cw - 0.8, h: 0.5, margin: 0, fontFace: HEAD, fontSize: 27, bold: true, color: '9FD2DA',
  });
  s.addText('While it’s active it is completely real: a “Sub” badge on your roll screen, the student on Who’s Out for the ensemble they left, and the change on their own public schedule.', {
    x: x2 + 0.4, y: 3.5, w: cw - 0.8, h: 1.7, margin: 0, fontFace: BODY, fontSize: 14.5, color: 'CFE6EA',
  });
  s.addText('Nobody has to remember to undo anything. That is how rosters stop rotting.', {
    x: M, y: 5.9, w: CW, h: 0.45, margin: 0, fontFace: BODY, fontSize: 17, italic: true, color: DEEP, align: 'center',
  });
  n([
    'LIVE DEMO. Pull a real student out for one rehearsal on screen - reason required, takes seconds.',
    'Then show it: the Sub badge on the roll screen, the student on Who\'s Out, the change on their own public schedule.',
    'Say it plainly: permanent roster untouched; the change expires itself, nobody has to remember to undo it.',
    'One entry can move a student out of one ensemble and into another at once.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   13 — Announcements
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Three levels — and one rule', 'Live — Announcements');
  const levels = [
    ['Normal', 'Appears on the front page and your ensemble’s page.', CARD, INK, CARDLINE],
    ['Important', 'Highlighted so it can’t be scrolled past.', 'FBF4E3', '5A4A22', 'E8D9B0'],
    ['Urgent', 'A banner across every page of the site. For “call time moved” — not “bring your folder.”', 'F6E7E7', '7A2E2E', 'E4C2C2'],
  ];
  levels.forEach(([head, sub, fill, color, line], i) => {
    const y = 1.9 + i * 1.02;
    s.addShape(pres.ShapeType.roundRect, {
      x: M, y, w: 8.6, h: 0.86, rectRadius: 0.1, fill: { color: fill }, line: { color: line, width: 1 },
    });
    s.addText(head, {
      x: M + 0.3, y, w: 1.9, h: 0.86, margin: 0, valign: 'middle',
      fontFace: BODY, fontSize: 18, bold: true, color,
    });
    s.addText(sub, {
      x: M + 2.2, y, w: 6.2, h: 0.86, margin: 0, valign: 'middle',
      fontFace: BODY, fontSize: 14, color,
    });
  });

  const rx = M + 9.0, rw = CW - 9.0;
  s.addText('And on any of them:', {
    x: rx, y: 1.9, w: rw, h: 0.35, margin: 0, fontFace: BODY, fontSize: 15, bold: true, color: DEEP,
  });
  ['Pin it to the top', 'Give it an expiry date', 'Write it now, post it later', 'Add your own Spanish'].forEach((t, i) => {
    s.addShape(pres.ShapeType.roundRect, {
      x: rx, y: 2.35 + i * 0.62, w: rw, h: 0.5, rectRadius: 0.08,
      fill: { color: CARD }, line: { color: CARDLINE, width: 1 },
    });
    s.addText(t, {
      x: rx + 0.2, y: 2.35 + i * 0.62, w: rw - 0.4, h: 0.5, margin: 0, valign: 'middle',
      fontFace: BODY, fontSize: 13.5, color: INK,
    });
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.5, w: CW, h: 0.9, rectRadius: 0.1, fill: { color: 'F6E7E7' }, line: { color: 'E4C2C2', width: 1 },
  });
  s.addText('The rule: announcements are public. Anyone can read them. Nothing private goes in one.', {
    x: M + 0.35, y: 5.5, w: CW - 0.7, h: 0.9, margin: 0, valign: 'middle',
    fontFace: BODY, fontSize: 16.5, bold: true, color: '7A2E2E',
  });
  n([
    'LIVE DEMO. Write one real Urgent announcement on screen and post it - watch the site-wide banner appear in the other tab.',
    'Per-ensemble or school-wide. Normal / Important / Urgent. Pin, expiry date, schedule for later, and a Spanish field you write yourself (not machine translation).',
    'TEAMS / EMAIL - SAY THE HONEST VERSION. Unless you have watched one arrive: "the app queues it; that last hop is set up outside the app and I will not promise it until I have tested it. Today, treat the banner as the delivery."',
    'Rule: announcements are public. Nothing private in one.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   14 — Repertoire becomes the program
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('The program prints itself', 'Repertoire — enter the piece once');
  const cw = 5.4;
  card(s, M, 1.95, cw, 3.7);
  s.addText('You enter, once', {
    x: M + 0.35, y: 2.15, w: cw - 0.7, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 21, bold: true, color: TEAL,
  });
  const inL = [
    'Formal title, composer and dates, arranger',
    'Movements, durations, program notes',
    'A recording, and the score',
    'A sheet-music link per instrument',
  ];
  s.addText(inL.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < inL.length - 1 } })), {
    x: M + 0.35, y: 2.7, w: cw - 0.7, h: 2.2, margin: 0, fontFace: BODY, fontSize: 15, color: INK, paraSpaceAfter: 10,
  });

  s.addShape(pres.ShapeType.chevron, {
    x: M + cw + 0.35, y: 3.2, w: 0.95, h: 0.9, fill: { color: GOLD }, line: { color: GOLD },
  });

  const x2 = M + cw + 1.55;
  const w2 = CW - cw - 1.55;
  card(s, x2, 1.95, w2, 3.7, { fill: DEEP, line: DEEP });
  s.addText('It comes back out as', {
    x: x2 + 0.35, y: 2.15, w: w2 - 0.7, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 21, bold: true, color: WHITE,
  });
  const outL = [
    'The printed concert program — in the order you set',
    'A “My part” button for each student, matched to their instrument',
    'The piece page families can listen to before the concert',
  ];
  s.addText(outL.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < outL.length - 1 } })), {
    x: x2 + 0.35, y: 2.7, w: w2 - 0.7, h: 2.4, margin: 0, fontFace: BODY, fontSize: 15, color: 'CFE6EA', paraSpaceAfter: 12,
  });
  s.addText('One piece can belong to several ensembles — a work Wind Ensemble and Choir both perform is one entry, not two.', {
    x: M, y: 5.95, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: MUTED,
  });
  n([
    'LIVE DEMO D - show a real printed program.',
    'Point at the masthead: New World School of the Arts. Say we got that wrong on a printed program once and it will not happen again.',
    'You did not write the program - it was assembled from what you already entered, in your order, with movements and total runtime.',
    'Same entry gives a student a "My part" button matched to their instrument - theirs, not all thirty parts.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   15 — Three more
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Three more, when you want them', 'Also in there');
  const items = [
    ['Documents', 'Syllabus, handbook, forms, policies — uploaded or linked, tagged to your ensemble or school-wide. Parents stop emailing you for the handbook.'],
    ['Assignments & exams', 'Due dates that land on students’ own schedule pages. A playing exam can carry a Google Form link, so it’s submitted through the form.'],
    ['Seating', 'Publish a chart after auditions — seat 1 is principal. On rehearsal day you can take roll by tapping chairs instead of reading a list.'],
  ];
  const cw = 3.85, gap = 0.42;
  items.forEach(([head, sub], i) => {
    const x = M + i * (cw + gap);
    card(s, x, 2.0, cw, 3.5);
    badge(s, x + 0.32, 2.32, i + 1, { size: 0.5, fontSize: 17 });
    s.addText(head, {
      x: x + 0.32, y: 2.95, w: cw - 0.64, h: 0.45, margin: 0,
      fontFace: BODY, fontSize: 19, bold: true, color: DEEP,
    });
    s.addText(sub, {
      x: x + 0.32, y: 3.5, w: cw - 0.64, h: 1.85, margin: 0,
      fontFace: BODY, fontSize: 14.5, color: MUTED,
    });
  });
  s.addText('None of this is required. Roll and the calendar carry themselves.', {
    x: M, y: 5.85, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 16, italic: true, color: DEEP,
  });
  n([
    'Thirty seconds each. Do not linger.',
    'Documents (syllabus / handbook / forms, per ensemble or school-wide).',
    'Assignments and exams (due dates on student schedules, Google Form for playing exams).',
    'Seating (seat 1 = principal, published to students; chair-view roll on rehearsal day).',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   16 — Getting families in
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Getting families in', 'None of this matters if they never open it');
  const steps = [
    ['Scan', 'The app prints a QR kit: posters for the wall, a “find my schedule” poster, one per ensemble, and sheets of slips you cut apart and staple to the front of every folder.'],
    ['Type', 'Short addresses for the ones who’d rather type — /we for Wind Ensemble, /jazz, /choir.'],
    ['Subscribe', 'One tap puts your ensemble’s calendar into the calendar app on a phone, and it stays current by itself.'],
  ];
  steps.forEach(([head, sub], i) => {
    const y = 1.95 + i * 1.32;
    badge(s, M, y + 0.08, i + 1, { size: 0.56, fontSize: 20 });
    s.addText(head, {
      x: M + 0.8, y, w: 2.3, h: 0.45, margin: 0, fontFace: HEAD, fontSize: 24, bold: true, color: TEAL,
    });
    s.addText(sub, {
      x: M + 3.0, y: y + 0.02, w: CW - 3.0, h: 1.0, margin: 0, fontFace: BODY, fontSize: 15.5, color: INK,
    });
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 6.0, w: CW, h: 0.8, rectRadius: 0.1, fill: { color: DEEP }, line: { color: DEEP },
  });
  s.addText('Subscribing is the one I’d push hardest — it’s the difference between families checking, and families knowing.', {
    x: M + 0.35, y: 6.0, w: CW - 0.7, h: 0.8, margin: 0, valign: 'middle',
    fontFace: BODY, fontSize: 16, bold: true, color: WHITE,
  });
  n([
    'Hold up the printed QR page.',
    'Wall posters, "find my schedule" poster, per-ensemble posters, cut-apart folder slips.',
    'VERIFY the short addresses by reading them off the QR kit page.',
    'PAUSE 2 - two minutes. "Is there something your ensemble does that you did not see?" Go around by name. Write answers down where they can see you writing.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   17 — Who can see what
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Who can see what', 'Privacy');
  const cw = 5.9, gap = CW - cw * 2;
  card(s, M, 1.9, cw, 2.9, { fill: DEEP, line: DEEP });
  s.addText('Staff only — always', {
    x: M + 0.4, y: 2.1, w: cw - 0.8, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 22, bold: true, color: WHITE,
  });
  const priv = ['Grade level and pronunciation guide', 'Contact details for students and guardians', 'Attendance records', 'Progress notes', 'Private lesson schedules'];
  s.addText(priv.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < priv.length - 1 } })), {
    x: M + 0.4, y: 2.65, w: cw - 0.8, h: 2.0, margin: 0, fontFace: BODY, fontSize: 15, color: 'CFE6EA', paraSpaceAfter: 8,
  });

  const x2 = M + cw + gap;
  card(s, x2, 1.9, cw, 2.9);
  s.addText('Public — on purpose', {
    x: x2 + 0.4, y: 2.1, w: cw - 0.8, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 22, bold: true, color: TEAL,
  });
  const pub = ['Schedules and concerts', 'Repertoire and programs', 'Announcements', 'Student name, instrument, section, ensemble'];
  s.addText(pub.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < pub.length - 1 } })), {
    x: x2 + 0.4, y: 2.65, w: cw - 0.8, h: 2.0, margin: 0, fontFace: BODY, fontSize: 15, color: INK, paraSpaceAfter: 8,
  });

  s.addText('The line is enforced twice: what the public site is even allowed to ask for, and separately, by name, what fields that answer is allowed to contain. Grade never crosses it, in either direction.', {
    x: M, y: 5.0, w: CW, h: 0.55, margin: 0, fontFace: BODY, fontSize: 15.5, color: INK,
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.65, w: CW, h: 1.15, rectRadius: 0.1, fill: { color: 'FBF4E3' }, line: { color: 'E8D9B0', width: 1 },
  });
  s.addText('Names are public so a student can find their own schedule without an account.', {
    x: M + 0.35, y: 5.8, w: CW - 0.7, h: 0.4, margin: 0, fontFace: BODY, fontSize: 16.5, bold: true, color: '5A4A22',
  });
  s.addText('Grade level was never part of that trade — it stays behind sign-in with everything else on the left. That line is a decision the two of us can revisit; it isn’t a default.', {
    x: M + 0.35, y: 6.18, w: CW - 0.7, h: 0.55, margin: 0, fontFace: BODY, fontSize: 13.5, color: '5A4A22',
  });
  n([
    'THE DEAN\'S SLIDE. Be precise rather than reassuring.',
    'Public, on purpose: schedules, concerts, repertoire, announcements, and a student\'s name/instrument/section/ensemble - that\'s it.',
    'Staff only, always: grade level, pronunciation, contact details, attendance, progress notes, private lessons.',
    'Say the trade out loud: names are public BECAUSE lookup-without-an-account requires it. Grade was never part of that trade and never appears publicly.',
    'If asked how it\'s enforced: two layers - which collections the public site can even query, and a field allowlist on top of that, so a bug in the app can\'t leak grade even by accident.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   18 — Who can do what
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Who can do what', 'Four levels of access');
  const roles = [
    ['Owner', 'One account. The only one that can add or remove people.', false],
    ['Director', 'Full editing everywhere except that access list. That’s the three of you.', false],
    ['Teacher', 'Schedules private lessons for their own assigned students — nothing else. A clash with your rehearsal must be acknowledged, then shows on your roll screen as a documented pull-out.', false],
    ['Personnel Assistant', 'Takes roll for the ensembles you assign — and nothing else. No contact details. No grades. No notes. Every mark stamped with their name.', true],
  ];
  let y = 1.9;
  roles.forEach(([name, desc, highlight]) => {
    const h = name === 'Teacher' || highlight ? 1.05 : 0.85;
    card(s, M, y, CW, h, highlight
      ? { fill: 'EEF6F7', line: TEAL }
      : { fill: CARD, line: CARDLINE });
    s.addText(name, {
      x: M + 0.35, y: y + 0.1, w: 3.1, h: h - 0.2, margin: 0, valign: 'middle',
      fontFace: BODY, fontSize: 19, bold: true, color: highlight ? TEAL : DEEP,
    });
    s.addText(desc, {
      x: M + 3.55, y: y + 0.1, w: CW - 3.9, h: h - 0.2, margin: 0, valign: 'middle',
      fontFace: BODY, fontSize: 14.5, color: INK,
    });
    y += h + 0.14;
  });
  s.addText('A student aide can take attendance for you without seeing a single phone number. Access is added or removed instantly, from inside the app.', {
    x: M, y: 6.35, w: CW, h: 0.55, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: DEEP,
  });
  n([
    'Owner (one; adds/removes people) - Director (everything but that list) - Teacher (own students\' lessons only) - Personnel Assistant (roll only, assigned ensembles).',
    'The Personnel Assistant is the surprise win - offer it out loud: "give me a name and I will set it up."',
    'Access changes take effect immediately. Somebody leaves, they are off in ten seconds.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   19 — Where it lives, what it costs
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Where it lives, what it costs', 'The boring questions');
  const tiles = [
    ['No license', 'No subscription, no per-seat fee. Free hosting tiers as configured today.'],
    ['No server', 'Nothing in a closet. Nothing to back up by hand.'],
    ['Rebuilds itself', 'The site and the calendar feeds refresh on a schedule.'],
    ['Installs like an app', 'Add it to a home screen on a phone or iPad. It opens even on a bad connection.'],
  ];
  const cw = 2.95, gap = (CW - cw * 4) / 3;
  tiles.forEach(([head, sub], i) => {
    const x = M + i * (cw + gap);
    card(s, x, 2.1, cw, 3.0);
    s.addText(head, {
      x: x + 0.28, y: 2.35, w: cw - 0.56, h: 0.8, margin: 0,
      fontFace: HEAD, fontSize: 20, bold: true, color: TEAL,
    });
    s.addText(sub, {
      x: x + 0.28, y: 3.25, w: cw - 0.56, h: 1.7, margin: 0,
      fontFace: BODY, fontSize: 14, color: MUTED,
    });
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.5, w: CW, h: 0.9, rectRadius: 0.1, fill: { color: 'FBF4E3' }, line: { color: 'E8D9B0', width: 1 },
  });
  s.addText('Said honestly: free tiers depend on usage and on the vendors’ terms. I’m not promising “free forever” — I’m telling you there’s nothing to pay today.', {
    x: M + 0.35, y: 5.5, w: CW - 0.7, h: 0.9, margin: 0, valign: 'middle',
    fontFace: BODY, fontSize: 15.5, color: '5A4A22',
  });
  n([
    'No license, no subscription; free hosting tiers AS CONFIGURED TODAY. Not "free forever".',
    'No server, nothing to hand-back-up; rebuilds and refreshes calendar feeds on a schedule.',
    'Installs to a home screen; opens with a bad connection.',
    'If you have not tested a save in a dead-zone room, say: "it opens offline; saving needs a signal, and it tells you when a save did not go through."',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   20 — Old way, new way
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('Old way → new way', 'The efficiency argument');
  const rows = [
    ['Attendance', 'Written down, typed up later', 'Tapped once, in the room, on your phone'],
    ['“Is rehearsal cancelled?”', 'Individual replies, all evening', 'One edit → a banner everyone sees'],
    ['A student subbing in', 'Roster edited, and remembered back', 'Temporary, reasoned, self-reversing'],
    ['The concert program', 'A separate document, retyped', 'Generated from what you already entered'],
    ['Sheet music parts', 'Handed out, and handed out again', 'Linked to the piece; a student finds their own'],
  ];
  const colX = [M, M + 4.0, M + 8.3];
  const colW = [3.8, 4.1, CW - 8.3];
  s.addText('Before', { x: colX[1], y: 1.85, w: colW[1], h: 0.3, margin: 0, fontFace: BODY, fontSize: 12.5, bold: true, color: MUTED, charSpacing: 1.5 });
  s.addText('NOW', { x: colX[2], y: 1.85, w: colW[2], h: 0.3, margin: 0, fontFace: BODY, fontSize: 12.5, bold: true, color: TEAL, charSpacing: 1.5 });
  rows.forEach((r, i) => {
    const y = 2.25 + i * 0.78;
    if (i % 2 === 0) {
      s.addShape(pres.ShapeType.roundRect, {
        x: M - 0.15, y: y - 0.08, w: CW + 0.3, h: 0.72, rectRadius: 0.06,
        fill: { color: 'F7FAFB' }, line: { color: 'F7FAFB' },
      });
    }
    s.addText(r[0], { x: colX[0], y, w: colW[0], h: 0.56, margin: 0, valign: 'middle', fontFace: BODY, fontSize: 15, bold: true, color: INK });
    s.addText(r[1], { x: colX[1], y, w: colW[1], h: 0.56, margin: 0, valign: 'middle', fontFace: BODY, fontSize: 14, color: MUTED });
    s.addText(r[2], { x: colX[2], y, w: colW[2], h: 0.56, margin: 0, valign: 'middle', fontFace: BODY, fontSize: 14, color: DEEP, bold: true });
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 6.2, w: CW, h: 0.85, rectRadius: 0.1, fill: { color: DEEP }, line: { color: DEEP },
  });
  s.addText('Every fact gets entered once, by the person who knows it — and stops being re-asked.', {
    x: M + 0.35, y: 6.2, w: CW - 0.7, h: 0.85, margin: 0, valign: 'middle', align: 'center',
    fontFace: HEAD, fontSize: 20, bold: true, color: WHITE,
  });
  n([
    'WALK ONLY THREE ROWS. Pick the three that matter to this room.',
    'The argument in one line: every fact gets entered once, by the person who knows it, and stops being re-asked.',
    'Then the honest caveat: this does not delete the work, it moves it to the front. Term setup is real. The payoff is ten months of not re-entering.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   21 — What I'm asking
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('What I’m asking of you this week', 'Four small things');
  const asks = [
    ['Sign in and look', 'If it says your account isn’t authorized, that’s my job, not yours — tell me and it’s fixed in a minute.'],
    ['Take roll in the app once', 'Once. If it doesn’t work the way you need, I want to hear it from the first attempt — not the fortieth.'],
    ['Check your own month', 'You know your schedule better than the calendar does. Tell me what’s wrong on it.'],
    ['Name one person', 'Anyone who should be able to take roll for you — a section leader, an aide.'],
  ];
  asks.forEach(([head, sub], i) => {
    const y = 1.95 + i * 1.12;
    badge(s, M, y + 0.06, i + 1, { size: 0.56, fontSize: 20 });
    s.addText(head, {
      x: M + 0.8, y, w: 4.2, h: 0.45, margin: 0, fontFace: BODY, fontSize: 20, bold: true, color: DEEP,
    });
    s.addText(sub, {
      x: M + 5.1, y: y + 0.02, w: CW - 5.1, h: 0.85, margin: 0, fontFace: BODY, fontSize: 14.5, color: MUTED,
    });
  });
  s.addText('I’ll check back with each of you on ______________.', {
    x: M, y: 6.45, w: CW, h: 0.45, margin: 0, fontFace: BODY, fontSize: 17, italic: true, color: INK,
  });
  n([
    '1. Sign in and look. CHECK THE DIRECTORS LIST FIRST so "not authorized" is not a surprise in the room.',
    '2. Take roll once, for real.',
    '3. Check your month on the calendar and tell me what is wrong.',
    '4. Name anyone who should take roll for you.',
    'FILL IN and say a check-back date out loud.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   22 — When you're stuck
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = light('When you’re stuck', 'Three places, in order');
  const items = [
    ['Start Here', 'In the app menu. Real questions grouped by students, parents and directors — every answer links straight to the screen you need. It prints, if you want it on paper.'],
    ['The glossary', 'At the bottom of that page. Call time, pull-out, sectional, principal, downbeat. Written for ninth graders and parents — useful for anybody.'],
    ['Ask me', 'I’d much rather fix a confusing screen than have you work around it.'],
  ];
  const cw = 3.85, gap = 0.42;
  items.forEach(([head, sub], i) => {
    const x = M + i * (cw + gap);
    card(s, x, 2.0, cw, 3.55, i === 2 ? { fill: DEEP, line: DEEP } : {});
    badge(s, x + 0.32, 2.28, i + 1, { size: 0.5, fontSize: 17, fill: i === 2 ? WHITE : TEAL, color: i === 2 ? DEEP : WHITE });
    s.addText(head, {
      x: x + 0.32, y: 2.95, w: cw - 0.64, h: 0.45, margin: 0,
      fontFace: HEAD, fontSize: 21, bold: true, color: i === 2 ? WHITE : DEEP,
    });
    s.addText(sub, {
      x: x + 0.32, y: 3.5, w: cw - 0.64, h: 1.9, margin: 0,
      fontFace: BODY, fontSize: 14.5, color: i === 2 ? 'CFE6EA' : MUTED,
    });
  });
  s.addText('Nothing here is finished, and nothing here is precious. Every screen I showed you came from somebody saying “this doesn’t work the way I work.”', {
    x: M, y: 5.95, w: CW, h: 0.5, margin: 0, fontFace: BODY, fontSize: 16, italic: true, color: DEEP,
  });
  n([
    'Start Here in the app menu (answers link straight to the screen; it prints).',
    'Glossary at the bottom of that page.',
    'Then email you - FILL IN the address.',
  ].join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════
   23 — Questions (dark)
   ══════════════════════════════════════════════════════════════════════ */
{
  const s = dark();
  s.addText('What did I miss?\nWhat’s going to break?', {
    x: M, y: 1.0, w: 7.4, h: 1.7, margin: 0, fontFace: HEAD, fontSize: 38, bold: true, color: WHITE, lineSpacing: 48,
  });
  s.addText('Take the time. The first question is usually the most useful one.', {
    x: M, y: 2.75, w: 7.4, h: 0.5, margin: 0, fontFace: BODY, fontSize: 17, italic: true, color: GOLD,
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 3.5, w: 7.4, h: 3.1, rectRadius: 0.1, fill: { color: '143840' }, line: { color: '2C5A64', width: 1 },
  });
  s.addText('What I am NOT claiming today', {
    x: M + 0.35, y: 3.72, w: 6.7, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, bold: true, color: '9FD2DA', charSpacing: 1,
  });
  const claims = [
    'A measured time saving — the argument is structural, not a study',
    'Teams / email delivery of urgent posts — the app queues it; that hop is unverified',
    'That grade level is public anywhere — it isn’t; only name, instrument, section and ensemble are',
    'That there’s a help desk behind this — there’s me',
  ];
  s.addText(claims.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < claims.length - 1 } })), {
    x: M + 0.35, y: 4.25, w: 6.7, h: 2.2, margin: 0, fontFace: BODY, fontSize: 14.5, color: 'CFE6EA', paraSpaceAfter: 10,
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: 8.5, y: 2.4, w: 1.5, h: 2.0, rectRadius: 0.08, fill: { color: WHITE },
  });
  s.addImage({ path: LOGO, x: 8.5 + 0.35, y: 2.6, w: 0.8, h: 1.6 });
  s.addText('NWSA Music Hub', {
    x: 10.2, y: 2.8, w: 2.45, h: 0.9, margin: 0, fontFace: HEAD, fontSize: 21, bold: true, color: WHITE,
  });
  s.addText('New World School of the Arts', {
    x: 10.2, y: 3.6, w: 2.45, h: 0.8, margin: 0, fontFace: BODY, fontSize: 13, color: '9FD2DA',
  });
  n([
    'Read the open items aloud before taking questions - edit the list to match what is true on the day.',
    'No measured time savings. Teams/email relay unverified. Grade level is NOT public anywhere - only name/instrument/section/ensemble are. Maintenance is you.',
    'Add anything you promised to find out during the talk.',
    'Then: "What did I miss, and what is going to break?" - and STOP TALKING. Let the silence work.',
  ].join('\n'));
}

/* ── Attach notes ──────────────────────────────────────────────────── */
pres.slides.forEach((s, i) => { if (notes[i]) s.addNotes(notes[i]); });

pres.writeFile({ fileName: OUT }).then(() => {
  console.log('wrote', OUT, '—', pres.slides.length, 'slides,', notes.length, 'note blocks');
});
