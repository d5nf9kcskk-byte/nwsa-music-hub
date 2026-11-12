#!/usr/bin/env node
/**
 * ensure-staff-accounts.mjs (#password-sign-in)
 *
 * Makes sure every email on the Directors list has a sign-in account that the
 * HUB made (empty: no password, not marked verified). New listings get theirs
 * from the staffAccountOnListing Cloud Function; this is the same code
 * (functions/src/staffAccount.ts) run once over the people already listed.
 *
 * It must run, and report nothing missing, BEFORE Email/Password sign-in is
 * enabled for the project. The order is in docs/password-sign-in.md.
 *
 * Looks only, unless told otherwise:
 *   (no flag)            count what is there; change nothing
 *   APPLY=1              make the missing accounts
 *   APPLY=1 REPLACE=1    also replace any account that carries a password.
 *                        Only for a project where Email/Password was enabled
 *                        before this ran. Once staff have chosen passwords,
 *                        this takes every one of them away (they set a new
 *                        one by emailed link).
 *
 * Prints COUNTS ONLY. This repo and its Actions logs are public, and a staff
 * member's email address has no business in either.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON (the service-account key JSON).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ensureStaffAccount } from '../functions/src/staffAccount.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Aborting.');
  process.exit(1);
}
const apply = process.env.APPLY === '1';
const replace = process.env.REPLACE === '1';
if (replace && !apply) {
  console.error('REPLACE=1 does nothing without APPLY=1. Aborting rather than guessing.');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(raw)) });
const auth = getAuth();
const listed = await getFirestore().collection('directors').get();

const counts = {};
let failed = 0;
for (const d of listed.docs) {
  let outcome;
  try {
    outcome = await ensureStaffAccount(auth, d.id, { replacePassworded: replace, dryRun: !apply });
  } catch (e) {
    failed++;
    outcome = `error (${e?.code ?? 'unknown'})`; // the code only: a message can quote the address
  }
  counts[outcome] = (counts[outcome] ?? 0) + 1;
}

const n = k => counts[k] ?? 0;
console.log(`${apply ? 'APPLIED' : 'LOOK ONLY (set APPLY=1 to make the missing accounts)'}`);
console.log(`listed on the Directors screen: ${listed.size}`);
console.log(`  already had an account with no password: ${n('exists')}`);
console.log(`  account made now: ${n('created')}`);
console.log(`  account carrying a password, replaced now: ${n('replaced')}`);
console.log(`  account carrying a password, left as it is: ${n('has-password')}`);
console.log(`  no account yet: ${n('missing')}`);
console.log(`  not an email address, skipped: ${n('skipped')}`);
for (const [k, v] of Object.entries(counts)) if (k.startsWith('error')) console.log(`  ${k}: ${v}`);

const covered = n('exists') + n('created') + n('replaced') + n('has-password');
if (failed || n('missing') || n('skipped')) {
  console.log(`\nNOT READY: ${covered} of ${listed.size} listed emails have an account. Do not enable Email/Password yet.`);
  process.exit(apply ? 1 : 0); // a look that finds work to do is not a failure; an apply that leaves some is
}
console.log(`\nEvery listed email has an account (${covered} of ${listed.size}).`);
if (n('has-password')) {
  console.log('Some carry a password. That is expected once the feature is live.');
  console.log('BEFORE it is live it means Email/Password was enabled too early: run again with REPLACE=1.');
}
