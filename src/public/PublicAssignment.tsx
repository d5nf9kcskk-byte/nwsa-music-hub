import { useEffect, useMemo } from 'react';
import { useParams, useLocation, Link } from 'react-router';
import { Calendar, ClipboardCheck, Download, ExternalLink, Music, Paperclip, Video } from 'lucide-react';
import { BackLink } from './components/BackLink';
import { SubmissionForm } from './components/SubmissionForm';
import { useAssignments } from '../director/hooks/useAssignments';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { assignmentEmoji, ensembleColor, ensembleDisplayName, isPublished } from '../director/utils';
import { RichText } from '../shared/richText';
import { t, useLang } from '../shared/i18n';
import { fmtShortDate } from '../shared/dates';
import { formatFileSize } from '../shared/duration';

/**
 * One assignment, on its own page (#assignment-page).
 *
 * Everything the student needs is here and in this order: what it is, when
 * it's due, the instructions with the formatting the director actually
 * typed, the music the excerpt comes from (open it, grab the part, come
 * back), any files, and the recorder — all on ONE page, so nobody has to
 * hold instructions in their head while a separate submit screen is open.
 */
export function PublicAssignment() {
  useLang();
  const { id = '' } = useParams();
  const location = useLocation();
  const { assignments, loading: loadingAssignments } = useAssignments();
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();
  const { students, loading: loadingStudents } = useStudentsPublic();
  const now = useMinuteTick(); // a scheduled assignment opens the minute it publishes

  const assignment = assignments.find(a => a.id === id);
  const loading = loadingAssignments || loadingStudents;
  // /assignments/:id/submit is the old submit URL (QR codes, links already
  // handed out) — same page, scrolled to the recorder.
  const wantsSubmit = location.pathname.endsWith('/submit');

  const linkedPieces = useMemo(
    () => (assignment?.pieceIds ?? []).map(pid => pieces.find(p => p.id === pid)).filter(p => !!p),
    [assignment, pieces],
  );
  const mine = useMemo(
    () => (assignment?.ensembleIds ?? []).map(eid => ensembles.find(e => e.id === eid)).filter(e => !!e),
    [assignment, ensembles],
  );

  useEffect(() => {
    if (!wantsSubmit || loading || !assignment) return;
    document.getElementById('assign-submit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Keyed on the id, not the object: the assignments listener re-emits a
    // fresh object whenever ANY assignment is saved, which used to scroll a
    // reader back to the recorder mid-sentence. The body only uses
    // `assignment` as a presence check, which the id already covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsSubmit, loading, assignment?.id]);

  if (!assignment) {
    return (
      <div className="pub-page">
        <BackLink fallback="/assignments" label={t('nav.assignmentsShort')} />
        <div className="pub-card pub-muted">
          {loading ? t('misc.loading') : t('assign.notFound')}
        </div>
      </div>
    );
  }

  // A scheduled assignment is not public until its moment arrives — the same
  // rule the list applies, enforced here too so a guessed URL can't jump it.
  if (!isPublished(assignment, now)) {
    return (
      <div className="pub-page">
        <BackLink fallback="/assignments" label={t('nav.assignmentsShort')} />
        <div className="pub-card pub-muted">{t('assign.notYet')}</div>
      </div>
    );
  }

  const description = assignment.description;
  const attachments = assignment.attachments ?? [];

  return (
    <div className="pub-page">
      <BackLink fallback="/assignments" label={t('nav.assignmentsShort')} />

      <header className="pub-assign-hero">
        <span className="pub-assign-hero-emoji" aria-hidden="true">{assignmentEmoji(assignment.type)}</span>
        <h1 className="pub-assign-hero-title">{assignment.title}</h1>
        <div className="pub-assign-hero-meta">
          <span className="pub-assign-type">{assignment.type}</span>
          <span className="pub-assign-hero-due">
            <Calendar size={13} /> {t('cal.due')} {fmtShortDate(assignment.dueDate)}
          </span>
        </div>
        {mine.length > 0 && (
          <div className="pub-assign-hero-ens">
            {mine.map(e => (
              <Link
                key={e.id}
                to={`/ensemble/${e.id}`}
                className="pub-assign-ens-chip"
                style={{ borderColor: ensembleColor(e), color: ensembleColor(e) }}
              >
                {ensembleDisplayName(e)}
              </Link>
            ))}
          </div>
        )}
      </header>

      {description && (
        <section className="pub-card pub-assign-section">
          <h2 className="pub-assign-section-title">
            <ClipboardCheck size={15} /> {t('assign.instructions')}
          </h2>
          <RichText text={description} className="pub-assign-body" />
        </section>
      )}

      {/* The music this is on. One tap to the piece, where the parts live. */}
      {linkedPieces.length > 0 && (
        <section className="pub-card pub-assign-section">
          <h2 className="pub-assign-section-title">
            <Music size={15} /> {t('assign.music')}
          </h2>
          <p className="pub-assign-section-hint">{t('assign.musicHint')}</p>
          {linkedPieces.map(p => (
            <Link key={p.id} to={`/piece/${p.id}`} className="pub-assign-piece">
              <span className="pub-assign-piece-body">
                <span className="pub-assign-piece-title">{p.title}</span>
                {(p.composer || p.arranger) && (
                  <span className="pub-assign-piece-sub">
                    {p.composer}
                    {p.arranger ? `${p.composer ? ' · ' : ''}arr. ${p.arranger}` : ''}
                  </span>
                )}
              </span>
              <span className="pub-assign-piece-go">{t('assign.getPart')} <ExternalLink size={12} /></span>
            </Link>
          ))}
        </section>
      )}

      {attachments.length > 0 && (
        <section className="pub-card pub-assign-section">
          <h2 className="pub-assign-section-title">
            <Paperclip size={15} /> {t('assign.files')}
          </h2>
          {attachments.map(f => (
            <a key={f.url} className="pub-assign-file" href={f.url} target="_blank" rel="noreferrer">
              <Download size={14} />
              <span className="pub-assign-file-name">{f.name}</span>
              {f.size > 0 && <span className="pub-assign-file-size">{formatFileSize(f.size)}</span>}
            </a>
          ))}
        </section>
      )}

      {assignment.formUrl && (
        <a className="pub-assign-form-btn" href={assignment.formUrl} target="_blank" rel="noreferrer">
          📝 {t('misc.openExamForm')}
        </a>
      )}

      {assignment.acceptsVideoSubmissions && (
        <section className="pub-card pub-assign-section" id="assign-submit">
          <h2 className="pub-assign-section-title">
            <Video size={15} /> {t('vid.submit')}
          </h2>
          {/* The section itself always renders — it is the #assign-submit
              scroll target — but the form waits for the roster, or it would
              briefly claim nobody is assigned to the exam. */}
          {loadingStudents
            ? <div className="pub-muted" style={{ padding: '8px 0' }}>{t('misc.loading')}</div>
            : <SubmissionForm assignment={assignment} students={students} onSubmitted={() => {}} />}
        </section>
      )}
    </div>
  );
}
