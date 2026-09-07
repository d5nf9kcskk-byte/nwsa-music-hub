/**
 * Sign-up → roster intake (#signups).
 *
 * An `audienceMode: 'open'` sign-up IS the intake: the person filling it in
 * has no roster record yet, so the response carries a typed name and no
 * `studentId` (src/director/types.ts). Somebody then has to turn those
 * responses into real records, and doing it by hand is exactly the manual
 * loop sign-ups were built to kill — the College Student Information form
 * landed a whole cohort that had to be typed in one at a time.
 *
 * College is the case that forced this. A college student reaches the school
 * through the form and through nothing else: there is no district roster
 * upload behind them, so whatever they typed is the only record that will
 * ever exist. That is why this carries EVERYTHING on the response — email,
 * phone, the guardian, and every free-text answer — and not just the name.
 *
 * This module is the ONE definition of what that turns into: who is new, who
 * is already on the roster, and field by field what each record ends up
 * saying. It is pure and imports no Firebase on purpose, so the director's
 * screen and any future Admin-SDK script plan the same import and a
 * self-check can pin it (`signupRosterIntake.selfcheck.ts`, in the deploy
 * workflow).
 *
 * Where each piece lands, and why:
 *   • name / instrument / grade / ensembles → the `students` doc.
 *   • email / phone / guardian             → `contacts`, never `students`.
 *     A student doc is mirrored to the world-readable `studentsPublic`
 *     (#privacy); an address typed into a public form must not ride along.
 *   • every other answer                   → `contacts.extra`, the bucket
 *     that already exists to keep what nothing else has a column for.
 *
 * What it deliberately does NOT do:
 *   • It never removes an ensemble. A student already in Symphony who signs
 *     up for a college class gains the class and keeps Symphony.
 *   • It never silently overwrites a value a director has already curated.
 *     A field where both sides say something different is a CONFLICT the
 *     director resolves on screen — see `IntakeField`.
 *   • It never touches `status`, `schoolId`, or pronunciation. The
 *     school-issued ID is staff work and a sign-up cannot be trusted with it.
 *   • It never writes. The caller does, through the normal `useStudents` /
 *     `useContacts` paths, so the `studentsPublic` mirror is batched with the
 *     source doc rather than re-implemented here.
 */
import type {
  Guardian, SignupForm, SignupQuestion, SignupResponse, Student, StudentContact,
} from '../director/types';
import { parseAnswers } from './signupAppointments';

/** The grade a college / dual-enrollment student carries on the roster. Free
 *  text elsewhere in the app, but one spelling here so the roster filters,
 *  the concert check-in list and the CSV all read the same word. */
export const COLLEGE_GRADE = 'College';

/** How a guardian arriving from a sign-up is labelled. The form asks for a
 *  name and an address, not a relation. */
export const SIGNUP_GUARDIAN_RELATION = 'Parent/Guardian';

/** Comparison key for "is this the same person". Case- and spacing-
 *  insensitive, and tolerant of a "Last, First" entry, because the name on a
 *  sign-up is typed by the person rather than picked from the roster. */
export function nameKey(name: string): string {
  const flat = name.trim().replace(/\s+/g, ' ').toLowerCase();
  const comma = flat.indexOf(',');
  const ordered = comma > 0
    ? `${flat.slice(comma + 1).trim()} ${flat.slice(0, comma).trim()}`.trim()
    : flat;
  return ordered.replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Display form of a typed name: trimmed, single-spaced, "Last, First"
 *  flipped back to reading order. Casing is left alone — "diMaggio" is a
 *  name, not a typo. */
export function tidyName(name: string): string {
  const flat = name.trim().replace(/\s+/g, ' ');
  const comma = flat.indexOf(',');
  return comma > 0
    ? `${flat.slice(comma + 1).trim()} ${flat.slice(0, comma).trim()}`.trim()
    : flat;
}

/** Every field this import can write, and where it lives. `answers` is the
 *  whole free-text tail as one unit — the questions differ per form, so they
 *  cannot each be a named field here. */
export type IntakeFieldKey =
  | 'instrument' | 'grade'
  | 'email' | 'phone' | 'guardianName' | 'guardianEmail';

/** Which side of a conflict wins. Defaults are computed by `planRosterIntake`
 *  and the director may flip any of them before the import runs. */
export type IntakeChoice = 'current' | 'incoming';

export interface IntakeField {
  key: IntakeFieldKey;
  label: string;
  /** `students` doc or `contacts` doc — the caller writes them separately. */
  target: 'student' | 'contact';
  /** What the roster says today. Empty for a brand-new student. */
  current: string;
  /** What the response says. Empty when the person left it blank. */
  incoming: string;
  /** Both sides say something, and they disagree. The only case the director
   *  has to look at; everything else is a fill-in-the-blank. */
  conflict: boolean;
  /** What the import will write unless the director flips it. */
  choice: IntakeChoice;
}

/** One response's outcome. `create` writes a new student; `update` patches an
 *  existing one; `same` means the record already says all of this. */
export type IntakeAction = 'create' | 'update' | 'same';

export interface IntakeRow {
  response: SignupResponse;
  action: IntakeAction;
  /** Name as it will be stored (tidied), or the matched student's name. */
  name: string;
  /** The roster student this response resolved to, when there is one. */
  match?: Student;
  /** Groups this student does not have yet (the ones the import adds). */
  addedEnsembleIds: string[];
  /** Every writable field, conflicts and blanks alike, in display order. */
  fields: IntakeField[];
  /** Free-text answers, keyed as they will appear in `contacts.extra`. */
  answers: Record<string, string>;
  /** Guardians beyond the one on the signature block, read out of the form's
   *  own questions ("Mother's email", "Parent 2 phone"). Each is merged into
   *  `contacts.guardians` on its own — a family can have as many as it has. */
  extraGuardians: Guardian[];
  /** Answer keys already on the contact doc with a DIFFERENT value — the one
   *  part of `extra` this import overwrites, so the screen can say so. */
  answersOverwritten: string[];
}

export interface IntakePlanOptions {
  /** Groups every imported student joins — ensembles and/or classes. */
  ensembleIds: string[];
  /** Grade to stamp. Defaults to `COLLEGE_GRADE`. */
  grade?: string;
  /** The form, for question labels and the namespace answers are filed under. */
  form?: Pick<SignupForm, 'title' | 'questions'>;
  /** Existing contact docs, keyed by student id. */
  contacts?: Record<string, Pick<StudentContact, 'email' | 'parentEmail' | 'phone' | 'guardians' | 'extra'>>;
}

/**
 * Resolve a response to a roster student: by `studentId` when the sign-up had
 * one (a 'groups' audience picks from the roster), otherwise by name.
 *
 * Matching on a typed name is the weak link, and it is why the director sees
 * every row before anything is written. An ambiguous name — two people on the
 * roster whose names reduce to the same key — resolves to NOBODY rather than
 * guessing, so the import proposes a new student and a human settles it.
 */
export function matchStudent(
  response: SignupResponse,
  students: Student[],
): Student | undefined {
  if (response.studentId) {
    const byId = students.find(s => s.id === response.studentId);
    if (byId) return byId;
  }
  const key = nameKey(response.studentName ?? '');
  if (!key) return undefined;
  const hits = students.filter(s => nameKey(s.name ?? '') === key);
  return hits.length === 1 ? hits[0] : undefined;
}

/** The default winner when both sides say something and they disagree.
 *
 *  The longer answer, because on this form that is nearly always the more
 *  complete one — "(305) 555-0134" over "5550134", "Maria Elena Ruiz" over
 *  "Maria Ruiz" — and a director scanning twenty rows should be flipping the
 *  exceptions, not every single row. Ties go to what the roster already says:
 *  when there is nothing to choose between them, the curated value stands. */
function defaultChoice(current: string, incoming: string): IntakeChoice {
  if (!current) return incoming ? 'incoming' : 'current';
  if (!incoming) return 'current';
  return incoming.length > current.length ? 'incoming' : 'current';
}

function field(
  key: IntakeFieldKey,
  label: string,
  target: 'student' | 'contact',
  current: string,
  incoming: string,
): IntakeField {
  const c = current.trim();
  const i = incoming.trim();
  return {
    key, label, target, current: c, incoming: i,
    conflict: !!c && !!i && c !== i,
    choice: defaultChoice(c, i),
  };
}

/** Question label → the key its answer is filed under in `contacts.extra`.
 *  Namespaced by the form, because two sign-ups both asking "T-shirt size"
 *  are two different answers a year apart. */
export function answerKey(formTitle: string, label: string): string {
  const form = (formTitle || 'Sign-up').trim();
  return `${form} — ${label.trim()}`;
}

/**
 * A family is not one parent (#signups). The signature block on a sign-up has
 * room for exactly one guardian, so any others reach us as ordinary questions
 * the director wrote — "Mother's email", "Father — cell", "Parent 2 name" —
 * and dumping those into `contacts.extra` as loose text would mean the second
 * parent is on the record but not reachable from the place that lists
 * parents. `StudentContact.guardians` is already unlimited, so the fix is to
 * READ the questions rather than to add a field: every question that names a
 * person and a detail becomes another entry in that list.
 *
 * Matching is on the label the director typed, so it is a heuristic, and it
 * is built to under-claim: a question has to name BOTH a person (mother,
 * father, guardian, parent 2, emergency contact …) and a detail (name, email,
 * phone, relation) before it is read as a guardian. Anything else — and
 * anything that smells like a consent line rather than a contact — stays in
 * `extra` exactly as before. The director sees every guardian this produced
 * in the plan before a word of it is written.
 */
const GUARDIAN_PERSON_WORDS: [RegExp, string][] = [
  [/step\s*-?\s*(mother|mom)/, 'Stepmother'],
  [/step\s*-?\s*(father|dad)/, 'Stepfather'],
  [/\b(mother|mom|mum)\b/, 'Mother'],
  [/\b(father|dad)\b/, 'Father'],
  [/\bgrand\s*-?\s*(mother|ma)\b/, 'Grandmother'],
  [/\bgrand\s*-?\s*(father|pa)\b/, 'Grandfather'],
  [/\bemergency\s+contact\b/, 'Emergency contact'],
  [/\bguardian\b/, 'Guardian'],
  [/\bparent\b/, 'Parent'],
];

const GUARDIAN_DETAIL_WORDS: [RegExp, keyof Guardian][] = [
  [/\be-?mail\b/, 'email'],
  [/\b(phone|cell|mobile|telephone)\b/, 'phone'],
  [/\brelation(ship)?\b/, 'relation'],
  [/\bname\b/, 'name'],
];

/** A consent line is not a contact detail, whoever it names. */
const NOT_A_CONTACT = /signature|signed|consent|permission|agree|initial|acknowledg|authoriz/;

interface GuardianQuestion {
  /** Which person this answer is about: "Mother", "Parent 2", … */
  person: string;
  detail: keyof Guardian;
}

/** Read a question label as "which guardian, which detail", or `null` when it
 *  is not about a guardian at all. Exported for the self-check. */
export function guardianQuestion(label: string): GuardianQuestion | null {
  const l = label.toLowerCase();
  if (NOT_A_CONTACT.test(l)) return null;
  const person = GUARDIAN_PERSON_WORDS.find(([re]) => re.test(l));
  if (!person) return null;
  const detail = GUARDIAN_DETAIL_WORDS.find(([re]) => re.test(l));
  if (!detail) return null;
  // "Parent 2", "Guardian #3" — the number is what separates one person from
  // the next when the director used the same word twice.
  const n = l.match(/\b(?:#\s*)?([2-9])\b/);
  return { person: n ? `${person[1]} ${n[1]}` : person[1], detail: detail[1] };
}

/**
 * Split a response's answers into the guardians they describe and everything
 * else. An answer read as a guardian detail leaves `extra` — it is on the
 * record in a better place, and keeping both would have the second parent's
 * phone number in two spellings that can then drift.
 */
function splitAnswers(
  response: SignupResponse,
  form: IntakePlanOptions['form'],
): { answers: Record<string, string>; guardians: Guardian[] } {
  const values = parseAnswers(response);
  const answers: Record<string, string> = {};
  const byPerson = new Map<string, Guardian>();

  for (const q of (form?.questions ?? []) as SignupQuestion[]) {
    const v = (values[q.id] ?? '').trim();
    if (!v) continue;
    const g = guardianQuestion(q.label);
    if (!g) {
      answers[answerKey(form?.title ?? '', q.label)] = v;
      continue;
    }
    const entry = byPerson.get(g.person) ?? { relation: g.person };
    // First answer wins per detail: two questions claiming the same slot for
    // the same person is the director's ambiguity, not ours to resolve.
    if (entry[g.detail] === undefined) entry[g.detail] = v;
    byPerson.set(g.person, entry);
  }

  // A row with nothing but the relation we inferred is not a person.
  const guardians = [...byPerson.values()].filter(g => g.name || g.email || g.phone);
  return { answers, guardians };
}

/**
 * Plan the import for a set of responses. Pass the responses the director is
 * actually importing (normally `latestPerStudent()` minus withdrawn ones) —
 * this function does not decide which responses count, only what each one
 * would do to the roster.
 *
 * Rows come back in the order given, one per response, so the screen can show
 * the plan beside the responses it came from.
 */
export function planRosterIntake(
  responses: SignupResponse[],
  students: Student[],
  opts: IntakePlanOptions,
): IntakeRow[] {
  const grade = (opts.grade ?? COLLEGE_GRADE).trim() || COLLEGE_GRADE;
  const wanted = opts.ensembleIds.filter(Boolean);
  const contacts = opts.contacts ?? {};
  const rows: IntakeRow[] = [];
  // Names claimed by earlier rows in this same run, so two responses from the
  // same person (an open sign-up has no roster anchor and no public update
  // rule, so coming back means sending a second doc) never create the student
  // twice. The later response fills blanks the earlier one left.
  const claimed = new Map<string, number>();

  for (const response of responses) {
    const name = tidyName(response.studentName ?? '');
    const key = nameKey(name);
    const earlier = key ? claimed.get(key) : undefined;
    const { answers, guardians: extraGuardians } = splitAnswers(response, opts.form);

    if (earlier !== undefined) {
      mergeLaterResponse(rows[earlier], response, answers, extraGuardians);
      rows.push({
        response, action: 'same', name, match: rows[earlier].match,
        addedEnsembleIds: [], fields: [], answers: {}, extraGuardians: [],
        answersOverwritten: [],
      });
      continue;
    }

    const match = matchStudent(response, students);
    const contact = match ? contacts[match.id] : undefined;
    const have = match?.ensembleIds ?? [];
    const addedEnsembleIds = wanted.filter(id => !have.includes(id));

    const fields = [
      field('instrument', 'Instrument', 'student', match?.instrument ?? '', response.instrument ?? ''),
      field('grade', 'Grade', 'student', match?.grade ?? '', grade),
      field('email', 'Student email', 'contact', contact?.email ?? '', response.email ?? ''),
      field('phone', 'Phone', 'contact', contact?.phone ?? '', response.phone ?? ''),
      // A guardian is a PERSON, not a value on the student — so these two are
      // never a conflict. A family can have three guardians, and the name on
      // this form is not a competing answer to the name already recorded: it
      // is either the same person (merged by name or address in
      // `contactWrite`) or another one, and either way nobody is replaced.
      field('guardianName', 'Parent/guardian', 'contact', '', response.guardianName ?? ''),
      field('guardianEmail', 'Parent/guardian email', 'contact', '', response.guardianEmail ?? ''),
    ];

    // The grade is the point of the import, not a suggestion: a college
    // cohort is being told it is a college cohort. It stays a visible field
    // so the director sees "12th → College" happening.
    const gradeField = fields.find(f => f.key === 'grade');
    if (gradeField) gradeField.choice = 'incoming';

    const existingExtra = contact?.extra ?? {};
    const answersOverwritten = Object.keys(answers)
      .filter(k => (existingExtra[k] ?? '') && existingExtra[k] !== answers[k]);

    const row: IntakeRow = {
      response,
      action: match ? 'update' : 'create',
      name: match ? match.name : name,
      match,
      addedEnsembleIds,
      fields,
      answers,
      extraGuardians,
      answersOverwritten,
    };
    row.action = rowAction(row);
    rows.push(row);
    if (key) claimed.set(key, rows.length - 1);
  }

  return rows;
}

/** A second response from the same person only ADDS: it fills a field the
 *  first left blank and contributes answers the first did not carry. It never
 *  overrules the earlier one, because "latest wins" is already applied
 *  upstream by `latestPerStudent()` — anything reaching here in a pair is a
 *  duplicate the director chose to keep. */
function mergeLaterResponse(
  first: IntakeRow,
  later: SignupResponse,
  answers: Record<string, string>,
  guardians: Guardian[],
): void {
  const from: Record<IntakeFieldKey, string> = {
    instrument: later.instrument ?? '',
    grade: '',
    email: later.email ?? '',
    phone: later.phone ?? '',
    guardianName: later.guardianName ?? '',
    guardianEmail: later.guardianEmail ?? '',
  };
  for (const f of first.fields) {
    const value = (from[f.key] ?? '').trim();
    if (!value || f.incoming) continue;
    f.incoming = value;
    f.conflict = !!f.current && f.current !== value;
    f.choice = defaultChoice(f.current, value);
  }
  for (const [k, v] of Object.entries(answers)) {
    if (!first.answers[k]) first.answers[k] = v;
  }
  for (const g of guardians) first.extraGuardians = mergeGuardian(first.extraGuardians, g);
  first.action = rowAction(first);
}

/**
 * Add one guardian to a list without ever displacing somebody. The incoming
 * entry updates the one it matches — same address, or same name — and joins
 * the list otherwise, so a family with three guardians ends up with three.
 * Blank details on the incoming entry never overwrite details already there.
 */
export function mergeGuardian(list: Guardian[], incoming: Guardian): Guardian[] {
  const email = (incoming.email ?? '').toLowerCase();
  const key = nameKey(incoming.name ?? '');
  const at = list.findIndex(g =>
    (!!email && (g.email ?? '').toLowerCase() === email)
    || (!!key && nameKey(g.name ?? '') === key));
  const clean: Guardian = {};
  for (const [k, v] of Object.entries(incoming) as [keyof Guardian, string | undefined][]) {
    if (v) clean[k] = v;
  }
  if (at < 0) return [...list, clean];
  const out = [...list];
  // Details from the form win — that is the point of importing them — except
  // the relation, where one already recorded beats one this module inferred
  // from the wording of a question.
  out[at] = { ...out[at], ...clean, relation: out[at].relation ?? clean.relation };
  return out;
}

/** Is there anything left to write for this row? */
function rowAction(row: IntakeRow): IntakeAction {
  if (!row.match) return 'create';
  const writesAField = row.fields.some(f => {
    const value = f.choice === 'incoming' ? f.incoming : f.current;
    return !!value && value !== f.current;
  });
  const writesAnAnswer = Object.keys(row.answers).length > 0;
  const writesAGuardian = row.extraGuardians.length > 0;
  return row.addedEnsembleIds.length || writesAField || writesAnAnswer || writesAGuardian
    ? 'update'
    : 'same';
}

/** The director's overrides for one row: field key → which side wins. */
export type IntakeChoices = Partial<Record<IntakeFieldKey, IntakeChoice>>;

function chosen(row: IntakeRow, key: IntakeFieldKey, choices?: IntakeChoices): string {
  const f = row.fields.find(x => x.key === key);
  if (!f) return '';
  const side = choices?.[key] ?? f.choice;
  return side === 'incoming' ? f.incoming : f.current;
}

/**
 * The `students` write for a row. A create gets the whole record; an update
 * gets only the keys that actually change, so a merge-write can never blank a
 * field this import has nothing to say about.
 */
export function studentWrite(
  row: IntakeRow,
  wantedEnsembleIds: string[],
  choices?: IntakeChoices,
): Partial<Omit<Student, 'id'>> {
  const instrument = chosen(row, 'instrument', choices);
  const grade = chosen(row, 'grade', choices);

  if (!row.match) {
    return {
      name: row.name,
      instrument,
      grade,
      ensembleIds: [...wantedEnsembleIds],
      status: 'Active',
    };
  }

  const out: Partial<Omit<Student, 'id'>> = {};
  const have = row.match.ensembleIds ?? [];
  const added = wantedEnsembleIds.filter(id => !have.includes(id));
  if (added.length) out.ensembleIds = [...have, ...added];
  if (instrument && instrument !== (row.match.instrument ?? '')) out.instrument = instrument;
  if (grade && grade !== (row.match.grade ?? '')) out.grade = grade;
  return out;
}

/**
 * The `contacts` write for a row, or `null` when the response carried nothing
 * a contact doc wants. Shaped for `useContacts.saveContact`, which
 * merge-writes: only the keys present here are touched.
 *
 * `guardians` is rebuilt rather than appended to, because a sign-up names ONE
 * parent and the roster may already hold several. The signed-up guardian
 * replaces the entry it matches (same name or same address) and is added at
 * the front otherwise, so nobody already recorded is lost.
 */
export function contactWrite(
  row: IntakeRow,
  existing: Pick<StudentContact, 'guardians' | 'extra'> | undefined,
  choices?: IntakeChoices,
): Omit<StudentContact, 'id'> | null {
  const email = chosen(row, 'email', choices);
  const phone = chosen(row, 'phone', choices);
  const gName = chosen(row, 'guardianName', choices);
  const gEmail = chosen(row, 'guardianEmail', choices);
  const answers = row.answers;

  const signer: Guardian | null = gName || gEmail
    ? { relation: SIGNUP_GUARDIAN_RELATION, ...(gName ? { name: gName } : {}), ...(gEmail ? { email: gEmail } : {}) }
    : null;
  const incoming = [...(signer ? [signer] : []), ...row.extraGuardians];

  if (!email && !phone && !incoming.length && !Object.keys(answers).length) return null;

  const out: Omit<StudentContact, 'id'> = {};
  if (email) out.email = email;
  if (phone) out.phone = phone;

  if (incoming.length) {
    // Every guardian the form named, merged one at a time. Nobody on the
    // record is displaced: an incoming entry updates the one it matches by
    // address or name and joins the list otherwise, so a family with three
    // guardians keeps three.
    let list = [...(existing?.guardians ?? [])];
    for (const g of incoming) list = mergeGuardian(list, g);
    out.guardians = list;
    // `parentEmail` is the back-compat mirror of guardians[0] (see
    // StudentContact) — keep it pointing at whoever that ends up being, not
    // at whoever happened to sign this form.
    if (list[0]?.email) out.parentEmail = list[0].email;
  }

  if (Object.keys(answers).length) {
    out.extra = { ...(existing?.extra ?? {}), ...answers };
  }
  return out;
}

/** Headline counts for the confirm button ("Add 14 · update 3"). */
export function intakeSummary(rows: IntakeRow[]): {
  create: number; update: number; same: number; conflicts: number; total: number;
} {
  const create = rows.filter(r => r.action === 'create').length;
  const update = rows.filter(r => r.action === 'update').length;
  const conflicts = rows.reduce(
    (n, r) => n + (r.action === 'same' ? 0 : r.fields.filter(f => f.conflict).length),
    0,
  );
  return { create, update, same: rows.length - create - update, conflicts, total: rows.length };
}
