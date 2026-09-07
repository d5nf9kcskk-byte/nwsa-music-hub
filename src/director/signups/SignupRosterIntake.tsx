import { useMemo, useState } from 'react';
import { UserPlus, AlertTriangle, Check, ChevronDown, ChevronRight } from 'lucide-react';
import {
  COLLEGE_GRADE, contactWrite, intakeSummary, planRosterIntake, studentWrite,
  type IntakeChoice, type IntakeChoices, type IntakeFieldKey, type IntakeRow,
} from '../../shared/signupRosterIntake';
import { classGroups, ensembleColor, performingEnsembles } from '../utils';
import type { Ensemble, SignupForm, SignupResponse, Student, StudentContact } from '../types';

/**
 * "Put these people in the roster" (#signups).
 *
 * An open sign-up is the intake for people who are not on the roster yet, and
 * for a college student it is the ONLY record: nothing uploads them from the
 * district, so whatever they typed into the form is all the school will ever
 * have. Everything on the response therefore comes across — instrument,
 * grade, email, phone, the guardian, and every free-text answer — with the
 * contact half landing in `contacts`, never on the world-mirrored student doc.
 *
 * The plan is computed by `src/shared/signupRosterIntake.ts` and shown in full
 * BEFORE anything is written, because the only anchor an open response has is
 * a typed name. Where a name matches somebody already on the roster and the
 * two records disagree, the director picks a side per field: usually one of
 * them is simply more complete, so the fuller value is pre-selected and the
 * exceptions are one tap each.
 *
 * Groups are picked here rather than derived from the form. The college
 * cohort joins Symphony and College Chamber, and next term the same cohort
 * needs a theory section — the ids that answer that are NWSA's, not this
 * component's (org config, #white-label), so the director ticks them.
 */
export function SignupRosterIntake({
  form, responses, students, contacts, ensembles,
  onAddStudent, onUpdateStudent, onSaveContact, onSetStatus,
}: {
  form: SignupForm;
  /** The responses to import — normally the latest per person, minus withdrawn. */
  responses: SignupResponse[];
  students: Student[];
  contacts: Record<string, StudentContact>;
  ensembles: Ensemble[];
  onAddStudent: (data: Omit<Student, 'id'>) => Promise<string | undefined>;
  onUpdateStudent: (id: string, data: Partial<Omit<Student, 'id'>>) => Promise<void>;
  onSaveContact: (studentId: string, data: Omit<StudentContact, 'id'>) => Promise<void>;
  onSetStatus: (id: string, status: SignupResponse['status']) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [grade, setGrade] = useState(COLLEGE_GRADE);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState('');
  const [failed, setFailed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Per-response overrides: response id → field key → which side wins. */
  const [choices, setChoices] = useState<Record<string, IntakeChoices>>({});

  const groups = useMemo(() => [
    ...performingEnsembles(ensembles),
    ...classGroups(ensembles),
  ], [ensembles]);

  const rows = useMemo(
    () => planRosterIntake(responses, students, {
      ensembleIds: picked,
      grade: grade.trim() || COLLEGE_GRADE,
      form,
      contacts,
    }),
    [responses, students, contacts, picked, grade, form],
  );
  const counts = intakeSummary(rows);
  const nothingToDo = counts.create === 0 && counts.update === 0;

  function toggle(id: string) {
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  }

  function choose(responseId: string, key: IntakeFieldKey, side: IntakeChoice) {
    setChoices(c => ({ ...c, [responseId]: { ...c[responseId], [key]: side } }));
  }

  async function run() {
    if (running || nothingToDo) return;
    const label = [
      counts.create ? `add ${counts.create}` : '',
      counts.update ? `update ${counts.update}` : '',
    ].filter(Boolean).join(' and ');
    if (!window.confirm(`This will ${label} student record${counts.create + counts.update === 1 ? '' : 's'}. Go ahead?`)) return;
    setRunning(true);
    setDone('');
    setFailed([]);
    let added = 0;
    let changed = 0;
    const stuck: string[] = [];
    try {
      // One row at a time, deliberately: each student write goes through
      // useStudents so the studentsPublic mirror is batched with the source
      // doc (#privacy), and a row that throws leaves the rows already written
      // intact — the plan is idempotent, so the fix is to run it again.
      for (const row of rows) {
        if (row.action === 'same') continue;
        const mine = choices[row.response.id];
        try {
          let studentId = row.match?.id;
          const patch = studentWrite(row, picked, mine);
          if (!row.match) {
            studentId = await onAddStudent(patch as Omit<Student, 'id'>);
            if (studentId) added += 1;
          } else if (Object.keys(patch).length) {
            await onUpdateStudent(row.match.id, patch);
            changed += 1;
          }
          // The contact half never rides on the student doc: that one is
          // mirrored to studentsPublic, and an address typed into a public
          // form must not become public.
          const contact = contactWrite(row, studentId ? contacts[studentId] : undefined, mine);
          if (studentId && contact) await onSaveContact(studentId, contact);
          // The response is now in the system — the tick the director used to
          // set by hand after typing the name.
          if (studentId && row.response.status === 'submitted') {
            await onSetStatus(row.response.id, 'entered');
          }
          if (!studentId) stuck.push(row.name);
        } catch {
          // Reported by the write-status strip already; here it only has to
          // stop this row from being counted as done.
          stuck.push(row.name);
        }
      }
      setDone(`${added} added, ${changed} updated.`);
      setFailed(stuck);
    } finally {
      setRunning(false);
    }
  }

  if (!responses.length) return null;

  return (
    <>
      <div className="dir-signup-section"><UserPlus size={13} /> Add to the roster</div>
      {!open && (
        <div className="dir-signup-intake-teaser">
          <span>Turn these {responses.length} response{responses.length === 1 ? '' : 's'} into roster students, with everything they filled in.</span>
          <button className="dir-tool-btn" onClick={() => setOpen(true)}>
            <UserPlus size={15} /> Set this up
          </button>
        </div>
      )}

      {open && (
        <div className="dir-signup-intake">
          <div className="dir-signup-help">
            Everyone imported joins the groups you tick and keeps every group they are already in.
            Email, phone, the parent/guardian and the answers to your questions go to their contact
            record, which stays staff-only.
          </div>

          <div className="dir-signup-intake-groups" role="group" aria-label="Groups these students join">
            {groups.map(e => (
              <label key={e.id} className={`dir-signup-intake-chip${picked.includes(e.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} />
                <span className="dot" style={{ background: ensembleColor(e) }} aria-hidden />
                {e.name}
              </label>
            ))}
          </div>

          <div className="dir-field dir-signup-intake-grade">
            <label htmlFor="intake-grade">Grade to record</label>
            <input
              id="intake-grade"
              className="dir-input"
              value={grade}
              onChange={ev => setGrade(ev.target.value)}
              placeholder={COLLEGE_GRADE}
            />
            <div className="dir-signup-help">
              Dual-enrollment students are “{COLLEGE_GRADE}”. Change it if this sign-up is a high-school cohort.
            </div>
          </div>

          {counts.conflicts > 0 && (
            <div className="dir-signup-warn">
              <AlertTriangle size={13} /> {counts.conflicts} field{counts.conflicts === 1 ? '' : 's'} where
              the roster and the form disagree. The fuller answer is picked for you — open a row to change it.
            </div>
          )}

          <div className="dir-signup-intake-plan">
            {rows.map(row => (
              <IntakeRowView
                key={row.response.id}
                row={row}
                choices={choices[row.response.id]}
                expanded={expanded === row.response.id}
                onToggle={() => setExpanded(id => (id === row.response.id ? null : row.response.id))}
                onChoose={(key, side) => choose(row.response.id, key, side)}
              />
            ))}
          </div>

          <div className="dir-signup-resp-actions">
            <button className="dir-tool-btn dir-btn-primary" disabled={running || nothingToDo} onClick={() => void run()}>
              {running
                ? 'Working…'
                : nothingToDo
                  ? 'Nothing to add'
                  : <><UserPlus size={15} /> Add {counts.create} · update {counts.update}</>}
            </button>
            <button className="dir-tool-btn" disabled={running} onClick={() => setOpen(false)}>Close</button>
            {done && <span className="dir-signup-tag done"><Check size={12} /> {done}</span>}
          </div>
          {failed.length > 0 && (
            <div className="dir-signup-warn">
              <AlertTriangle size={13} /> Didn’t go through for {failed.join(', ')}. Nothing else was
              affected — press again to retry just those.
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** One person's row: the headline, and on tap every field the import will
 *  write. This is the whole safety story for a name-matched import, so it
 *  says what happens to each value in words rather than summarising. */
function IntakeRowView({ row, choices, expanded, onToggle, onChoose }: {
  row: IntakeRow;
  choices?: IntakeChoices;
  expanded: boolean;
  onToggle: () => void;
  onChoose: (key: IntakeFieldKey, side: IntakeChoice) => void;
}) {
  const conflicts = row.fields.filter(f => f.conflict).length;
  const writes = row.fields.filter(f => {
    const side = choices?.[f.key] ?? f.choice;
    const value = side === 'incoming' ? f.incoming : f.current;
    return !!value && value !== f.current;
  });
  const answers = Object.entries(row.answers);

  return (
    <div className={`dir-signup-intake-row ${row.action}`}>
      <button className="dir-signup-intake-head" onClick={onToggle} aria-expanded={expanded}>
        {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <span className="who">{row.name}</span>
        <span className="what">
          {row.action === 'create' && 'New student'}
          {row.action === 'update' && 'Already on the roster'}
          {row.action === 'same' && 'Already has all of this'}
        </span>
        {row.action === 'update' && !row.response.studentId && (
          <span className="dir-signup-intake-note"><AlertTriangle size={12} aria-hidden /> matched by name</span>
        )}
        {conflicts > 0 && (
          <span className="dir-signup-tag partial">{conflicts} to check</span>
        )}
      </button>

      {expanded && (
        <div className="dir-signup-intake-detail">
          {row.addedEnsembleIds.length > 0 && (
            <div className="dir-signup-intake-line">
              Joins {row.addedEnsembleIds.length} group{row.addedEnsembleIds.length === 1 ? '' : 's'}
              {row.match ? ', keeping the ones they are already in' : ''}.
            </div>
          )}

          {row.fields.map(f => {
            const side = choices?.[f.key] ?? f.choice;
            if (!f.conflict) {
              const value = side === 'incoming' ? f.incoming : f.current;
              if (!value || value === f.current) return null;
              return (
                <div key={f.key} className="dir-signup-intake-line">
                  <span className="k">{f.label}</span>
                  <span className="v">{value}</span>
                </div>
              );
            }
            return (
              <div key={f.key} className="dir-signup-intake-pick">
                <span className="k">{f.label}</span>
                <div className="dir-signup-intake-opts">
                  <label className={side === 'current' ? 'on' : ''}>
                    <input
                      type="radio"
                      name={`${row.response.id}-${f.key}`}
                      checked={side === 'current'}
                      onChange={() => onChoose(f.key, 'current')}
                    />
                    <span className="src">On the roster</span> {f.current}
                  </label>
                  <label className={side === 'incoming' ? 'on' : ''}>
                    <input
                      type="radio"
                      name={`${row.response.id}-${f.key}`}
                      checked={side === 'incoming'}
                      onChange={() => onChoose(f.key, 'incoming')}
                    />
                    <span className="src">They typed</span> {f.incoming}
                  </label>
                </div>
              </div>
            );
          })}

          {answers.length > 0 && (
            <>
              <div className="dir-signup-intake-line subhead">
                Kept on their contact record ({answers.length})
              </div>
              {answers.map(([k, v]) => (
                <div key={k} className="dir-signup-intake-line">
                  <span className="k">{k}</span>
                  <span className="v">{v}</span>
                </div>
              ))}
              {row.answersOverwritten.length > 0 && (
                <div className="dir-signup-intake-line note">
                  Replaces an earlier answer for: {row.answersOverwritten.join(', ')}
                </div>
              )}
            </>
          )}

          {row.action === 'same' && !writes.length && !answers.length && (
            <div className="dir-signup-intake-line note">Nothing to write — this record already says all of it.</div>
          )}
        </div>
      )}
    </div>
  );
}
