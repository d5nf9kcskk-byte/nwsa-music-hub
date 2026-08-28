import { lookupMdcByLogin, lookupMdcByName, resolveMdcContact } from './staffMdcContacts.ts';

const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

assert(lookupMdcByLogin('nwsaorchestras@gmail.com')?.mdcEmail === 'ggilman@mdc.edu', 'Gilman login');
assert(lookupMdcByName('Brent Mounger')?.mdcEmail === 'brent.mounger@mdc.edu', 'Mounger name');
assert(lookupMdcByName('Jim Gasior')?.mdcEmail === 'jgasior@mdc.edu', 'Gasior name');
assert(
  resolveMdcContact({ email: 'someone@gmail.com', name: 'Jim Gasior' })?.mdcEmail === 'jgasior@mdc.edu',
  'name fallback not gmail',
);
assert(
  resolveMdcContact({ email: 'nwsaorchestras@gmail.com', name: 'Grant', mdcEmail: 'custom@mdc.edu' })?.mdcEmail === 'custom@mdc.edu',
  'stored mdcEmail wins',
);

console.log('staffMdcContacts.selfcheck: ok');
