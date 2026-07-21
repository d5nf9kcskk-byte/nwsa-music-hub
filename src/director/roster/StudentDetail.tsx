import { useMemo } from 'react';
import { Pencil, Phone, Mail, Users, Calendar, FileText, ClipboardCheck, ExternalLink, Archive, RotateCcw } from 'lucide-react';
import { useAttendanceHistory } from '../hooks/useAttendance';
import { useProgressNotes } from '../hooks/useProgressNotes';
import { useEvents } from '../hooks/useEvents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useStudentAssignmentResults, useAssignments } from '../hooks/useAssignments';
import { useStudents } from '../hooks/useStudents';
import { studentExpectation } from '../rosterResolver';
import { todayStr, ensembleColor, formatDate } from '../utils';
import type { Student, StudentContact, Ensemble } from '../types';
import { Linkify } from '../components/Linkify';
import { EditedByLine } from '../components/EditedByLine';
import { useModalA11y } from '../../shared/useModalA11y';

interface Props {
  student: Student;
  students: Student[];
  contact: StudentContact | null;
  ensembles: Ensemble[];
  onEdit: () => void;
  onClose: () => void;
}

export function StudentDetail({ student, students, contact, ensembles, onEdit, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true);
  const { records: attendanceRecords } = useAttendanceHistory(student.id);
  const { notes: progressNotes } = useProgressNotes(student.id);
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const { results: assignmentResults } = useStudentAssignmentResults(student.id);
  const { assignments } = useAssignments();
  const { archiveStudent, restoreStudent } = useStudents();
  const today = todayStr();

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  const upcomingEvents = useMemo(() => {
    return events
      .filter(e => e.date >= today)
      .map(e => ({ event: e, exp: studentExpectation(student.id, e, students, overrides, eventsById) }))
      .filter(x => x.exp.expected)
      .sort((a, b) => a.event.date.localeCompare(b.event.date))
      .slice(0, 8);
  }, [events, today, student.id, students, overrides, eventsById]);

  const homeEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));

  const absences = attendanceRecords.filter(r => r.status === 'Absent').length;
  const lates   = attendanceRecords.filter(r => r.status === 'Late').length;
  const excused = attendanceRecords.filter(r => r.status === 'Excused').length;
  const lessons = attendanceRecords.filter(r => r.status === 'Lesson').length;

  const assignmentsById = useMemo(
    () => Object.fromEntries(assignments.map(a => [a.id, a])),
    [assignments],
  );

  const recentAssignmentResults = [...assignmentResults]
    .sort((a, b) => (b.gradedAt ?? '').localeCompare(a.gradedAt ?? ''))
    .slice(0, 6);

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={student.name}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dir-drawer-title">{student.name}</div>
            <div style={{ fontSize: 12, color: 'var(--dir-text-muted)', marginTop: 2 }}>
              {[student.instrument, student.section, student.grade, student.status !== 'Active' ? student.status : null]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {student.status === 'Active' ? (
              <button className="dir-tool-btn" onClick={() => { if (window.confirm(`Archive ${student.name}? They leave all rosters and rolls but stay in the Archived list and can be restored anytime.`)) { void archiveStudent(student.id); onClose(); } }}>
                <Archive size={13} /> Archive
              </button>
            ) : (
              <button className="dir-tool-btn" onClick={() => { void restoreStudent(student.id); onClose(); }}>
                <RotateCcw size={13} /> Restore
              </button>
            )}
            <button className="dir-tool-btn" onClick={onEdit}>
              <Pencil size={13} /> Edit
            </button>
            <button className="dir-drawer-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="dir-drawer-body">
          <EditedByLine updatedAt={student.updatedAt} updatedBy={student.updatedBy} />

          {/* ── Ensembles ── */}
          {homeEnsembles.length > 0 && (
            <div className="dir-detail-section">
              <div className="dir-detail-section-title"><Users size={13} /> Ensembles</div>
              <div className="dir-detail-tags">
                {homeEnsembles.map(e => (
                  <span key={e.id} className="dir-detail-ens-tag" style={{ background: ensembleColor(e) }}>
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Contact info (director-only) ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title"><Mail size={13} /> Contact <span className="dir-detail-private">directors only</span></div>
            {(() => {
              // Prefer the full guardians[] list from the spreadsheet import; fall
              // back to the flat parent mirror for records created before import.
              const guardians = contact?.guardians?.length
                ? contact.guardians
                : (contact?.parentEmail || contact?.phone)
                  ? [{ email: contact?.parentEmail, phone: contact?.phone }]
                  : [];
              const extras = contact?.extra ? Object.entries(contact.extra).filter(([, v]) => v) : [];
              if (!(contact?.email || guardians.length > 0 || extras.length > 0)) {
                return (
                  <button className="dir-btn dir-btn-ghost" style={{ marginTop: 6 }} onClick={onEdit}>
                    <Pencil size={13} /> Add contact info
                  </button>
                );
              }
              return (
                <div className="dir-detail-contact-list">
                  {contact?.email && (
                    <a href={`mailto:${contact.email}`} className="dir-detail-contact-row">
                      <Mail size={13} />
                      <span>{contact.email}</span>
                      <ExternalLink size={11} className="dir-detail-ext" />
                    </a>
                  )}
                  {guardians.map((g, i) => (
                    <div key={i} className="dir-detail-guardian">
                      <div className="dir-detail-guardian-name">
                        <Users size={13} />
                        <span>{g.name || 'Parent / Guardian'}{g.relation ? ` · ${g.relation}` : ''}</span>
                      </div>
                      {g.email && (
                        <a href={`mailto:${g.email}`} className="dir-detail-contact-row">
                          <Mail size={13} />
                          <span>{g.email}</span>
                          <ExternalLink size={11} className="dir-detail-ext" />
                        </a>
                      )}
                      {g.phone && (
                        <a href={`tel:${g.phone}`} className="dir-detail-contact-row">
                          <Phone size={13} />
                          <span>{g.phone}</span>
                          <ExternalLink size={11} className="dir-detail-ext" />
                        </a>
                      )}
                    </div>
                  ))}
                  {extras.length > 0 && (
                    <div className="dir-detail-extra">
                      {extras.map(([k, v]) => (
                        <div key={k} className="dir-detail-extra-row">
                          <FileText size={12} />
                          <span className="dir-detail-extra-key">{k}</span>
                          <span className="dir-detail-extra-val"><Linkify text={v} /></span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── Attendance ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title"><Calendar size={13} /> Attendance</div>
            <div className="dir-detail-att-chips">
              <span className="dir-detail-att-chip dir-detail-att-absent">{absences} Absent</span>
              <span className="dir-detail-att-chip dir-detail-att-late">{lates} Late</span>
              <span className="dir-detail-att-chip dir-detail-att-excused">{excused} Excused</span>
              {lessons > 0 && <span className="dir-detail-att-chip dir-detail-att-lesson">{lessons} Lesson</span>}
            </div>
            {attendanceRecords.length > 0 && (
              <div className="dir-detail-att-list">
                {attendanceRecords.slice(0, 12).map(r => (
                  <div key={r.id} className="dir-detail-att-row">
                    <span className={`dir-detail-att-status dir-detail-att-${r.status.toLowerCase()}`}>{r.status}</span>
                    <span className="dir-detail-att-date">{formatDate(r.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {r.reason && <span className="dir-detail-att-reason">{r.reason}</span>}
                  </div>
                ))}
                {attendanceRecords.length > 12 && (
                  <div className="dir-detail-more">+{attendanceRecords.length - 12} more</div>
                )}
              </div>
            )}
          </div>

          {/* ── Upcoming events ── */}
          {upcomingEvents.length > 0 && (
            <div className="dir-detail-section">
              <div className="dir-detail-section-title"><Calendar size={13} /> Upcoming Events</div>
              <div className="dir-detail-events">
                {upcomingEvents.map(({ event: e, exp }) => (
                  <div key={e.id} className="dir-detail-event-row">
                    <span className="dir-detail-event-date">
                      {formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="dir-detail-event-title">{e.title || e.type}</span>
                    {exp.isSub && <span className="dir-detail-sub-tag">Sub</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Assignment results ── */}
          {recentAssignmentResults.length > 0 && (
            <div className="dir-detail-section">
              <div className="dir-detail-section-title"><ClipboardCheck size={13} /> Assignments</div>
              <div className="dir-detail-assign-list">
                {recentAssignmentResults.map(r => {
                  const a = assignmentsById[r.assignmentId];
                  return (
                    <div key={r.id} className="dir-detail-assign-row">
                      <span className={`dir-detail-assign-status dir-detail-assign-${r.status.toLowerCase()}`}>
                        {r.status}
                      </span>
                      <span className="dir-detail-assign-title">{a?.title ?? r.assignmentId}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Progress notes ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title"><FileText size={13} /> Progress Notes</div>
            {progressNotes.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--dir-text-muted)', marginTop: 6 }}>No notes on file.</div>
            ) : (
              <div className="dir-detail-notes">
                {progressNotes.slice(0, 6).map(n => (
                  <div key={n.id} className="dir-detail-note">
                    <div className="dir-detail-note-header">
                      <span className="dir-detail-note-date">
                        {formatDate(n.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {n.category && n.category !== 'General' && (
                        <span className="dir-detail-note-cat">{n.category}</span>
                      )}
                    </div>
                    <div className="dir-detail-note-content"><Linkify text={n.content} /></div>
                  </div>
                ))}
                {progressNotes.length > 6 && (
                  <div className="dir-detail-more">+{progressNotes.length - 6} more notes</div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
