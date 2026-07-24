import './uiUpdates.css';
import './pubShell.css';
import { useState } from 'react';
import { Outlet, NavLink, Link, ScrollRestoration } from 'react-router';
import { Home, CalendarDays, Users, Music, UserSearch, Megaphone, ClipboardCheck, Menu, X, ChevronDown, UserCircle, Ticket, HelpCircle, Search, MapPinned, FolderOpen } from 'lucide-react';
import { NavLink as RRNavLink } from 'react-router';
import { GlobalAlerts } from './components/GlobalAlerts';
import { StatusStrips } from '../shared/StatusStrips';
import { SearchOverlay } from './components/SearchOverlay';
import { TextSizeControl } from './components/TextSize';
import { t, useLang } from '../shared/i18n';
import { LangToggle } from './components/LangToggle';
import { NoteBurst } from '../shared/NoteBurst';
import { useLogoEgg } from '../shared/useLogoEgg';
import { primaryStudent, onIdentityChange } from '../shared/identity';
import { useModalA11y } from '../shared/useModalA11y';
import { useEffect, useReducer } from 'react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { ensembleColor, musicEnsembles } from '../director/utils';

const NAV = [
  { to: '/', label: 'nav.home', Icon: Home, end: true },
  { to: '/calendar', label: 'nav.calendar', Icon: CalendarDays, end: false },
  { to: '/concerts', label: 'nav.concerts', Icon: Ticket, end: false },
  { to: '/announcements', label: 'nav.announcements', Icon: Megaphone, end: false },
  { to: '/repertoire', label: 'nav.repertoire', Icon: Music, end: false },
  { to: '/assignments', label: 'nav.assignmentsShort', Icon: ClipboardCheck, end: false },
  { to: '/documents', label: 'nav.documents', Icon: FolderOpen, end: false },
  { to: '/lookup', label: 'nav.mySchedule', Icon: UserSearch, end: false },
  { to: '/map', label: 'nav.campusMap', Icon: MapPinned, end: false },
  { to: '/start', label: 'nav.startHere', Icon: HelpCircle, end: false },
];

export function PublicLayout() {
  useLang(); // re-render on EN/ES switch (#42)
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const { ensembles } = useEnsembles();
  const [, bump] = useReducer(x => x + 1, 0);
  const menuRef = useModalA11y<HTMLElement>(() => setMenuOpen(false), menuOpen);
  useEffect(() => onIdentityChange(bump), []);
  const me = primaryStudent();
  // Hidden delight (#easter-eggs): five quick taps on the logo → note burst.
  const { cheer, onLogoTap } = useLogoEgg();

  return (
    <div className="pub-app">
      <header className="pub-header">
        <Link to="/" className="pub-brand" onClick={onLogoTap}>
          <span className="pub-logo-chip">
            <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" className="pub-brand-mark" />
          </span>
          <span>NWSA Music</span>
        </Link>
        <button className="pub-header-search no-print" onClick={() => setSearchOpen(true)} aria-label={t('nav.search')}>
          <Search size={15} />
          <span>{t('nav.searchPlaceholder')}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LangToggle />
          <TextSizeControl />
          <button className="pub-hamburger" onClick={() => setSearchOpen(true)} aria-label={t('nav.search')}>
            <Search size={20} />
          </button>
          <button
            className="pub-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={t('nav.menu')}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="pub-menu-overlay" onClick={() => setMenuOpen(false)}>
          <nav className="pub-menu-panel" role="dialog" aria-modal="true" aria-label={t('nav.menu')} tabIndex={-1} ref={menuRef} onClick={e => e.stopPropagation()}>
            <div className="pub-menu-header">
              <span className="pub-menu-title">NWSA Music</span>
              <button className="pub-menu-close" onClick={() => setMenuOpen(false)} aria-label={t('nav.closeMenu')}>
                <X size={20} />
              </button>
            </div>
            {me && (
              <Link to="/lookup" className="pub-menu-item pub-menu-me" onClick={() => setMenuOpen(false)}>
                <UserCircle size={18} />
                <span style={{ flex: 1, minWidth: 0 }}>{me.name}</span>
                <span className="pub-menu-switch">{t('nav.notYouSwitch')}</span>
              </Link>
            )}
            {NAV.map(({ to, label, Icon, end }) => (
              <div key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => `pub-menu-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={18} />
                  {t(label)}
                </NavLink>
                {/* Ensembles drop-down lives right after Calendar */}
                {to === '/calendar' && (
                  <>
                    <button
                      className="pub-menu-item pub-menu-expand"
                      onClick={() => setEnsemblesOpen(o => !o)}
                      aria-expanded={ensemblesOpen}
                    >
                      <Users size={18} />
                      {t('nav.ensembles')}
                      <ChevronDown size={15} style={{ marginLeft: 'auto', transform: ensemblesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                    </button>
                    {ensemblesOpen && (
                      <>
                        {musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).map(e => (
                          <NavLink
                            key={e.id}
                            to={`/ensemble/${e.id}`}
                            className={({ isActive }) => `pub-menu-item pub-menu-subitem ${isActive ? 'active' : ''}`}
                            onClick={() => setMenuOpen(false)}
                          >
                            <span className="pub-menu-dot" style={{ background: ensembleColor(e) }} />
                            {e.name}
                          </NavLink>
                        ))}
                        <NavLink
                          to="/ensembles"
                          className={({ isActive }) => `pub-menu-item pub-menu-subitem ${isActive ? 'active' : ''}`}
                          onClick={() => setMenuOpen(false)}
                        >
                          <span className="pub-menu-dot" style={{ background: '#94a3b8' }} />
                          All ensembles
                        </NavLink>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
            <div className="pub-menu-divider" />
            <Link to="/director" className="pub-menu-item pub-menu-director" onClick={() => setMenuOpen(false)}>
              {t('nav.directorLogin')}
            </Link>
            <Link to="/assistant" className="pub-menu-item pub-menu-director" onClick={() => setMenuOpen(false)}>
              {t('nav.assistantLogin')}
            </Link>
          </nav>
        </div>
      )}

      {/* Desktop shell (≥1024px): sidebar + content grid. On phones the
          wrapper is display:contents, so mobile layout is untouched. */}
      <div className="pub-shell">
        <aside className="pub-sidebar no-print">
          <nav aria-label={t('nav.menu')} style={{ display: 'contents' }}>
            <NavLink to="/" end className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <Home size={18} />{t('nav.home')}
            </NavLink>
            <NavLink to="/calendar" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <CalendarDays size={18} />{t('nav.calendar')}
            </NavLink>
            <NavLink to={me ? `/student/${me.id}` : '/lookup'} className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <UserSearch size={18} />{t('nav.mySchedule')}
            </NavLink>
            <NavLink to="/concerts" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <Ticket size={18} />{t('nav.concertsShort')}
            </NavLink>
            <NavLink to="/ensembles" end className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <Users size={18} />{t('nav.ensembles')}
            </NavLink>

            {ensembles.length > 0 && <div className="pub-side-head">{t('nav.ensembles')}</div>}
            {musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).map(e => (
              <NavLink
                key={e.id}
                to={`/ensemble/${e.id}`}
                className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}
              >
                <span className="pub-side-dot" style={{ background: ensembleColor(e) }} />
                {e.name}
              </NavLink>
            ))}

            <div className="pub-side-head">{t('nav.resources')}</div>
            <NavLink to="/announcements" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <Megaphone size={18} />{t('nav.announcements')}
            </NavLink>
            <NavLink to="/repertoire" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <Music size={18} />{t('nav.repertoire')}
            </NavLink>
            <NavLink to="/assignments" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <ClipboardCheck size={18} />{t('nav.assignmentsShort')}
            </NavLink>
            <NavLink to="/documents" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <FolderOpen size={18} />{t('nav.documents')}
            </NavLink>
            <NavLink to="/map" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <MapPinned size={18} />{t('nav.campusMap')}
            </NavLink>
            <NavLink to="/start" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <HelpCircle size={18} />{t('nav.startHere')}
            </NavLink>
          </nav>

          <div className="pub-side-bottom">
            {me && (
              <Link to="/lookup" className="pub-side-item pub-side-me">
                <UserCircle size={18} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</span>
                <span className="pub-side-switch">{t('nav.notYouSwitch')}</span>
              </Link>
            )}
            <Link to="/director" className="pub-side-item pub-side-director">
              {t('nav.directorLogin')}
            </Link>
            <Link to="/assistant" className="pub-side-item pub-side-director">
              {t('nav.assistantLogin')}
            </Link>
          </div>
        </aside>

        <main className="pub-content">
          <StatusStrips />
          <GlobalAlerts />
          <Outlet />
        </main>
      </div>

      {/* Thumb-reach bottom bar (#2): the three daily tasks + More */}
      <nav className="pub-tabbar" aria-label="Primary">
        <RRNavLink to="/" end className={({ isActive }) => `pub-tabbar-btn ${isActive ? 'active' : ''}`}>
          <Home size={20} /><span>{t('nav.home')}</span>
        </RRNavLink>
        <RRNavLink to="/calendar" className={({ isActive }) => `pub-tabbar-btn ${isActive ? 'active' : ''}`}>
          <CalendarDays size={20} /><span>{t('nav.calendar')}</span>
        </RRNavLink>
        <RRNavLink
          to={me ? `/student/${me.id}` : '/lookup'}
          className={({ isActive }) => `pub-tabbar-btn ${isActive ? 'active' : ''}`}
        >
          <UserSearch size={20} /><span>{t('nav.mySchedule')}</span>
        </RRNavLink>
        <RRNavLink to="/concerts" className={({ isActive }) => `pub-tabbar-btn ${isActive ? 'active' : ''}`}>
          <Ticket size={20} /><span>{t('nav.concertsShort')}</span>
        </RRNavLink>
      </nav>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NoteBurst cheer={cheer} />
      {/* Reset/restore window scroll on route change (deep pages otherwise open mid-scroll) */}
      <ScrollRestoration />
    </div>
  );
}
