import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { UserCircle, Smartphone } from 'lucide-react';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { t, useLang } from '../shared/i18n';
import { PageHeader } from './components/PageHeader';
import { addStudents, getIdentity, type SavedStudent } from '../shared/identity';
import { parseTransferIds, TRANSFER_PARAM } from '../shared/deviceTransfer';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';
import type { Student } from '../director/types';

/**
 * The receiving end of "Send to my other phone" (/add-students?ids=a,b).
 *
 * Nothing is saved until the person taps Save: a forwarded link must never
 * rewrite a stranger's phone on its own. Names come from studentsPublic only
 * (never the staff-only `students`); an id with no public record is dropped,
 * never shown raw. Saving MERGES with whoever is already on this phone
 * (addStudents), then lands on Home.
 */
export function PublicAddStudents() {
  useLang();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { students, loading } = useStudentsPublic();

  const ids = useMemo(() => parseTransferIds(params.get(TRANSFER_PARAM)), [params]);
  const byId = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const found = ids
    .map(id => byId.get(id))
    .filter((s): s is Student => !!s && s.status === 'Active');
  const savedIds = new Set(getIdentity().students.map(s => s.id));
  const fresh = found.filter(s => !savedIds.has(s.id));

  function save() {
    const incoming: SavedStudent[] = fresh.map(s => ({
      id: s.id, name: s.name, ensembleIds: s.ensembleIds ?? [], instrument: s.instrument,
    }));
    addStudents(incoming);
    navigate('/', { replace: true });
  }

  if (!PUBLIC_STUDENT_INFO) {
    return (
      <div className="pub-page">
        <PageHeader title={t('xfer.receiveTitle')} intro={t('lookup.rosterPending')} />
      </div>
    );
  }

  return (
    <div className="pub-page">
      <PageHeader title={t('xfer.receiveTitle')} />
      <div className="pub-card pub-xfer-receive">
        {loading ? (
          <div className="pub-muted">{t('xfer.loading')}</div>
        ) : found.length === 0 ? (
          <>
            <p className="pub-xfer-receive-lead">{t('xfer.noneFound')}</p>
            <div className="pub-confirm-actions">
              <Link to="/lookup" className="pub-confirm-no pub-xfer-linkbtn">{t('home.findMySchedule')}</Link>
              <Link to="/" className="pub-confirm-yes pub-xfer-linkbtn">{t('xfer.goHome')}</Link>
            </div>
          </>
        ) : (
          <>
            <div className="pub-xfer-receive-q"><Smartphone size={18} /> {t('xfer.question')}</div>
            <ul className="pub-xfer-list">
              {found.map(s => (
                <li key={s.id} className="pub-xfer-item">
                  <UserCircle size={18} />
                  <span className="pub-saved-name">{s.name}</span>
                  {s.instrument && <span className="pub-saved-instr">{s.instrument}</span>}
                  {savedIds.has(s.id) && <span className="pub-xfer-already">{t('xfer.already')}</span>}
                </li>
              ))}
            </ul>
            <p className="pub-muted pub-xfer-note">{t('xfer.keepsOthers')}</p>
            {fresh.length === 0 ? (
              <div className="pub-confirm-actions">
                <Link to="/" className="pub-confirm-yes pub-xfer-linkbtn">{t('xfer.goHome')}</Link>
              </div>
            ) : (
              <div className="pub-confirm-actions">
                <button type="button" className="pub-confirm-no" onClick={() => navigate('/', { replace: true })}>
                  {t('xfer.noThanks')}
                </button>
                <button type="button" className="pub-confirm-yes" onClick={save}>{t('xfer.save')}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
