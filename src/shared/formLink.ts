/**
 * The ONE spelling of a form's public address (#forms, Oct 2026).
 *
 * "Sign-ups" became "Forms" once the section held permission slips and
 * registrations as well as sign-ups. Only the WORDS and the addresses moved:
 * the data is still `signupForms` / `signupResponses`, the code is still
 * `Signup…`, and the old `/signups` and `/signup/<id>` routes stay mounted
 * forever, because they are printed in announcements, QR codes and texts
 * already sent. New links are written here and nowhere else.
 */
export const FORMS_PATH = '/forms';

export function formPath(id: string): string {
  return `/form/${id}`;
}
