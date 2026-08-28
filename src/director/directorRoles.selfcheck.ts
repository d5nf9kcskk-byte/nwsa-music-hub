import {
  directorRoles,
  hasDirectorRole,
  isStaffMember,
  primaryDirectorRole,
  directorRoleLabels,
} from './directorRoles';

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

console.log('directorRoles.selfcheck.ts: ok');
