import { t } from '../shared/i18n';
import { alertGroupNames, type AlertGroupTitleFn } from '../shared/groupAlerts';
import type { MoreLabels } from '../shared/AlertGroupSections';
import type { Ensemble } from '../director/types';

/**
 * Alert-group headings and the show-more button in the reader's language,
 * for the public strips (#alerts-es). `alertGroupTitle()` and
 * `AlertGroupSections` stay English for the director shell, which has no
 * EN|ES toggle. Ensemble names are the director's and are never translated.
 * Call during render, after `useLang()`.
 */
export function publicAlertGroupTitle(
  ensembles: Pick<Ensemble, 'id' | 'name' | 'order'>[],
): AlertGroupTitleFn {
  return key => {
    if (key === 'classes') return t('alert.group.classes');
    if (key === 'everyone') return t('alert.scopeEveryone');
    return t('alert.group.named', { names: alertGroupNames(key, ensembles) });
  };
}

export function publicMoreLabels(): MoreLabels {
  return {
    fewer: t('announce.showFewer'),
    all: count => t('misc.showAll', { count }),
  };
}
