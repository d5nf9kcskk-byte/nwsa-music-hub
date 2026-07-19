import type { Tab } from './types';

export type DirTab = Tab | 'scheduleChanges' | 'scheduleSwap' | 'announcements' | 'today' | 'ensembleHub' | 'whosOut' | 'documents';

export interface DirNavOpts {
  ensembleId?: string;
  date?: string;
  eventId?: string;
  studentId?: string;
  announcementId?: string;
}

/** Cross-tab navigation with intent (preselect an ensemble, focus an event, …). */
export type DirNavigate = (tab: DirTab, opts?: DirNavOpts) => void;
