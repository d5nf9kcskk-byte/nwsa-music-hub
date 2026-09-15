import type { Tab } from './types';

export type DirTab = Tab | 'scheduleChanges' | 'scheduleSwap' | 'rotations' | 'announcements' | 'today' | 'ensembleHub' | 'ensembles' | 'classes' | 'college' | 'whosOut' | 'documents' | 'lessons' | 'myLessons' | 'messages' | 'signups' | 'personnel' | 'juries' | 'concertCheckin' | 'gradebook' | 'approvals' | 'directors';

export interface DirNavOpts {
  ensembleId?: string;
  date?: string;
  eventId?: string;
  studentId?: string;
  announcementId?: string;
  /** Open this assignment's sheet on the Assignments tab — so an assignment
   *  is editable from wherever it is listed, not only from that tab. */
  assignmentId?: string;
  /** Open the roster with everyone in `ensembleId` already ticked, so the
   *  contact bar is up and ready (#roster-contact). This is "Email / text
   *  this class" on a group page: the roster is where contacting people
   *  lives, and arriving there with an empty selection is three taps of
   *  nothing. */
  selectAll?: boolean;
}

/** Cross-tab navigation with intent (preselect an ensemble, focus an event, …). */
export type DirNavigate = (tab: DirTab, opts?: DirNavOpts) => void;
