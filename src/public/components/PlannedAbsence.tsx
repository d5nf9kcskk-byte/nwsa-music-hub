import { useState } from 'react';
import { firstName } from '../../shared/personName';
import { CalendarX } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { todayStr } from '../../director/utils';
import { t, useLang } from '../../shared/i18n';
import { fmtLongDateInline } from '../../shared/dates';
import type { Student } from '../../director/types';
import { ORG } from '../../org';
import './plannedAbsence.css';
import { backdropClose } from '../../shared/backdropClose';

/**
 * Planned-absence pre-report (#27): a student/parent tells the director ahead
 * of time. Create-only write (rules enforce shape); the director sees it
 * pre-badged on Take Roll and converts it to Excused or dismisses it.
 */
export function PlannedAbsenceButton({ student }: { student: Student }) {
  useLang();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit() {
    // A cleared date input submits '' — rules require a real YYYY-MM-DD.
    if (!db || !reason.trim() || !date) return;
    setState('saving'); setError('');
    try {
      await addDoc(collection(db, 'plannedAbsences'), {
        studentId: student.id,
        studentName: student.name,
        date,
        reason: reason.trim().slice(0, 300),
        submittedAt: Date.now(),
        status: 'pending',
      });
      setState('done');
    } catch (e) {
      setState('error');
      void e;
      setError(t('abs.err.send', { email: ORG.contactEmail }));
    }
  }

  return (
    <>
      <button className="pub-absence-btn" onClick={() => { setOpen(true); setState('idle'); setReason(''); }}>
        <CalendarX size={15} /> {t('sched.plannedAbsence')}
      </button>

      {open && (
        <div className="pub-confirm-overlay" {...backdropClose(() => setOpen(false))}>
          <div className="pub-confirm-card" style={{ textAlign: 'left' }}>
            {state === 'done' ? (
              <>
                <div className="pub-confirm-name" style={{ fontSize: 18 }}>✓ {t('abs.done.title')}</div>
                <p className="pub-absence-hint">
                  {firstName(student.name)} {t('pab.reportedOn')}{' '}
                  <strong>{fmtLongDateInline(date)}</strong>.{' '}
                  {t('pab.seenAtRoll')}
                </p>
                <button className="pub-confirm-yes" style={{ width: '100%' }} onClick={() => setOpen(false)}>{t('look.done')}</button>
              </>
            ) : (
              <>
                <div className="pub-confirm-title">{t('pab.title', { name: student.name.split(',')[0] })}</div>
                <p className="pub-absence-hint">{t('pab.hint')}</p>
                <label className="pub-absence-label">{t('pab.date')}</label>
                <input className="pub-absence-input" type="date" min={todayStr()} value={date} onChange={e => setDate(e.target.value)} />
                <label className="pub-absence-label">{t('abs.reason')}</label>
                <input className="pub-absence-input" value={reason} onChange={e => setReason(e.target.value)} placeholder={t('pab.reasonPh')} maxLength={300} />
                {error && <div className="pub-absence-error">⚠ {error}</div>}
                <div className="pub-confirm-actions">
                  <button className="pub-confirm-no" onClick={() => setOpen(false)}>{t('pdf.cancel')}</button>
                  <button className="pub-confirm-yes" disabled={state === 'saving' || !reason.trim()} onClick={submit}>
                    {state === 'saving' ? t('vid.sending') : t('abs.send')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
