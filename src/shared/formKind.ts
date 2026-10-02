/**
 * What KIND of form a `signupForms` doc is (#forms, Oct 2026). A label and a
 * starting template, nothing more: every kind runs on the same sign-up
 * machinery (audience, deadline, "Still waiting", signatures, signed PDF).
 *
 * Forms made before kinds existed carry no `formKind`, so the kind is read
 * from what the form does — a PDF to sign is a permission slip, an
 * anyone-with-the-link form is an open form, the rest are sign-ups. A
 * director can always set it outright in the editor.
 */
export type FormKind = 'signup' | 'permission' | 'registration' | 'open';

export const FORM_KINDS: FormKind[] = ['signup', 'permission', 'registration', 'open'];

export const FORM_KIND_LABEL: Record<FormKind, string> = {
  signup: 'Sign-up',
  permission: 'Permission slip',
  registration: 'Registration',
  open: 'Open form',
};

export const FORM_KIND_PLURAL: Record<FormKind, string> = {
  signup: 'Sign-ups',
  permission: 'Permission slips',
  registration: 'Registrations',
  open: 'Open forms',
};

export const FORM_KIND_HINT: Record<FormKind, string> = {
  signup: 'Names, yes/no, time slots — auditions, interest lists.',
  permission: 'The official PDF, filled in, signed and dated — field trips.',
  registration: 'Your questions plus student and parent signatures — competitions, All-State.',
  open: 'Anyone with the link, roster or not — new students, incoming families.',
};

export function formKindOf(form: { formKind?: FormKind; signPdf?: unknown; audienceMode?: string }): FormKind {
  if (form.formKind && FORM_KINDS.includes(form.formKind)) return form.formKind;
  if (form.signPdf) return 'permission';
  if (form.audienceMode === 'open') return 'open';
  return 'signup';
}
