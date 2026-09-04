import { GraduationCap, MapPin } from 'lucide-react';
import { AddToCalendarButton } from './AddToCalendar';
import { formatTime, parseDate } from '../../director/utils';
import { t, useLang } from '../../shared/i18n';
import type { PublicLesson } from '../../shared/publicLesson';
import type { CalendarEvent } from '../../director/types';

/**
 * A student's own private-lesson times, on the page they actually open
 * (#applied).
 *
 * Until this existed a lesson reached a student only through
 * `feeds/student-<id>.ics` — rebuilt hourly by the deploy cron, and only for
 * a student who had already subscribed to their personal calendar. Their own
 * schedule screen showed nothing, which is why a teacher could set a weekly
 * time, watch the Hub confirm it, and have the student still not know when to
 * turn up.
 *
 * Everything here comes from `lessonsPublic`, which is WHEN and WHERE only.
 * The grade, the comments, the repertoire and the initials live on the
 * staff-only `lessons` doc and never come near this file.
 */

/** The lesson as a one-off calendar entry, so "Add to calendar" works on it
 *  exactly as it does on a rehearsal. The mirror doc id is the lesson's own,
 *  so re-adding one updates that entry instead of duplicating it. */
function lessonCalendarEvent(lesson: PublicLesson, studentName?: string): CalendarEvent | null {
  if (!lesson.date || !lesson.startTime) return null;
  return {
    id: `lesson-${lesson.id}`,
    type: 'Event',
    status: lesson.status ?? 'Scheduled',
    ensembleIds: [],
    date: lesson.date,
    startTime: lesson.startTime,
    endTime: lesson.endTime || lesson.startTime,
    title: lessonTitle(lesson, studentName),
    ...(lesson.location ? { location: lesson.location } : {}),
  };
}

function lessonTitle(lesson: PublicLesson, studentName?: string): string {
  const what = lesson.instrument
    ? t('sched.lessonWithInstrument', { instrument: lesson.instrument })
    : t('sched.lesson');
  return studentName ? `${what} — ${studentName}` : what;
}

/** "Fri, Oct 3 · 2:00 PM – 2:45 PM" */
function whenLabel(lesson: PublicLesson): string {
  const day = lesson.date
    ? parseDate(lesson.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const time = lesson.startTime
    ? `${formatTime(lesson.startTime)}${lesson.endTime ? ` – ${formatTime(lesson.endTime)}` : ''}`
    : '';
  return [day, time].filter(Boolean).join(' · ');
}

export function LessonTimes({ lessons, studentName, heading }: {
  lessons: PublicLesson[];
  studentName?: string;
  /** Omit on the "today" strip, where the day header already says when. */
  heading?: boolean;
}) {
  useLang();
  if (lessons.length === 0) return null;

  return (
    <>
      {heading && <h2 className="pub-section-title">{t('sched.yourLessons')}</h2>}
      <div className="pub-card pub-booked-times">
        {lessons.map(l => {
          const ev = lessonCalendarEvent(l, studentName);
          const cancelled = l.status === 'Cancelled';
          return (
            <div key={l.id} className="pub-booked-time">
              <div className="pub-booked-time-info">
                <span className="pub-booked-time-title">
                  <GraduationCap size={14} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} aria-hidden="true" />
                  {lessonTitle(l, undefined)}
                  {l.teacherName ? ` ${t('sched.lessonWith', { teacher: l.teacherName })}` : ''}
                  {/* Said in words rather than only struck through: a
                      cancelled lesson is the one a student must not show up
                      for, and strikethrough alone does not survive a screen
                      reader or a bright hallway. */}
                  {cancelled && <> — <strong>{t('card.cancelled')}</strong></>}
                </span>
                <div className="pub-booked-time-when">
                  {whenLabel(l)}
                  {l.location && (
                    <>
                      <MapPin size={13} aria-hidden="true" /> {l.location}
                    </>
                  )}
                </div>
              </div>
              {ev && !cancelled && <AddToCalendarButton event={ev} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
