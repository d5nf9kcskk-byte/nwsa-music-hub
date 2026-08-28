import { useMemo } from 'react';
import { Link } from 'react-router';
import { ClipboardSignature, CalendarClock, Check, ChevronRight } from 'lucide-react';
import { useSignupForms } from '../director/hooks/useSignups';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { PageHeader, EmptyState, SkeletonCards } from './components/PageHeader';
import { todayStr, ensembleDisplayName } from '../director/utils';
import { fmtLongDate } from '../shared/dates';
import { useLang } from '../shared/i18n';
import { primaryStudent } from '../shared/identity';
import { INSTRUMENT_FAMILY_LABEL } from '../shared/instrumentFamily';
import { audienceLabel, eligibleForSignup, signupIsOpen, signupIsPublished, signupShowsInAlerts } from '../shared/signupEligibility';
import { getReceipt } from './signupReceipt';
import type { SignupForm } from '../director/types';
import './signup.css';

/**
 * Everything currently open for sign-up (#signups). Whatever this device
 * has identified as (identity.ts) floats to the top as "for you" — the rest
 * still list, because a student who has never used Find My Schedule must
 * still be able to reach their form from a link or a QR code.
 */
export function PublicSignups() {
  useLang();
  const now = useMinuteTick();
  const today = todayStr();
  const { forms, loading } = useSignupForms();
  const { students } = useStudentsPublic();
  const { ensembles } = useEnsembles();

  const me = primaryStudent();
  const meFull = me ? students.find(s => s.id === me.id) : undefined;

  const open = useMemo(
    () => forms.filter(f => signupIsOpen(f, today, now) && signupShowsInAlerts(f)),
    [forms, today, now],
  );
  const recentlyClosed = useMemo(
    () => forms
      .filter(f => signupIsPublished(f, now) && !signupIsOpen(f, today, now))
      .slice(0, 4),
    [forms, today, now],
  );

  function forMe(f: SignupForm): boolean {
    const target = meFull ?? (me ? { ensembleIds: me.ensembleIds, instrument: me.instrument, status: 'Active' } : null);
    if (!target) return false;
    return eligibleForSignup(target, { ensembleIds: f.ensembleIds ?? [], families: f.families ?? [] });
  }

  const mine = open.filter(forMe);
  const others = open.filter(f => !forMe(f));

  function who(f: SignupForm): string {
    if (f.audienceMode === 'students') return 'By invitation';
    return audienceLabel(
      { ensembleIds: f.ensembleIds ?? [], families: f.families ?? [] },
      eid => ensembleDisplayName(ensembles.find(e => e.id === eid)),
      fam => INSTRUMENT_FAMILY_LABEL[fam],
    );
  }

  return (
    <div className="pub-page">
      <PageHeader
        title={<><ClipboardSignature size={20} style={{ verticalAlign: '-3px' }} /> Sign-ups</>}
        intro="Auditions, trips, and anything else your director needs you to opt into. Tap one, find your name, and you’re done."
      />

      {loading && <SkeletonCards n={2} />}

      {!loading && open.length === 0 && (
        <EmptyState icon={<ClipboardSignature size={30} />}>
          Nothing open right now. When your director opens one, it shows up here and on the Hub home page.
        </EmptyState>
      )}

      {mine.length > 0 && (
        <>
          <div className="pub-section-title">For you</div>
          {mine.map(f => <SignupRow key={f.id} form={f} who={who(f)} today={today} highlight />)}
        </>
      )}

      {others.length > 0 && (
        <>
          {mine.length > 0 && <div className="pub-section-title">Also open</div>}
          {others.map(f => <SignupRow key={f.id} form={f} who={who(f)} today={today} />)}
        </>
      )}

      {recentlyClosed.length > 0 && (
        <>
          <div className="pub-section-title">Closed</div>
          {recentlyClosed.map(f => (
            <div key={f.id} className="pub-signup-row closed">
              <div className="pub-signup-row-body">
                <div className="pub-signup-row-title">{f.title}</div>
                <div className="pub-muted">
                  {f.deadline ? `Closed after ${fmtLongDate(f.deadline)}` : 'Closed by your director'}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SignupRow({ form, who, today, highlight }: {
  form: SignupForm;
  who: string;
  today: string;
  highlight?: boolean;
}) {
  const receipt = getReceipt(form.id);
  return (
    <Link to={`/signup/${form.id}`} className={`pub-signup-row${highlight ? ' highlight' : ''}`}>
      <div className="pub-signup-row-body">
        <div className="pub-signup-row-title">{form.title}</div>
        <div className="pub-signup-row-meta">
          <span>{who}</span>
          {form.deadline && (
            <span className={form.deadline === today ? 'urgent' : undefined}>
              <CalendarClock size={12} />{' '}
              {form.deadline === today ? 'Closes today' : `By ${fmtLongDate(form.deadline)}`}
            </span>
          )}
        </div>
      </div>
      {receipt ? (
        <span className="pub-signup-row-done"><Check size={14} /> Sent</span>
      ) : (
        <ChevronRight size={18} style={{ opacity: 0.5, flexShrink: 0 }} />
      )}
    </Link>
  );
}
