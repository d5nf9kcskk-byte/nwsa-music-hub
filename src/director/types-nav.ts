import type { Tab } from './types';

export type DirTab = Tab | 'scheduleChanges' | 'scheduleSwap' | 'announcements' | 'today' | 'ensembleHub' | 'ensembles' | 'classes' | 'whosOut' | 'documents' | 'lessons' | 'myLessons' | 'messages' | 'signups' | 'personnel' | 'juries';

export interface DirNavOpts {
  ensembleId?: string;
  date?: string;
  eventId?: string;
  studentId?: string;
  announcementId?: string;
  /** Open this assignment's sheet on the Assignments tab — so an assignment
   *  is editable from wherever it is listed, not only from that tab. */
  assignmentId?: string;
}

/** Cross-tab navigation with intent (preselect an ensemble, focus an event, …). */
export type DirNavigate = (tab: DirTab, opts?: DirNavOpts) => void;
