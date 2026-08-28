import { useCurrentDirector } from '../currentDirector';
import { isStaffMember } from './useDirectors';
import { ORG } from '../../org';

/**
 * Subscription gate shared by the paid-roster hooks (usePersonnel,
 * usePersonnelContacts, useContracts).
 *
 * The #personnel collections are Owner/Director only in firestore.rules
 * (isStaff(), never isKnownRole()), with no role-scoped read like the
 * teacher `lessons` rule — so there is no where() clause that could make a
 * teacher's query legal. The only correct move for a teacher or assistant is
 * to NOT SUBSCRIBE AT ALL: a denied listener is fatal to onSnapshot and
 * would trip the "couldn't load" status strip for a user who is behaving
 * normally. Same for orgs without the feature (ORG.features.personnel is
 * false for the school orgs, whose projects keep these collections empty).
 *
 * Query-and-rule agreement, the shape it takes here: the rule is a role
 * check, so the "matching query" is subscribing only as that role.
 *
 *   'blocked' — feature off, or the resolved role may not read these
 *               collections. Render empty, loading false, no listener.
 *   'wait'    — signed-in identity not resolved yet. Keep loading; do not
 *               attach a listener that would race the auth token (the
 *               useLessons pattern).
 *   'open'    — Owner/Director in a personnel org: subscribe.
 */
export type PersonnelGate = 'blocked' | 'wait' | 'open';

export function usePersonnelGate(): PersonnelGate {
  const me = useCurrentDirector();
  if (!ORG.features.personnel) return 'blocked';
  if (!me) return 'wait';
  return isStaffMember(me) ? 'open' : 'blocked';
}
