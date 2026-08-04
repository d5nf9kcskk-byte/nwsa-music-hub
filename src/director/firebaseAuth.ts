import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { app } from './firebase';

// Auth + Storage, split out of firebase.ts (audit A6): that module is
// imported by the PUBLIC site for `db`, and initializing these there dragged
// firebase/auth + firebase/storage (~35 kB gz) into the public bundle even
// though only the director surface signs in or uploads. Import this module
// from director-side code only.
export const auth = app ? getAuth(app) : null;
export const storage = app ? getStorage(app) : null;
