import { useMemo, useState } from 'react';
import { UserPlus, AlertTriangle, Check } from 'lucide-react';
import {
  COLLEGE_GRADE, intakeSummary, planRosterIntake, type IntakeRow,
} from '../../shared/signupRosterIntake';
import { classGroups, ensembleColor, performingEnsembles } from '../utils';
import type { Ensemble, SignupResponse, Student } from '../types';

/**
 * "Put these people in the roster" (#signups).
 *
 * An open sign-up is the intake for people who are not on the roster yet —
 * new college students, incoming freshmen — and until now the second half of
 * that job was a human typing every name into the Roster screen and then
 * ticking "Mark entered in the system" to remember they had. That is the
 * manual loop sign-ups exist to remove, one screen further along.
 *
 * The plan is computed by `src/shared/signupRosterIntake.ts` and shown in
 * full BEFORE anything is written, because the only anchor an open response
 * has is a typed name: the director needs to see "3 of these already exist"
 * and "this one will be new" while they can still stop.
 *
 * Groups are picked here rather than derived from the form. The college
 * cohort joins Symphony and College Chamber, and next term the same cohort
 * needs a theory section — the ids that answers that are NWSA's, not this
 * component's (org config, #white-label), so the director ticks them.
 */
export function SignupRosterIntake({
  responses, students, ensembles, onAddStudent, onUpdateStudent, onSetStatus,
}: {
  /** The responses to import — normally the latest per person, minus withdrawn. */
  responses: SignupResponse[];
  students: Student[];
  ensembles: Ensemble[];
  onAddStudent: (data: Omit<Student, 'id'>) => Promise<string | undefined>;
  onUpdateStudent: (id: string, data: Partial<Omit<Student, 'id'>>) => Promise<void>;
  onSetStatus: (id: string, status: SignupResponse['status']) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [grade, setGrade] = useState(COLLEGE_GRADE);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState('');

  const groups = useMemo(() => [
    ...performingEnsembles(ensembles),
    ...classGroups(ensembles),
  ], [ensembles]);

  const rows = useMemo(
    () => planRosterIntake(responses, students, { ensembleIds: picked, grade: grade.trim() || COLLEGE_GRADE }),
    [responses, students, picked, grade],
  );
  const counts = intakeSummary(rows);
  const nothingToDo = counts.create === 0 && counts.update === 0;

  function toggle(id: string) {
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  }

  async function run() {
    if (running || nothingToDo) return;
    const label = `${counts.create ? `add ${counts.create}` : ''}${counts.create && counts.update ? ' and ' : ''}${counts.update ? `update ${counts.update}` : ''}`;
    if (!window.confirm(`This will ${label} student record${counts.create + counts.update === 1 ? '' : 's'}. Go ahead?`)) return;
    setRunning(true);
    setDone('');
    let added = 0;
    let changed = 0;
    try {
      // One at a time, deliberately: each write goes through useStudents so
      // the studentsPublic mirror is batched with the source doc (#privacy),
      // and a failure part-way leaves the rows it already wrote intact — the
      // plan is idempotent, so the fix is to run it again.
      for (const row of rows) {
        if (row.action === 'create') {
          const id = await onAddStudent(row.fields as Omit<Student, 'id'>);
          if (id) added += 1;
        } else if (row.action === 'update' && row.match) {
          await onUpdateStudent(row.match.id, row.fields);
          changed += 1;
        }
        // The response is now in the system — the tick the director used to
        // set by hand after typing the name.
        if (row.action !== 'same' && row.response.status === 'submitted') {
          await onSetStatus(row.response.id, 'entered');
        }
      }
      setDone(`${added} added, ${changed} updated.`);
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
          <span>Turn these {responses.length} response{responses.length === 1 ? '' : 's'} into roster students.</span>
          <button className="dir-tool-btn" onClick={() => setOpen(true)}>
            <UserPlus size={15} /> Set this up
          </button>
        </div>
      )}

      {open && (
        <div className="dir-signup-intake">
          <div className="dir-signup-help">
            Everyone imported joins the groups you tick below and keeps every group they are already in.
          </div>

          <div className="dir-signup-intake-groups" role="group" aria-label="Groups these students join">
            {groups.map(e => (
              <label key={e.id} className={`dir-signup-intake-chip${picked.includes(e.id) ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={picked.includes(e.id)}
                  onChange={() => toggle(e.id)}
                />
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

          <IntakePreview rows={rows} />

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
        </div>
      )}
    </>
  );
}

/** The plan, row by row. This is the whole safety story for a name-matched
 *  import, so it says what will happen to each person in words. */
function IntakePreview({ rows }: { rows: IntakeRow[] }) {
  return (
    <div className="dir-signup-intake-plan">
      {rows.map(row => (
        <div key={row.response.id} className={`dir-signup-intake-row ${row.action}`}>
          <span className="who">{row.fields.name ?? row.match?.name ?? row.response.studentName}</span>
          <span className="what">
            {row.action === 'create' && 'New student'}
            {row.action === 'update' && `Already on the roster — ${describeUpdate(row)}`}
            {row.action === 'same' && 'Already has all of this'}
          </span>
          {row.action === 'update' && (
            <span className="dir-signup-intake-note">
              <AlertTriangle size={12} aria-hidden /> matched by name
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function describeUpdate(row: IntakeRow): string {
  const bits: string[] = [];
  if (row.addedEnsembleIds.length) bits.push(`joins ${row.addedEnsembleIds.length} group${row.addedEnsembleIds.length === 1 ? '' : 's'}`);
  if (row.fields.grade) bits.push(`grade → ${row.fields.grade}`);
  if (row.fields.instrument) bits.push(`instrument → ${row.fields.instrument}`);
  return bits.join(', ');
}
