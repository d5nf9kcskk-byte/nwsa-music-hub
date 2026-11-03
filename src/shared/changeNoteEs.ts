/**
 * The Spanish change note (#banner-drafter, Hub 2.0 Phase 3 item 14).
 *
 * `CalendarEvent.changeNoteEs` is the director's CONFIRMED Spanish version of
 * the English `changeNote`, and nothing else. A family reading the site in
 * Spanish sees it in place of the English note; everyone else sees the
 * English exactly as before. The drafter (`draftChangeNoteEs` Cloud Function)
 * only ever suggests text for the director's box; a Save writes this field.
 *
 * Two rules, both here so every reader and writer goes through ONE place:
 *
 *  1. `changeNoteFor(event, lang)` is the one choice of which note a person
 *     sees. Every public surface reads the note through it. Feeds (.ics) and
 *     push alerts stay English on purpose and do not call it.
 *
 *  2. `reconcileChangeNoteEs(patch, before)` makes a stale Spanish note
 *     impossible. A Spanish note that says the opposite of the English one
 *     ("Cancelled" in English, "Ensayo a las 3:30" in Spanish) is the worst
 *     thing this feature could do, so a write that CHANGES or CLEARS the
 *     English note and does not carry a newly confirmed Spanish one clears
 *     the Spanish. The returned patch says so with `changeNoteEs: undefined`,
 *     the hooks' explicit-undefined = DELETE convention.
 *
 * Zero imports on purpose: the self-check, the Hub tools (`hub-calendar.mjs`)
 * and the app all load it bare.
 */

/** Longest English note the drafter will translate. */
export const CHANGE_NOTE_DRAFT_MAX = 500;
/** Longest Spanish note the form accepts (Spanish runs ~20% longer). */
export const CHANGE_NOTE_ES_MAX = 600;

export interface HasChangeNote {
  changeNote?: string;
  changeNoteEs?: string;
}

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');

/**
 * The note this reader should see. Spanish only when the reader is in
 * Spanish, the English note exists, and a confirmed Spanish note exists; in
 * every other case the English note, untouched (undefined when there is none,
 * so `e.changeNote ? … : …` call sites keep their exact shape).
 */
export function changeNoteFor(e: HasChangeNote, lang: string): string | undefined {
  if (!e.changeNote) return e.changeNote;
  if (lang === 'es') {
    const es = clean(e.changeNoteEs);
    if (es) return es;
  }
  return e.changeNote;
}

/**
 * Make an event write safe for the Spanish note. `before` is the event as it
 * stands (undefined when the caller cannot see it; then any English change
 * clears the Spanish, since there is no way to tell whether one exists).
 *
 *  • The patch does not touch `changeNote`: returned unchanged.
 *  • The patch clears the English note: the Spanish goes too, always.
 *  • The patch carries a Spanish note: kept (trimmed); a blank one clears.
 *  • The patch changes the English note and carries no Spanish: the Spanish
 *    is cleared, unless the English is word-for-word what it was (re-saving
 *    the form without touching the note keeps the confirmed translation).
 *    When there is provably no Spanish note to clear, nothing is added, so a
 *    write on a site that never used the drafter is exactly what it was.
 */
export function reconcileChangeNoteEs<P extends Record<string, unknown>>(
  patch: P,
  before?: HasChangeNote,
): P {
  const touchesEs = 'changeNoteEs' in patch;
  const touchesEn = 'changeNote' in patch;
  if (!touchesEn && !touchesEs) return patch;

  const out: Record<string, unknown> = { ...patch };
  const en = touchesEn ? clean(patch.changeNote) : clean(before?.changeNote);

  if (!en) {
    // No English note after this write: a Spanish one would be an orphan.
    if (touchesEs || before === undefined || before.changeNoteEs !== undefined) {
      out.changeNoteEs = undefined;
    }
    return out as P;
  }

  if (touchesEs) {
    const es = clean(patch.changeNoteEs).slice(0, CHANGE_NOTE_ES_MAX);
    out.changeNoteEs = es || undefined;
    return out as P;
  }

  // English written, no Spanish confirmed with it.
  if (before === undefined) {
    out.changeNoteEs = undefined;
  } else if (before.changeNoteEs !== undefined && en !== clean(before.changeNote)) {
    out.changeNoteEs = undefined;
  }
  return out as P;
}
