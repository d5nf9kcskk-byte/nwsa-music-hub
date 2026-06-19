import { Outlet, NavLink, Link } from 'react-router';
import { Home, CalendarDays, Users, UserSearch } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays, end: false },
  { to: '/ensembles', label: 'Ensembles', Icon: Users, end: false },
  { to: '/lookup', label: 'My Schedule', Icon: UserSearch, end: false },
];

export function PublicLayout() {
  return (
    <div className="pub-app">
      <header className="pub-header">
        <Link to="/" className="pub-brand">
          <span className="pub-brand-mark">♪</span>
          <span>NWSA Music</span>
        </Link>
        <Link to="/director" className="pub-director-link">Director</Link>
      </header>

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
