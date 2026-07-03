import type { Tab } from './types';

export type DirTab = Tab | 'scheduleChanges' | 'announcements' | 'today' | 'ensembleHub';

export interface DirNavOpts {
  ensembleId?: string;
  date?: string;
  eventId?: string;
}

/** Cross-tab navigation with intent (preselect an ensemble, focus an event, …). */
export type DirNavigate = (tab: DirTab, opts?: DirNavOpts) => void;
