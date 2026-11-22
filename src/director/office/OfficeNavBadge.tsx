import { useThreads } from './useOffice';
import { staffUnread } from './officeCore';

/** The unread count on the Messages nav row (#messages): conversations where the
 *  player wrote last and nobody on staff has opened it, plus `extra` (new public
 *  Contact Us messages). Mounted by DirectorApp
 *  for personnel orgs only; the same badge in the rail and the phone menu. */
export default function OfficeNavBadge({ extra = 0 }: { extra?: number }) {
  const { threads } = useThreads();
  const n = threads.filter(staffUnread).length + extra;
  return n > 0 ? <span className="dir-nav-badge">{n}</span> : null;
}
