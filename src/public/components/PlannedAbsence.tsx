import { useState } from 'react';
import { CalendarX } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { todayStr, parseDate } from '../../director/utils';
import { t, useLang } from '../../shared/i18n';
import type { Student } from '../../director/types';
import './plannedAbsence.css';

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
    if (!db || !reason.trim()) return;
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
      setError('Could not send right now — check your connection and try again, or email nwsaorchestras@gmail.com.');
    }
  }

  return (
    <>
      <button className="pub-absence-btn" onClick={() => { setOpen(true); setState('idle'); setReason(''); }}>
        <CalendarX size={15} /> {t('sched.plannedAbsence')}
      </button>

      {open && (
        <div className="pub-confirm-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="pub-confirm-card" style={{ textAlign: 'left' }}>
            {state === 'done' ? (
              <>
                <div className="pub-confirm-name" style={{ fontSize: 18 }}>✓ Sent to your director</div>
                <p className="pub-absence-hint">
                  {student.name.split(' ')[0]} is reported out on{' '}
                  <strong>{parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>.
                  They'll see it when they take roll that day. No reply needed.
                </p>
                <button className="pub-confirm-yes" style={{ width: '100%' }} onClick={() => setOpen(false)}>Done</button>
              </>
            ) : (
              <>
                <div className="pub-confirm-title">Planned absence — {student.name.split(',')[0]}</div>
                <p className="pub-absence-hint">
                  For things known ahead of time: field trips, college auditions, appointments.
                  Your director sees it before rehearsal instead of finding out at roll.
                </p>
                <label className="pub-absence-label">Date you'll be out</label>
                <input className="pub-absence-input" type="date" min={todayStr()} value={date} onChange={e => setDate(e.target.value)} />
                <label className="pub-absence-label">Reason</label>
                <input className="pub-absence-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. UF audition trip" maxLength={300} />
                {error && <div className="pub-absence-error">⚠ {error}</div>}
                <div className="pub-confirm-actions">
                  <button className="pub-confirm-no" onClick={() => setOpen(false)}>Cancel</button>
                  <button className="pub-confirm-yes" disabled={state === 'saving' || !reason.trim()} onClick={submit}>
                    {state === 'saving' ? 'Sending…' : 'Send to director'}
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
