import { useMemo } from 'react';
import { Link } from 'react-router';
import { ClipboardSignature, ChevronRight } from 'lucide-react';
import { useSignupForms } from '../../director/hooks/useSignups';
import { useMinuteTick } from '../../director/hooks/useAnnouncements';
import { todayStr } from '../../director/utils';
import { fmtLongDate } from '../../shared/dates';
import { primaryStudent } from '../../shared/identity';
import { eligibleForSignup, signupIsOpen, signupShowsInAlerts } from '../../shared/signupEligibility';
import { getReceipt } from '../signupReceipt';
import type { Student } from '../../director/types';
import '../signup.css';

/**
 * "Your director needs an answer" strip (#signups). Sits on Home and on a
 * student's own schedule page — the two screens students actually open —
 * because a sign-up with a next-day deadline is worth nothing if it only
 * lives on a page nobody visits.
 *
 * Pass `student` on a page that already knows whose schedule it is; on Home
 * it falls back to whatever this device remembers (identity.ts). With no
 * identity at all it stays generic rather than guessing: "sign-ups are open,
 * find your name."
 */
export function SignupAlert({ student }: { student?: Pick<Student, 'id' | 'ensembleIds' | 'instrument' | 'status'> }) {
  const now = useMinuteTick();
  const today = todayStr();
  const { forms } = useSignupForms();

  const saved = primaryStudent();
  const savedId = saved?.id ?? null;
  const target = useMemo(
    () => student
      ?? (saved ? { id: saved.id, ensembleIds: saved.ensembleIds, instrument: saved.instrument, status: 'Active' as const } : null),
    // savedId, not `saved`: identity.ts hands back a fresh object each read,
    // which would otherwise re-run the filter below on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [student, savedId],
  );

  const open = useMemo(
    () => forms.filter(f => signupIsOpen(f, today, now) && signupShowsInAlerts(f)),
    [forms, today, now],
  );

  const relevant = useMemo(() => {
    const pool = target
      ? open.filter(f => eligibleForSignup(target, { ensembleIds: f.ensembleIds ?? [], families: f.families ?? [] }))
      : open;
    // Already sent from this device → not a to-do any more.
    return pool.filter(f => !getReceipt(f.id));
  }, [open, target]);

  if (relevant.length === 0) return null;

  // Soonest deadline first — that's the one that actually needs a tap today.
  const [first] = [...relevant].sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  const dueToday = first.deadline === today;

  return (
    <Link to={`/signup/${first.id}`} className={`pub-signup-alert${dueToday ? ' urgent' : ''}`}>
      <ClipboardSignature size={18} />
      <div className="pub-signup-alert-body">
        <div className="pub-signup-alert-title">
          {target ? 'Your director needs an answer' : 'Sign-ups are open'}
        </div>
        <div className="pub-signup-alert-sub">
          {first.title}
          {first.deadline && (dueToday ? ' — closes today' : ` — by ${fmtLongDate(first.deadline)}`)}
          {relevant.length > 1 && ` · +${relevant.length - 1} more`}
        </div>
      </div>
      <ChevronRight size={18} style={{ flexShrink: 0, opacity: 0.7 }} />
    </Link>
  );
}
