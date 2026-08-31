import {
  assistantCapabilities,
  assistantHasCapability,
  directorRoles,
  hasDirectorRole,
  isStaffMember,
  primaryDirectorRole,
  directorRoleLabels,
} from './directorRoles';
import { ASSISTANT_CAPABILITY_LABEL, STAFF_ROLE_LABEL } from './types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// Legacy single role
assert(JSON.stringify(directorRoles({ role: 'teacher' })) === '["teacher"]', 'legacy teacher');
assert(hasDirectorRole({ role: 'teacher' }, 'teacher'), 'legacy has teacher');
assert(!isStaffMember({ role: 'teacher' }), 'teacher alone not staff');

// Legacy no role → director
assert(JSON.stringify(directorRoles({})) === '["director"]', 'empty → director');
assert(isStaffMember({}), 'empty is staff');

// Multi-role array
assert(
  JSON.stringify(directorRoles({ roles: ['director', 'teacher'] })) === '["director","teacher"]',
  'roles array',
);
assert(hasDirectorRole({ roles: ['director', 'teacher'] }, 'teacher'), 'multi has teacher');
assert(isStaffMember({ roles: ['director', 'teacher'] }), 'director+teacher is staff');
assert(primaryDirectorRole({ roles: ['teacher', 'director'] }) === 'director', 'primary = highest');
assert(
  directorRoleLabels({ roles: ['director', 'teacher'] }) === 'Director · Applied Teacher',
  'labels',
);

// roles[] wins over stale legacy role field
assert(
  primaryDirectorRole({ role: 'teacher', roles: ['director'] }) === 'director',
  'roles[] overrides role',
);

assert(hasDirectorRole({ roles: ['classroom'] }, 'classroom'), 'classroom role');
assert(!isStaffMember({ roles: ['classroom'] }), 'classroom alone not staff');
assert(STAFF_ROLE_LABEL.classroom === 'Classroom Teacher', 'classroom label');
assert(STAFF_ROLE_LABEL.assistant === 'Student Assistant', 'assistant label');

// Student Assistant optional capabilities
assert(assistantCapabilities({}).length === 0, 'no caps → empty');
assert(assistantCapabilities({ assistantCapabilities: ['schedule', 'signups'] }).join() === 'schedule,signups', 'caps list');
assert(assistantHasCapability({ assistantCapabilities: ['repertoire'] }, 'repertoire'), 'has repertoire');
assert(!assistantHasCapability({ assistantCapabilities: ['schedule'] }, 'signups'), 'missing signup');
assert(
  assistantCapabilities({ assistantCapabilities: ['schedule', 'bogus' as 'schedule'] }).join() === 'schedule',
  'unknown caps dropped',
);
assert(ASSISTANT_CAPABILITY_LABEL.schedule === 'Rehearsals & concerts', 'schedule label');

console.log('directorRoles.selfcheck.ts: ok');
