import './uiUpdates.css';
import './pubShell.css';
import { useState, useEffect, useReducer } from 'react';
import { Outlet, NavLink, Link, ScrollRestoration, useLocation } from 'react-router';
import { Home, CalendarDays, Users, Music, UserSearch, Megaphone, ClipboardCheck, Menu, X, ChevronDown, UserCircle, Ticket, HelpCircle, Search, MapPinned, FolderOpen, Mail, ClipboardSignature } from 'lucide-react';
import { NavLink as RRNavLink } from 'react-router';
import { GlobalAlerts } from './components/GlobalAlerts';
import { StatusStrips } from '../shared/StatusStrips';
import { SearchOverlay } from './components/SearchOverlay';
import { TextSizeControl } from './components/TextSize';
import { ThemeToggle } from './components/ThemeToggle';
import { t, useLang } from '../shared/i18n';
import { LangToggle } from './components/LangToggle';
import { NoteBurst } from '../shared/NoteBurst';
import { useLogoEgg } from '../shared/useLogoEgg';
import { primaryStudent, onIdentityChange } from '../shared/identity';
import { useModalA11y } from '../shared/useModalA11y';
import { WhatsNewBanner } from '../shared/WhatsNewBanner';
import '../shared/whatsNew.css';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { ensembleColor, ensembleDisplayName, highSchoolEnsembles, highSchoolClasses, collegeEnsembles, collegeClasses } from '../director/utils';
import { ORG } from '../org';
import type { Ensemble } from '../director/types';

/** Staff sign-in links — always visible; access is decided after Google auth
 *  by the directors/{email} doc, not by whether the link is shown. */
const STAFF_LOGINS = [
  { to: '/director', label: 'nav.directorLogin' },
  { to: '/assistant', label: 'nav.assistantLogin' },
  { to: '/teacher', label: 'nav.teacherLogin' },
  { to: '/classroom', label: 'nav.classroomLogin' },
] as const;

/** Daily destinations — always visible in the hamburger (matches tab bar set + Ensembles). */
const NAV_TOP = [
  { to: '/', label: 'nav.home', Icon: Home, end: true },
  { to: '/calendar', label: 'nav.calendar', Icon: CalendarDays, end: false },
  { to: '/concerts', label: 'nav.concerts', Icon: Ticket, end: false },
  { to: '/lookup', label: 'nav.mySchedule', Icon: UserSearch, end: false },
];

const RESOURCE_PATHS = [
  '/announcements',
  '/repertoire',
  '/assignments',
  '/documents',
  '/signups',
  ...(ORG.features.campusMap ? ['/map'] : []),
  ...(ORG.features.contactForm ? ['/contact'] : []),
] as const;

const RESOURCES = [
  { to: '/announcements', label: 'nav.announcements', Icon: Megaphone },
  { to: '/repertoire', label: 'nav.repertoire', Icon: Music },
  { to: '/assignments', label: 'nav.assignmentsShort', Icon: ClipboardCheck },
  { to: '/documents', label: 'nav.documents', Icon: FolderOpen },
  { to: '/signups', label: 'nav.signups', Icon: ClipboardSignature },
  ...(ORG.features.campusMap ? [{ to: '/map', label: 'nav.campusMap', Icon: MapPinned }] : []),
  ...(ORG.features.contactForm ? [{ to: '/contact', label: 'nav.contact', Icon: Mail }] : []),
];

function pathInResources(pathname: string): boolean {
  return RESOURCE_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

function ensembleIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/ensemble\/([^/]+)/);
  return m ? m[1] : null;
}

function ExpandChevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      size={15}
      style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
    />
  );
}

function EnsembleSubLinks({
  items,
  onNavigate,
}: {
  items: Ensemble[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map(e => (
        <NavLink
          key={e.id}
          to={`/ensemble/${e.id}`}
          className={({ isActive }) => `pub-menu-item pub-menu-subitem ${isActive ? 'active' : ''}`}
          onClick={onNavigate}
        >
          <span className="pub-menu-dot" style={{ background: ensembleColor(e) }} />
          {ensembleDisplayName(e)}
        </NavLink>
      ))}
    </>
  );
}

function SideEnsembleLinks({ items }: { items: Ensemble[] }) {
  return (
    <>
      {items.map(e => (
        <NavLink
          key={e.id}
          to={`/ensemble/${e.id}`}
          className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}
        >
          <span className="pub-side-dot" style={{ background: ensembleColor(e) }} />
          {ensembleDisplayName(e)}
        </NavLink>
      ))}
    </>
  );
}

export function PublicLayout() {
  useLang(); // re-render on EN/ES switch (#42)
  const location = useLocation();
  const pathname = location.pathname;
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Sidebar section expands (desktop) — separate from hamburger so phone
  // expand state doesn't fight the always-visible rail.
  const [sideEnsOpen, setSideEnsOpen] = useState(false);
  const [sideClassesOpen, setSideClassesOpen] = useState(false);
  const [sideCollegeOpen, setSideCollegeOpen] = useState(false);
  const [sideResourcesOpen, setSideResourcesOpen] = useState(false);
  const { ensembles } = useEnsembles();
  // Classes list under their own heading, never among the orchestras
  // (#classes). Same order field, two headings.
  const navEnsembles = [...ensembles].sort((a, b) => a.order - b.order);
  const navPerforming = highSchoolEnsembles(navEnsembles);
  const navClasses = highSchoolClasses(navEnsembles);
  const navCollegeEns = collegeEnsembles(navEnsembles);
  const navCollegeCls = collegeClasses(navEnsembles);
  const [, bump] = useReducer(x => x + 1, 0);
  const menuRef = useModalA11y<HTMLElement>(() => setMenuOpen(false), menuOpen);
  useEffect(() => onIdentityChange(bump), []);
  const me = primaryStudent();
  // Hidden delight (#easter-eggs): five quick taps on the logo → note burst.
  const { cheer, onLogoTap } = useLogoEgg();

  const eid = ensembleIdFromPath(pathname);
  const onEnsemblesIndex = pathname === '/ensembles' || pathname.startsWith('/ensembles/');
  const onEnsemblePage = !!eid;
  const inPerforming = !!eid && navPerforming.some(e => e.id === eid);
  const inClasses = !!eid && navClasses.some(e => e.id === eid);
  const inCollege = !!eid && [...navCollegeEns, ...navCollegeCls].some(e => e.id === eid);
  const onResources = pathInResources(pathname);
  const onHelp = pathname === '/start' || pathname.startsWith('/start/');

  // Auto-open the group that owns the current route (plan: default closed,
  // open when active). Manual toggles still win until the route changes.
  useEffect(() => {
    if (onEnsemblesIndex || onEnsemblePage) setEnsemblesOpen(true);
    if (onResources) setResourcesOpen(true);
    if (onHelp) setHelpOpen(true);
    if (inPerforming || onEnsemblesIndex) setSideEnsOpen(true);
    if (inClasses) setSideClassesOpen(true);
    if (inCollege) setSideCollegeOpen(true);
    if (onResources || onHelp) setSideResourcesOpen(true);
  }, [pathname, onEnsemblesIndex, onEnsemblePage, onResources, onHelp, inPerforming, inClasses, inCollege]);

  const closeMenu = () => setMenuOpen(false);

  const scheduleTo = me ? `/student/${me.id}` : '/lookup';

  return (
    <div className="pub-app">
      <header className="pub-header">
        <Link to="/" className="pub-brand" onClick={onLogoTap}>
          <span className="pub-logo-chip">
            <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="pub-brand-mark" />
          </span>
          <span>{ORG.brandName}</span>
        </Link>
        <button className="pub-header-search no-print" onClick={() => setSearchOpen(true)} aria-label={t('nav.search')}>
          <Search size={15} />
          <span>{t('nav.searchPlaceholder')}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LangToggle />
          <TextSizeControl />
          <ThemeToggle />
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
        <div className="pub-menu-overlay" onClick={closeMenu}>
          <nav className="pub-menu-panel" role="dialog" aria-modal="true" aria-label={t('nav.menu')} tabIndex={-1} ref={menuRef} onClick={e => e.stopPropagation()}>
            <div className="pub-menu-header">
              <span className="pub-menu-title">{ORG.brandName}</span>
              <button className="pub-menu-close" onClick={closeMenu} aria-label={t('nav.closeMenu')}>
                <X size={20} />
              </button>
            </div>
            {me && (
              <Link to="/lookup" className="pub-menu-item pub-menu-me" onClick={closeMenu}>
                <UserCircle size={18} />
                <span style={{ flex: 1, minWidth: 0 }}>{me.name}</span>
                <span className="pub-menu-switch">{t('nav.notYouSwitch')}</span>
              </Link>
            )}

            {NAV_TOP.map(({ to, label, Icon, end }) => {
              const href = to === '/lookup' ? scheduleTo : to;
              return (
                <NavLink
                  key={to}
                  to={href}
                  end={end}
                  className={({ isActive }) => `pub-menu-item ${isActive ? 'active' : ''}`}
                  onClick={closeMenu}
                >
                  <Icon size={18} />
                  {t(label)}
                </NavLink>
              );
            })}

            <button
              className="pub-menu-item pub-menu-expand"
              onClick={() => setEnsemblesOpen(o => !o)}
              aria-expanded={ensemblesOpen}
            >
              <Users size={18} />
              {t('nav.ensembles')}
              <ExpandChevron open={ensemblesOpen} />
            </button>
            {ensemblesOpen && (
              <>
                {navPerforming.length > 0 && (
                  <div className="pub-menu-subhead">{t('nav.ensembles')}</div>
                )}
                <EnsembleSubLinks items={navPerforming} onNavigate={closeMenu} />
                {navClasses.length > 0 && (
                  <div className="pub-menu-subhead">{t('docs.classes')}</div>
                )}
                <EnsembleSubLinks items={navClasses} onNavigate={closeMenu} />
                {(navCollegeEns.length > 0 || navCollegeCls.length > 0) && (
                  <>
                    {navCollegeEns.length > 0 && (
                      <div className="pub-menu-subhead">{t('nav.collegeEnsembles')}</div>
                    )}
                    <EnsembleSubLinks items={navCollegeEns} onNavigate={closeMenu} />
                    {navCollegeCls.length > 0 && (
                      <div className="pub-menu-subhead">{t('nav.collegeClasses')}</div>
                    )}
                    <EnsembleSubLinks items={navCollegeCls} onNavigate={closeMenu} />
                  </>
                )}
                <NavLink
                  to="/ensembles"
                  className={({ isActive }) => `pub-menu-item pub-menu-subitem ${isActive ? 'active' : ''}`}
                  onClick={closeMenu}
                >
                  <span className="pub-menu-dot" style={{ background: '#94a3b8' }} />
                  {t('nav.allEnsembles')}
                </NavLink>
              </>
            )}

            <button
              className="pub-menu-item pub-menu-expand"
              onClick={() => setResourcesOpen(o => !o)}
              aria-expanded={resourcesOpen}
            >
              <FolderOpen size={18} />
              {t('nav.resources')}
              <ExpandChevron open={resourcesOpen} />
            </button>
            {resourcesOpen && RESOURCES.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `pub-menu-item pub-menu-subitem ${isActive ? 'active' : ''}`}
                onClick={closeMenu}
              >
                <Icon size={16} />
                {t(label)}
              </NavLink>
            ))}

            <button
              className="pub-menu-item pub-menu-expand"
              onClick={() => setHelpOpen(o => !o)}
              aria-expanded={helpOpen}
            >
              <HelpCircle size={18} />
              {t('nav.help')}
              <ExpandChevron open={helpOpen} />
            </button>
            {helpOpen && (
              <NavLink
                to="/start"
                className={({ isActive }) => `pub-menu-item pub-menu-subitem ${isActive ? 'active' : ''}`}
                onClick={closeMenu}
              >
                <HelpCircle size={16} />
                {t('nav.startHere')}
              </NavLink>
            )}

            <div className="pub-menu-divider" />
            {STAFF_LOGINS.map(({ to, label }) => (
              <Link key={to} to={to} className="pub-menu-item pub-menu-director" onClick={closeMenu}>
                {t(label)}
              </Link>
            ))}
            <div className="pub-menu-divider" />
            <div className="pub-menu-whats-new" onClick={e => e.stopPropagation()}>
              <WhatsNewBanner audience="public" />
            </div>
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
            <NavLink to={scheduleTo} className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <UserSearch size={18} />{t('nav.mySchedule')}
            </NavLink>
            <NavLink to="/concerts" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <Ticket size={18} />{t('nav.concertsShort')}
            </NavLink>
            <NavLink to="/ensembles" end className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
              <Users size={18} />{t('nav.ensembles')}
            </NavLink>

            {navPerforming.length > 0 && (
              <>
                <button
                  type="button"
                  className="pub-side-head pub-side-expand"
                  onClick={() => setSideEnsOpen(o => !o)}
                  aria-expanded={sideEnsOpen}
                >
                  {t('nav.ensembles')}
                  <ChevronDown size={14} style={{ transform: sideEnsOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                </button>
                {sideEnsOpen && <SideEnsembleLinks items={navPerforming} />}
              </>
            )}
            {navClasses.length > 0 && (
              <>
                <button
                  type="button"
                  className="pub-side-head pub-side-expand"
                  onClick={() => setSideClassesOpen(o => !o)}
                  aria-expanded={sideClassesOpen}
                >
                  {t('docs.classes')}
                  <ChevronDown size={14} style={{ transform: sideClassesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                </button>
                {sideClassesOpen && <SideEnsembleLinks items={navClasses} />}
              </>
            )}
            {(navCollegeEns.length > 0 || navCollegeCls.length > 0) && (
              <>
                <button
                  type="button"
                  className="pub-side-head pub-side-expand"
                  onClick={() => setSideCollegeOpen(o => !o)}
                  aria-expanded={sideCollegeOpen}
                >
                  {t('nav.college')}
                  <ChevronDown size={14} style={{ transform: sideCollegeOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                </button>
                {sideCollegeOpen && (
                  <>
                    {navCollegeEns.length > 0 && (
                      <div className="pub-side-subhead">{t('nav.collegeEnsembles')}</div>
                    )}
                    <SideEnsembleLinks items={navCollegeEns} />
                    {navCollegeCls.length > 0 && (
                      <div className="pub-side-subhead">{t('nav.collegeClasses')}</div>
                    )}
                    <SideEnsembleLinks items={navCollegeCls} />
                  </>
                )}
              </>
            )}

            <button
              type="button"
              className="pub-side-head pub-side-expand"
              onClick={() => setSideResourcesOpen(o => !o)}
              aria-expanded={sideResourcesOpen}
            >
              {t('nav.resources')}
              <ChevronDown size={14} style={{ transform: sideResourcesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {sideResourcesOpen && (
              <>
                {RESOURCES.map(({ to, label, Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
                    <Icon size={18} />{t(label)}
                  </NavLink>
                ))}
                <NavLink to="/start" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
                  <HelpCircle size={18} />{t('nav.startHere')}
                </NavLink>
              </>
            )}
          </nav>

          <div className="pub-side-bottom">
            {me && (
              <Link to="/lookup" className="pub-side-item pub-side-me">
                <UserCircle size={18} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</span>
                <span className="pub-side-switch">{t('nav.notYouSwitch')}</span>
              </Link>
            )}
            {STAFF_LOGINS.map(({ to, label }) => (
              <Link key={to} to={to} className="pub-side-item pub-side-director">
                {t(label)}
              </Link>
            ))}
            <div className="pub-side-whats-new">
              <WhatsNewBanner audience="public" />
            </div>
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
          to={scheduleTo}
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
