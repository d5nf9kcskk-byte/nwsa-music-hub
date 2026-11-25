import './membersGate.css';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
// Lazy chunk, personnel builds only: the school's public bundle never loads auth.
// eslint-disable-next-line no-restricted-imports
import { auth } from '../director/firebaseAuth';
import { t, useLang } from '../shared/i18n';
import { LangToggle } from './components/LangToggle';
import { ORG } from '../org';

/**
 * Members-only public site (#members-gate), personnel builds only: main.tsx
 * wraps the public layout in this when __ORG_PERSONNEL__. Signed out, the
 * world sees one front page — who the orchestra is and two sign-in doors.
 * Signed in, the usual pages. This is the curtain; the lock is the AISO
 * rules (scripts/gate-rules.mjs), which refuse the same data to anyone
 * without an honoured sign-in.
 */
export default function MembersGate({ children }: { children: ReactNode }) {
  useLang();
  const [user, setUser] = useState<User | null | undefined>(auth ? undefined : null);
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);

  if (user === undefined) return null; // auth still resolving: a blink, not the front page
  if (user) return <>{children}</>;

  return (
    <main className="mg-page">
      <div className="mg-lang"><LangToggle /></div>
      <section className="mg-card">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} alt={ORG.orgFullName} className="mg-logo" />
        <h1 className="mg-title">{t('gate.title')}</h1>
        <p className="mg-who">{t('gate.who', { name: ORG.orgFullName })}</p>
        <p className="mg-what">{t('gate.what')}</p>
        <div className="mg-doors">
          <Link to="/director?musician" className="mg-btn mg-btn-main">{t('nav.musicianLogin')}</Link>
          <Link to="/director" className="mg-btn">{t('gate.adminLogin')}</Link>
        </div>
        <p className="mg-contact">
          {t('gate.contact')} <a href={`mailto:${ORG.contactEmail}`}>{ORG.contactEmail}</a>
        </p>
      </section>
    </main>
  );
}
