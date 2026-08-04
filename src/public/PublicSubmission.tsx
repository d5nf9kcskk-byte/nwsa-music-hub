import { useParams, Link } from 'react-router';
import { ArrowLeft, Video } from 'lucide-react';
import { useAssignments } from '../director/hooks/useAssignments';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { SubmissionForm } from './components/SubmissionForm';
import { t, useLang } from '../shared/i18n';
import { isPublished } from '../director/utils';

export function PublicSubmission() {
  useLang();
  const { id } = useParams<{ id: string }>();
  const { assignments, loading: loadingAssignments } = useAssignments();
  const { students, loading: loadingStudents } = useStudentsPublic();

  const assignment = assignments.find(a => a.id === id);
  const loading = loadingAssignments || loadingStudents;

  if (loading) {
    return (
      <div className="pub-page">
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--pub-muted)' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="pub-page">
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h2>Assignment not found</h2>
          <p>
            <Link to="/assignments" style={{ color: 'var(--pub-link)' }}>
              <ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Back to assignments
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!assignment.acceptsVideoSubmissions) {
    return (
      <div className="pub-page">
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h2>Video submissions not enabled</h2>
          <p>This assignment doesn't accept video submissions through the app.</p>
          <p>
            <Link to="/assignments" style={{ color: 'var(--pub-link)' }}>
              <ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Back to assignments
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!isPublished(assignment, Date.now())) {
    return (
      <div className="pub-page">
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h2>Assignment not yet available</h2>
          <p>This assignment hasn't been published yet.</p>
          <p>
            <Link to="/assignments" style={{ color: 'var(--pub-link)' }}>
              <ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Back to assignments
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-page">
      <div style={{ padding: '0 0 16px' }}>
        <Link to="/assignments" style={{ fontSize: 14, color: 'var(--pub-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={14} /> {t('nav.assignmentsShort')}
        </Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
          <Video size={20} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          {assignment.title}
        </h1>
        <div style={{ fontSize: 14, color: 'var(--pub-muted)' }}>
          {assignment.type} · {t('cal.due')} {assignment.dueDate}
        </div>
      </div>

      <SubmissionForm
        assignment={assignment}
        students={students}
        onSubmitted={() => {}}
      />
    </div>
  );
}
