import { ORG } from '../../org';
import type { SignupForm } from '../types';

type Draft = Omit<SignupForm, 'id'>;

/**
 * Starting points for a sign-up (#signups). A template is just a pre-filled
 * draft — it opens in the normal editor and every word is the director's to
 * change before anything is saved. Nothing here is org-specific: the school's
 * own name comes from ORG, never hardcoded (see CLAUDE.md).
 *
 * The All-State one exists because that is the sign-up with the tightest
 * turnaround in the year — names are usually wanted within a day of the
 * director hearing about it — and because the paperwork that follows is the
 * exact thing this feature replaces.
 */
export function allStateTemplate(deadline: string): Draft {
  return {
    title: 'All-State auditions — who’s in?',
    intro:
      'All-State auditions are coming up. If you want to audition, sign up here so I '
      + 'can register you before the deadline.\n\n'
      + 'Signing up means you plan to prepare the required audition material and be '
      + 'there on the audition day. If you are not sure yet, come talk to me before you sign.',
    ensembleIds: [],
    families: [],
    deadline,
    questions: [
      {
        id: 'q1',
        label: 'What will you audition on?',
        type: 'short',
        required: true,
        help: 'Your instrument or voice part, exactly as it should be registered.',
      },
      {
        id: 'q2',
        label: 'Have you auditioned for All-State before?',
        type: 'yesno',
        required: true,
      },
      {
        id: 'q3',
        label: 'Anything I should know?',
        type: 'long',
        help: 'Conflicts, travel, or anything that could get in the way. Optional.',
      },
    ],
    collectEmail: true,
    signatureStatement:
      'I want to audition for All-State. I understand that I am responsible for preparing '
      + 'the required audition material, meeting every deadline my director gives me, and '
      + 'being present for the audition. Everything I have entered above is correct.',
    guardianStatement:
      'I am the parent or guardian of the student above. I give permission for them to '
      + `audition for All-State as a ${ORG.orgShortName} student, and I understand there may `
      + 'be fees, travel, and dates outside the normal school day involved.',
    createdAt: Date.now(),
  };
}
