import { t } from '../shared/i18n';
import type { FormKind } from '../shared/formKind';

/**
 * A form's kind as the public pages say it (#forms), in the reader's
 * language. `FORM_KIND_LABEL` in formKind.ts stays the English the director
 * screens use; the kind itself is never translated where it is stored.
 */
export function formKindLabel(kind: FormKind): string {
  return t(`su.kind.${kind}`);
}
