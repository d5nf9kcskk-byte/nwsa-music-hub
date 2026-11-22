import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, query, setDoc, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { auth } from '../firebaseAuth';
import { trackWrite } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import { directorEmailId } from './useDirectors';
import { usePersonnelGate } from './personnelGate';
import { FIXTURES_ON } from './fixtures';
import { FIXTURE_MEMBER_ENTRIES } from './fixturesAdult';
import { staffSendPasswordLink } from '../passwordSetupClient';

/**
 * Players invited to sign in (#member-sign-in, personnel orgs). A player is a
 * Directors entry `{ roles: ['member'], personnelId }`; staff create it from
 * Personnel and the passwordSetup function emails the invitation. The query
 * asks for member entries only, which is exactly what the rule lets an Owner
 * or Director list (query and rule agree).
 */
export interface MemberEntry {
  email: string;
  personnelId: string;
  name?: string;
  invitedAt?: number;
  /** The player has chosen their password (the server set it). */
  passwordSet?: boolean;
}

export function useMemberEntries() {
  const [members, setMembers] = useState<MemberEntry[]>(FIXTURES_ON ? FIXTURE_MEMBER_ENTRIES : []);
  const gate = usePersonnelGate();

  useEffect(() => {
    if (!db || gate !== 'open') return;
    return onSnapshot(query(collection(db, 'directors'), where('roles', '==', ['member'])),
      snap => setMembers(snap.docs.map(d => ({ email: d.id, ...d.data() } as MemberEntry))),
      () => setMembers([]));
  }, [gate]);

  /** Add the player and email their invitation. Answers what to tell staff. */
  async function invite(personnelId: string, name: string, rawEmail: string): Promise<string> {
    const email = directorEmailId(rawEmail);
    if (!db || !auth?.currentUser) return 'Invitations are sent from the live Hub, not this preview.';
    const dbRef = db;
    if (!members.some(m => m.email === email)) {
      const saved = await trackWrite('Invitation', () => setDoc(doc(dbRef, 'directors', email), {
        roles: ['member'], personnelId, name, invitedAt: Date.now(), invitedBy: currentDirectorName(),
      }).then(() => true));
      if (!saved) return 'Could not add them. Is that address already on the Directors list?';
    }
    const answer = await staffSendPasswordLink(await auth.currentUser.getIdToken(), email);
    return answer.ok ? `Invitation sent to ${email}. The link works for three days.` : (answer.message ?? 'The invitation did not send.');
  }

  /** Take away a player's sign-in. Their roster row and contracts stay. */
  async function remove(email: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Sign-in removed', () => deleteDoc(doc(dbRef, 'directors', email)));
  }

  return { members, invite, remove };
}
