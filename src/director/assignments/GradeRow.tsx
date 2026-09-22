import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, FileText, Mail, Video } from 'lucide-react';
import {
  rubricChangedSince, rubricScores, scoresToPicks, tallyRubric,
  type RubricCriterion, type RubricScore,
} from '../examRubric';
import { formatClock, formatFileSize } from '../../shared/duration';
import type { AssignmentResult, AssignmentResultStatus, AssignmentSubmission, Student } from '../types';
import type { QuizSubmission } from '../../shared/quiz';

const STATUSES: AssignmentResultStatus[] = ['Pass', 'Fail', 'Exempt'];

export interface ConfirmArgs {
  score: string;
  rubric: RubricScore[];
  notes: string;
}

interface Props {
  student: Student;
  result?: AssignmentResult;
  /** The exam's rubric. Empty = plain scoring, the way it worked before. */
  criteria: RubricCriterion[];
  /** Every take this student sent, newest first. */
  takes: AssignmentSubmission[];
  /** This student's newest online-test submission, when the exam has one
   *  (#online-test). A written test has no video, so the row says what it is
   *  actually missing rather than "no video". */
  testSubmission?: QuizSubmission | null;
  /** What to call nothing-yet on THIS exam: "no video", "nothing submitted",
   *  or null on an exam that collects nothing in the app (graded in the room),
   *  where an accusing grey chip on every row is just noise. */
  noSubmissionLabel?: string | null;
  /** Text to show under a rubric line, keyed by line id: on an online test,
   *  the student's written answer, and under an auto-scored line the choices
   *  behind its number (#online-test). A video row passes none. Display only —
   *  nothing here is snapshotted onto the grade. */
  lineNotes?: Record<string, string>;
  /** Points a line starts at before anybody has scored it — the part of an
   *  online test the answer key grades on its own. Used ONLY while no grade is
   *  stored; the moment one is filed, that snapshot wins. */
  seedPicks?: Record<string, number>;
  /** Hand this student's grade to the director's own mail app (#grade-email).
   *  Absent when nobody on this student's record has an address, so the row
   *  offers nothing it cannot do. */
  gradeMail?: { href: string; overLong: boolean; body: string; to: string[] } | null;
  open: boolean;
  onToggle: () => void;
  saving: boolean;
  onConfirm: (args: ConfirmArgs) => Promise<void>;
  onStatus: (status: AssignmentResultStatus) => Promise<void>;
  onScore: (raw: string) => Promise<void>;
  onSetReviewed: (sub: AssignmentSubmission, reviewed: boolean) => Promise<void>;
  onDeleteTake: (sub: AssignmentSubmission) => Promise<void>;
}

const shortTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * One student, one line (#exam-rubric). This used to be two: a roster row
 * that said "Submitted" and, further down the page, a second list of the same
 * people's videos carrying everything you actually needed. Reading a name
 * twice to grade it once is the thing this replaces — the row IS the video,
 * and opening it grades in place while the video plays beside the rubric.
 */
export function GradeRow({
  student, result, criteria, takes, testSubmission, noSubmissionLabel, lineNotes, seedPicks,
  gradeMail, open, onToggle, saving, onConfirm, onStatus, onScore, onSetReviewed, onDeleteTake,
}: Props) {
  const [copiedMail, setCopiedMail] = useState(false);
  const status: AssignmentResultStatus = result?.status ?? 'Pending';
  const newest = takes[0];

  // The draft lives against the STORED grade: it survives collapsing the row
  // (the component stays mounted) and is discarded the moment the stored
  // grade changes underneath it — your own Confirm landing, or a second
  // grader on the same exam. No effect, no stale-state window.
  const storedKey = `${result?.id ?? ''}|${(result?.rubric ?? []).map(s => `${s.id}=${s.points}`).join(',')}|${result?.notes ?? ''}`;
  const [draft, setDraft] = useState<{ key: string; picks: Record<string, number>; notes: string } | null>(null);
  const live = draft && draft.key === storedKey;
  // An ungraded row starts from whatever is already known — on an online test,
  // the part the answer key scored. A row that has a filed grade starts from
  // that grade instead, so re-opening it shows what was actually given rather
  // than quietly re-seeding over it.
  const picks = live ? draft.picks
    : result?.rubric ? scoresToPicks(result.rubric)
    : { ...(seedPicks ?? {}) };
  const notes = live ? draft.notes : (result?.notes ?? '');
  const edit = (next: Partial<{ picks: Record<string, number>; notes: string }>) =>
    setDraft({ key: storedKey, picks, notes, ...next });

  const [takeId, setTakeId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const showing = takes.find(t => t.id === takeId) ?? newest;

  const hasRubric = criteria.length > 0;
  const tally = tallyRubric(criteria, picks);
  const scores = hasRubric ? rubricScores(criteria, picks) : null;
  const changed = rubricChangedSince(result?.rubric, criteria);
  // The answer key moved after this grade was filed — set which excerpt was
  // actually played, and the part the key scores comes to a different number
  // than the one on this student's record. A filed snapshot is never rewritten
  // underneath a director, so the row has to say so or the old number just
  // sits there looking right.
  const autoStale = !!result?.rubric && !!seedPicks
    && result.rubric.some(s => s.id in seedPicks && s.points !== seedPicks[s.id]);
  const dirty = !!live && !!result?.rubric
    && (result.rubric.length !== tally.of || result.rubric.some(s => picks[s.id] !== s.points));

  async function confirm() {
    if (!scores) return;
    await onConfirm({ score: String(tally.percent), rubric: scores, notes });
    setDraft(null);
  }

  return (
    <div className={`dir-grade-row dir-assign-row-${status.toLowerCase()} ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="dir-grade-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="dir-grade-caret">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="dir-grade-who">
          <span className="dir-assign-name">{student.name}</span>
          <span className="dir-assign-instr">
            {student.instrument}
            {newest ? (
              <>
                {' · '}
                <span className="dir-grade-sub-inline">
                  <Video size={11} /> {shortDate(newest.submittedAt)}
                  {newest.videoDurationSeconds > 0 && <> · {formatClock(newest.videoDurationSeconds)}</>}
                  {takes.length > 1 && <> · {takes.length} takes</>}
                  {newest.status === 'reviewed' && <> · watched</>}
                </span>
              </>
            ) : testSubmission ? (
              <>
                {' · '}
                <span className="dir-grade-sub-inline">
                  <FileText size={11} /> test sent {shortTime(testSubmission.submittedAt)}
                </span>
              </>
            ) : noSubmissionLabel ? (
              <> · <span className="dir-grade-nosub">{noSubmissionLabel}</span></>
            ) : null}
          </span>
        </span>
        <span className="dir-grade-mark">
          {result?.score ? (
            <span className={`dir-grade-score dir-grade-score-${status.toLowerCase()}`}>{result.score}</span>
          ) : status !== 'Pending' ? (
            <span className={`dir-grade-score dir-grade-score-${status.toLowerCase()}`}>{status}</span>
          ) : (
            <span className="dir-grade-score dir-grade-score-pending">–</span>
          )}
        </span>
      </button>

      {open && (
        <div className="dir-grade-body">
          {showing && (
            <div className="dir-grade-video-wrap">
              {/* Only the OPEN row renders a <video> at all — that is the
                  guard that keeps a roster of 500 MB playing-exam videos from
                  downloading because a page rendered, and it must not change.
                  `preload` is a separate question, and "none" was the wrong
                  answer: the element then sits at readyState 0 with duration
                  NaN, so the player is a dead black rectangle reading 0:00
                  with no total time and no first frame. It reads as broken,
                  and directors went back to opening the link. "metadata"
                  fetches the header and stops — measured at ~7 MB of a 40 MB
                  file, bounded by the browser's own forward buffer — which
                  buys a real duration, a scrubbable timeline and a poster
                  frame on a row the director deliberately opened. */}
              <video
                key={showing.id}
                className="dir-grade-video"
                src={showing.videoUrl}
                poster={showing.videoThumbnailUrl}
                controls
                preload="metadata"
                playsInline
              />
              {takes.length > 1 && (
                <div className="dir-grade-takes">
                  {takes.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`dir-tool-btn ${t.id === showing.id ? 'dir-grade-take-on' : ''}`}
                      onClick={() => setTakeId(t.id)}
                    >
                      {i === 0 ? 'Latest' : `Take ${takes.length - i}`} · {shortDate(t.submittedAt)}
                    </button>
                  ))}
                </div>
              )}
              {/* Every take's note, not just the one currently playing — a
                  student's "sorry, background noise, this is my good one" on
                  take 1 is exactly what a director needs BEFORE picking which
                  take to watch, not after switching to it. */}
              {takes.length > 1 && takes.some(t => t.notes) && (
                <div className="dir-grade-take-notes">
                  {takes.map((t, i) => t.notes && (
                    <div key={t.id} className="dir-grade-take-note">
                      <strong>{i === 0 ? 'Latest' : `Take ${takes.length - i}`}:</strong> "{t.notes}"
                    </div>
                  ))}
                </div>
              )}
              <div className="dir-grade-video-meta">
                Sent {longDate(showing.submittedAt)} · {formatFileSize(showing.fileSize)}
                {showing.videoDurationSeconds > 0 && <> · {formatClock(showing.videoDurationSeconds)}</>}
              </div>
              {showing.notes && <div className="dir-submission-notes">“{showing.notes}”</div>}
            </div>
          )}

          {hasRubric && (
            <div className="dir-rubric">
              {changed && !dirty && (
                <div className="dir-rubric-stale">
                  Graded on an earlier version of this rubric. The score below is what was filed;
                  re-score to move it onto the current one.
                </div>
              )}
              {autoStale && !dirty && (
                <div className="dir-rubric-stale">
                  The answer key changed after this was graded — the scored part now comes to a
                  different number. The grade below is what was filed; re-score to bring it up to date.
                </div>
              )}
              <div className="dir-rubric-lines">
                {criteria.map(c => {
                  const picked = picks[c.id];
                  // On an online test this is the student's own writing, sitting
                  // under the question it answers and above the box it is marked
                  // in. The grade sheet used to make you read a name in the
                  // roster and find it again in a list further down to see what
                  // they wrote — the same two-lists-of-one-person problem the
                  // video row already fixed (#exam-rubric).
                  const note = lineNotes?.[c.id];
                  return (
                    <label key={c.id} className={`dir-rubric-line ${note ? 'has-note' : ''}`}>
                      <span className="dir-rubric-line-label">
                        {c.label}
                        <span className="dir-rubric-line-max"> / {c.max}</span>
                      </span>
                      {note && <span className="dir-rubric-line-note">{note}</span>}
                      <select
                        className="dir-select dir-rubric-pick"
                        value={picked === undefined ? '' : String(picked)}
                        disabled={saving}
                        onChange={e => {
                          const next = { ...picks };
                          if (e.target.value === '') delete next[c.id];
                          else next[c.id] = Number(e.target.value);
                          edit({ picks: next });
                        }}
                      >
                        {/* Blank first, then high to low: most students land
                            near the top of a line, so the common answer is one
                            flick away instead of twenty-five. */}
                        <option value="">—</option>
                        {Array.from({ length: c.max + 1 }, (_, i) => c.max - i).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>

              <div className="dir-rubric-foot">
                <button
                  type="button"
                  className="dir-tool-btn"
                  disabled={saving}
                  onClick={() => edit({
                    picks: Object.fromEntries(criteria.map(c => [c.id, c.max])),
                  })}
                >
                  Full marks
                </button>
                <button
                  type="button"
                  className="dir-tool-btn"
                  disabled={saving || tally.scored === 0}
                  onClick={() => edit({ picks: {} })}
                >
                  Clear
                </button>
                <span className="dir-rubric-running">
                  {/* An untouched rubric reads "— / 100", never "0 / 100".
                      A zero on the screen next to a student's name is a grade
                      somebody gave, and nobody has given one yet. */}
                  <strong>{tally.scored === 0 ? '—' : tally.points}</strong> / {tally.max}
                  {tally.complete && tally.max !== 100 && <> · {tally.percent}%</>}
                </span>
                <button
                  type="button"
                  className="dir-btn dir-btn-primary dir-rubric-confirm"
                  disabled={!scores || saving}
                  onClick={() => { void confirm(); }}
                >
                  {saving ? 'Saving…'
                    : scores ? <><Check size={14} /> Confirm {tally.percent}</>
                    : `${tally.scored} of ${tally.of} scored`}
                </button>
              </div>
            </div>
          )}

          {!hasRubric && (
            <div className="dir-grade-plain">
              <label className="dir-label" htmlFor={`score-${student.id}`}>Score</label>
              <input
                id={`score-${student.id}`}
                className="dir-assign-score"
                type="text"
                inputMode="decimal"
                placeholder="#"
                key={`${student.id}-${result?.score ?? ''}`}
                defaultValue={result?.score ?? ''}
                disabled={saving}
                onBlur={e => { void onScore(e.target.value.trim()); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          )}

          <div className="dir-grade-actions">
            <div className="dir-assign-btns">
              {STATUSES.map(st => (
                <button
                  key={st}
                  type="button"
                  className={`dir-assign-btn dir-assign-btn-${st.toLowerCase()} ${status === st ? 'active' : ''}`}
                  disabled={saving}
                  onClick={() => { void onStatus(st); }}
                >
                  {st}
                </button>
              ))}
            </div>
            {/* Emailing a grade is a PRESS and never a side effect of saving
                one — same rule the lesson log keeps. The Hub fills in the
                director's own mail window; it does not send. */}
            {gradeMail && (
              <span className="dir-grade-mail">
                <a
                  className="dir-tool-btn"
                  href={gradeMail.href}
                  title={`To: ${gradeMail.to.join(', ')}`}
                >
                  <Mail size={14} /> Email grade
                </a>
                {gradeMail.overLong && (
                  <button
                    type="button"
                    className="dir-tool-btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(gradeMail.body);
                        setCopiedMail(true);
                        setTimeout(() => setCopiedMail(false), 1800);
                      } catch { /* clipboard unavailable; the mail link still works */ }
                    }}
                  >
                    {copiedMail ? 'Copied' : 'Copy text'}
                  </button>
                )}
                {gradeMail.overLong && (
                  <span className="dir-grade-mail-warn">
                    Long for a mail link — if the window opens empty, paste instead.
                  </span>
                )}
              </span>
            )}
            <input
              className="dir-input dir-grade-note"
              value={notes}
              placeholder="Comment for your records (staff only)"
              maxLength={300}
              disabled={saving}
              onChange={e => edit({ notes: e.target.value })}
              onBlur={() => {
                // Saved with Confirm on a rubric exam; on a plain one there is
                // no Confirm, so the comment files itself when you leave it.
                if (!hasRubric && notes !== (result?.notes ?? '')) {
                  void onConfirm({ score: result?.score ?? '', rubric: [], notes });
                }
              }}
            />
          </div>

          {showing && (
            <div className="dir-grade-sub-actions">
              <button
                type="button"
                className={`dir-tool-btn ${showing.status === 'reviewed' ? 'dir-submission-reviewed' : ''}`}
                onClick={() => { void onSetReviewed(showing, showing.status !== 'reviewed'); }}
              >
                {showing.status === 'reviewed' ? '✓ Watched' : 'Mark watched'}
              </button>
              <a className="dir-tool-btn" href={showing.videoUrl} target="_blank" rel="noreferrer">
                Open video ↗
              </a>
              {/* Removing a wrong take deletes the video itself, so a student's
                  recording never lingers at its public Storage URL. */}
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    className="dir-tool-btn dir-grade-danger"
                    onClick={async () => { await onDeleteTake(showing); setConfirmDelete(false); setTakeId(''); }}
                  >
                    Confirm delete
                  </button>
                  <button type="button" className="dir-tool-btn" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="dir-tool-btn" onClick={() => setConfirmDelete(true)}>
                  Delete this take
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
