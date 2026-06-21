import { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router';
import { Home, CalendarDays, Users, UserSearch, Menu, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays, end: false },
  { to: '/ensembles', label: 'Ensembles', Icon: Users, end: false },
  { to: '/lookup', label: 'My Schedule', Icon: UserSearch, end: false },
];

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="pub-app">
      <header className="pub-header">
        <Link to="/" className="pub-brand">
          <span className="pub-brand-mark">♪</span>
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
