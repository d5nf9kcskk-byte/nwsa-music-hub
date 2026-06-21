import { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router';
import { Home, CalendarDays, Users, UserSearch, Menu, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays, end: false },
  { to: '/ensembles', label: 'Ensembles', Icon: Users, end: false },
  { to: '/lookup', label: 'My Schedule', Icon: UserSearch, end: false },
];

function NwsaLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      {/* Blue mountain */}
      <polygon points="20,2 37,36 3,36" fill="#1a56a8"/>
      {/* White inner triangle */}
      <polygon points="20,10 30,36 10,36" fill="white"/>
      {/* Yellow peak accent */}
      <polygon points="20,2 24,14 16,14" fill="#facc15"/>
      {/* Purple wave at base */}
      <path d="M3,34 Q11.5,29.5 20,34 Q28.5,38.5 37,34" stroke="#7c3aed" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="pub-app">
      <header className="pub-header">
        <Link to="/" className="pub-brand">
          <NwsaLogo />
          <span>NWSA Music</span>
        </Link>
        <button
          className="pub-hamburger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
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
            {NAV.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `pub-menu-item ${isActive ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
            <div className="pub-menu-divider" />
            <Link to="/director" className="pub-menu-item pub-menu-director" onClick={() => setMenuOpen(false)}>
              Director login
            </Link>
          </nav>
        </div>
      )}

      <main className="pub-content">
        <Outlet />
      </main>

      <nav className="pub-nav">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `pub-nav-btn ${isActive ? 'active' : ''}`}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
