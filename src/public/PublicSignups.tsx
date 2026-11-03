import { useMemo } from 'react';
import { Link } from 'react-router';
import { ClipboardSignature, CalendarClock, Check, ChevronRight } from 'lucide-react';
import { useSignupForms } from '../director/hooks/useSignups';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { PageHeader, EmptyState, SkeletonCards } from './components/PageHeader';
import { todayStr, ensembleDisplayName } from '../director/utils';
import { fmtLongDateInline } from '../shared/dates';
import { t, useLang } from '../shared/i18n';
import { primaryStudent } from '../shared/identity';
import { INSTRUMENT_FAMILY_LABEL } from '../shared/instrumentFamily';
import { audienceLabel, eligibleForSignup, signupIsOpen, signupShowsInIndex } from '../shared/signupEligibility';
import { getReceipt } from './signupReceipt';
import { formPath } from '../shared/formLink';
import { formKindOf } from '../shared/formKind';
import { formKindLabel } from './formKindLabel';
import type { SignupForm } from '../director/types';
import './signup.css';

/**
 * The public Forms page (#forms, formerly "Sign-ups") — everything currently
 * open. Whatever this device
 * has identified as (identity.ts) floats to the top as "for you" — the rest
 * still list, because a student who has never used Find My Schedule must
 * still be able to reach their form from a link or a QR code.
 *
 * OPEN ONLY (director's call, 2026-10-01): a closed or past sign-up is
 * archived — directors still see it on their screen, the public list does
 * not. A direct link to a closed one still opens and says it is closed.
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

  // signupShowsInIndex, not signupShowsInAlerts: an "Anyone with the link"
  // sign-up is exactly the kind a student arrives at from a QR code or a
  // forwarded message, so it has to have a home on this page even though it
  // deliberately stays off the Hub's alert strip.
  const open = useMemo(
    () => forms.filter(f => signupIsOpen(f, today, now) && signupShowsInIndex(f)),
    [forms, today, now],
  );

  function forMe(f: SignupForm): boolean {
    const target = meFull ?? (me ? { ensembleIds: me.ensembleIds, instrument: me.instrument, status: 'Active' } : null);
    if (!target) return false;
    // `mode` matters: an open sign-up is for nobody in particular, so it must
    // never land under "For you" even if it carries leftover ensembleIds.
    return eligibleForSignup(target, {
      mode: f.audienceMode,
      ensembleIds: f.ensembleIds ?? [],
      families: f.families ?? [],
      highSchoolOnly: f.highSchoolOnly,
    });
  }

  // Waiting for you → done (sent from this device) → anything else open.
  // "Open to anyone" forms get their own heading: they are for people the
  // roster doesn't know yet, which is a different question from "is it mine".
  const waiting = open.filter(f => forMe(f) && !getReceipt(f.id));
  const done = open.filter(f => !!getReceipt(f.id));
  const anyone = open.filter(f => f.audienceMode === 'open' && !getReceipt(f.id));
  const others = open.filter(f => !forMe(f) && f.audienceMode !== 'open' && !getReceipt(f.id));

  function who(f: SignupForm): string {
    if (f.audienceMode === 'students') return t('su.byInvitation');
    return audienceLabel(
      { mode: f.audienceMode, ensembleIds: f.ensembleIds ?? [], families: f.families ?? [], highSchoolOnly: f.highSchoolOnly },
      eid => ensembleDisplayName(ensembles.find(e => e.id === eid)),
      fam => INSTRUMENT_FAMILY_LABEL[fam],
    );
  }

  return (
    <div className="pub-page">
      <PageHeader
        title={<><ClipboardSignature size={20} style={{ verticalAlign: '-3px' }} /> {t('nav.signups')}</>}
        intro={t('forms.intro')}
      />

      {loading && <SkeletonCards n={2} />}

      {!loading && open.length === 0 && (
        <EmptyState icon={<ClipboardSignature size={30} />}>
          {t('forms.empty')}
        </EmptyState>
      )}

      {waiting.length > 0 && (
        <>
          <div className="pub-section-title">{t('forms.waiting')}</div>
          {waiting.map(f => <SignupRow key={f.id} form={f} who={who(f)} today={today} highlight />)}
        </>
      )}

      {others.length > 0 && (
        <>
          {(waiting.length > 0 || done.length > 0) && <div className="pub-section-title">{t('forms.alsoOpen')}</div>}
          {others.map(f => <SignupRow key={f.id} form={f} who={who(f)} today={today} />)}
        </>
      )}

      {anyone.length > 0 && (
        <>
          <div className="pub-section-title">{t('forms.anyone')}</div>
          {anyone.map(f => <SignupRow key={f.id} form={f} who={who(f)} today={today} />)}
        </>
      )}

      {done.length > 0 && (
        <>
          <div className="pub-section-title">{t('forms.done')}</div>
          {done.map(f => <SignupRow key={f.id} form={f} who={who(f)} today={today} />)}
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
  useLang(); // re-render when the EN|ES toggle flips
  const receipt = getReceipt(form.id);
  return (
    <Link to={formPath(form.id)} className={`pub-signup-row${highlight ? ' highlight' : ''}`}>
      <div className="pub-signup-row-body">
        <div className="pub-signup-row-title">{form.title}</div>
        <div className="pub-signup-row-meta">
          <span className="pub-form-kind">{formKindLabel(formKindOf(form))}</span>
          <span>{who}</span>
          {form.deadline && (
            <span className={form.deadline === today ? 'urgent' : undefined}>
              <CalendarClock size={12} />{' '}
              {form.deadline === today ? t('su.closesToday') : t('su.by', { date: fmtLongDateInline(form.deadline) })}
            </span>
          )}
        </div>
      </div>
      {receipt ? (
        <span className="pub-signup-row-done"><Check size={14} /> {t('su.done.sent')}</span>
      ) : (
        <ChevronRight size={18} style={{ opacity: 0.5, flexShrink: 0 }} />
      )}
    </Link>
  );
}
