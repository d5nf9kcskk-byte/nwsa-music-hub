import './uiUpdates.css';
import { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router';
import { Home, CalendarDays, Users, Music, UserSearch, Megaphone, ClipboardCheck, Menu, X, ChevronDown, MoreHorizontal, UserCircle, Ticket, HelpCircle, Search } from 'lucide-react';
import { NavLink as RRNavLink } from 'react-router';
import { GlobalAlerts } from './components/GlobalAlerts';
import { SearchOverlay } from './components/SearchOverlay';
import { TextSizeControl } from './components/TextSize';
import { LABELS } from '../shared/labels';
import { primaryStudent, onIdentityChange } from '../shared/identity';
import { useEffect, useReducer } from 'react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { ensembleColor } from '../director/utils';

const NAV = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays, end: false },
  { to: '/concerts', label: LABELS.concerts, Icon: Ticket, end: false },
  { to: '/announcements', label: 'Announcements', Icon: Megaphone, end: false },
  { to: '/repertoire', label: 'Repertoire', Icon: Music, end: false },
  { to: '/assignments', label: 'Assignments', Icon: ClipboardCheck, end: false },
  { to: '/lookup', label: 'My Schedule', Icon: UserSearch, end: false },
  { to: '/start', label: LABELS.startHere, Icon: HelpCircle, end: false },
];

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const { ensembles } = useEnsembles();
  const [, bump] = useReducer(x => x + 1, 0);
  useEffect(() => onIdentityChange(bump), []);
  const me = primaryStudent();

  return (
    <div className="pub-app">
      <header className="pub-header">
        <Link to="/" className="pub-brand">
          <span className="pub-logo-chip">
            <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" className="pub-brand-mark" />
          </span>
          <span>NWSA Music</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TextSizeControl />
          <button className="pub-hamburger" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search size={20} />
          </button>
          <button
            className="pub-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="pub-menu-overlay" onClick={() => setMenuOpen(false)}>
          <nav className="pub-menu-panel" onClick={e => e.stopPropagation()}>
            <div className="pub-menu-header">
              <span className="pub-menu-title">NWSA Music</span>
              <button className="pub-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            {me && (
              <Link to="/lookup" className="pub-menu-item pub-menu-me" onClick={() => setMenuOpen(false)}>
                <UserCircle size={18} />
                <span style={{ flex: 1, minWidth: 0 }}>{me.name}</span>
                <span className="pub-menu-switch">Not you? Switch</span>
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
                  {label}
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
                      Ensembles
                      <ChevronDown size={15} style={{ marginLeft: 'auto', transform: ensemblesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                    </button>
                    {ensemblesOpen && (
                      <>
                        {[...ensembles].sort((a, b) => a.order - b.order).map(e => (
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
              Director login
            </Link>
          </nav>
        </div>
      )}

      <main className="pub-content">
        <GlobalAlerts />
        <Outlet />
      </main>

      {/* Thumb-reach bottom bar (#2): the three daily tasks + More */}
      <nav className="pub-tabbar" aria-label="Primary">
        <RRNavLink to="/" end className={({ isActive }) => `pub-tabbar-btn ${isActive ? 'active' : ''}`}>
          <Home size={20} /><span>Home</span>
        </RRNavLink>
        <RRNavLink to="/calendar" className={({ isActive }) => `pub-tabbar-btn ${isActive ? 'active' : ''}`}>
          <CalendarDays size={20} /><span>Calendar</span>
        </RRNavLink>
        <RRNavLink
          to={me ? `/student/${me.id}` : '/lookup'}
          className={({ isActive }) => `pub-tabbar-btn ${isActive ? 'active' : ''}`}
        >
          <UserSearch size={20} /><span>My Schedule</span>
        </RRNavLink>
        <button className="pub-tabbar-btn" onClick={() => setMenuOpen(true)}>
          <MoreHorizontal size={20} /><span>More</span>
        </button>
      </nav>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
