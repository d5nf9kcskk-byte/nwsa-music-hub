import './uiUpdates.css';
import './pubShell.css';
import { useState, useEffect, useReducer } from 'react';
import { Outlet, NavLink, Link, ScrollRestoration, useLocation } from 'react-router';
import { Home, CalendarDays, Users, Music, UserSearch, Megaphone, ClipboardCheck, Menu, X, ChevronDown, UserCircle, Ticket, HelpCircle, Search, MapPinned, FolderOpen, Mail, ClipboardSignature, ScanLine, CalendarX, BookOpen, GraduationCap } from 'lucide-react';
import { NavLink as RRNavLink } from 'react-router';
import { GlobalAlerts } from './components/GlobalAlerts';
import { StatusStrips } from '../shared/StatusStrips';
import { ConcertDayBanner } from '../shared/ConcertDayBanner';
import { SearchOverlay } from './components/SearchOverlay';
import { TextSizeControl } from './components/TextSize';
import { ThemeToggle } from './components/ThemeToggle';
import { LookSheet } from './components/LookSheet';
import { t, useLang } from '../shared/i18n';
import { LangToggle } from './components/LangToggle';
import { NoteBurst } from '../shared/NoteBurst';
import { useLogoEgg } from '../shared/useLogoEgg';
import { primaryStudent, onIdentityChange } from '../shared/identity';
import { useModalA11y } from '../shared/useModalA11y';
import { WhatsNewBanner } from '../shared/WhatsNewBanner';
import '../shared/whatsNew.css';
import '../shared/concertDayBanner.css';
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

/** Daily destinations — the ONE list, mapped by the phone drawer AND the
 *  desktop rail (#one-nav). The rail used to type these out again by hand in a
 *  different order with a different label for /concerts; that is the shape the
 *  College bug grew in. Order here is the order everywhere. */
const NAV_TOP = [
  { to: '/', label: 'nav.home', Icon: Home, end: true },
  { to: '/calendar', label: 'nav.calendar', Icon: CalendarDays, end: false },
  { to: '/lookup', label: 'nav.mySchedule', Icon: UserSearch, end: false },
  { to: '/concerts', label: 'nav.concerts', Icon: Ticket, end: false },
  // The concert door as a destination (#concert-checkin) — a student at the
  // venue looks for check-in in the menu, not inside a concert card.
  { to: '/checkin', label: 'nav.checkin', Icon: ScanLine, end: true },
];

const RESOURCE_PATHS = [
  '/announcements',
  '/repertoire',
  '/assignments',
  '/documents',
  '/signups',
  ...(ORG.features.campusMap ? ['/map'] : []),
  ...(ORG.features.contactForm ? ['/contact'] : []),
  ...(ORG.features.absenceReport ? ['/absence'] : []),
] as const;

const RESOURCES = [
  { to: '/announcements', label: 'nav.announcements', Icon: Megaphone },
  { to: '/repertoire', label: 'nav.repertoire', Icon: Music },
  { to: '/assignments', label: 'nav.assignmentsShort', Icon: ClipboardCheck },
  { to: '/documents', label: 'nav.documents', Icon: FolderOpen },
  { to: '/signups', label: 'nav.signups', Icon: ClipboardSignature },
  ...(ORG.features.campusMap ? [{ to: '/map', label: 'nav.campusMap', Icon: MapPinned }] : []),
  ...(ORG.features.contactForm ? [{ to: '/contact', label: 'nav.contact', Icon: Mail }] : []),
  ...(ORG.features.absenceReport ? [{ to: '/absence', label: 'nav.absence', Icon: CalendarX }] : []),
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

/** The "All …" row that closes a nav group — one index per group (#one-nav).
 *  Two components rather than one skinned pair, matching EnsembleSubLinks /
 *  SideEnsembleLinks directly above; one-nav.selfcheck.mjs pins that both
 *  surfaces render the same t() keys. */
function AllGroupsLink({ to, label, onNavigate }: { to: string; label: string; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => `pub-menu-item pub-menu-subitem ${isActive ? 'active' : ''}`}
      onClick={onNavigate}
    >
      <span className="pub-menu-dot" style={{ background: '#94a3b8' }} />
      {t(label)}
    </NavLink>
  );
}

function SideAllGroupsLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
      <span className="pub-side-dot" style={{ background: '#94a3b8' }} />
      {t(label)}
    </NavLink>
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
  const [lookOpen, setLookOpen] = useState(false);
  // The drawer and the rail carry the SAME five groups — Ensembles / Classes /
  // College / Resources / Help (#one-nav). The drawer used to have three, with
  // Classes and College buried as subheads inside Ensembles, so a phone student
  // never saw the words until they opened a 39-item list and scrolled past
  // every orchestra; the rail had no Help heading at all. A group somebody is
  // told to look for has to be a row they can see, at every width.
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const [classesOpen, setClassesOpen] = useState(false);
  const [collegeOpen, setCollegeOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Sidebar section expands (desktop) — separate from hamburger so phone
  // expand state doesn't fight the always-visible rail.
  const [sideEnsOpen, setSideEnsOpen] = useState(false);
  const [sideClassesOpen, setSideClassesOpen] = useState(false);
  const [sideCollegeOpen, setSideCollegeOpen] = useState(false);
  const [sideResourcesOpen, setSideResourcesOpen] = useState(false);
  const [sideHelpOpen, setSideHelpOpen] = useState(false);
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
  // One index per group, so each opens ITS OWN accordion. Without the last two
  // entries /classes and /college would open Ensembles.
  const onEnsemblesIndex = pathname === '/ensembles' || pathname.startsWith('/ensembles/');
  const onClassesIndex = pathname === '/classes';
  const onCollegeIndex = pathname === '/college';
  const inPerforming = !!eid && navPerforming.some(e => e.id === eid);
  const inClasses = !!eid && navClasses.some(e => e.id === eid);
  const inCollege = !!eid && [...navCollegeEns, ...navCollegeCls].some(e => e.id === eid);
  const onResources = pathInResources(pathname);
  const onHelp = pathname === '/start' || pathname.startsWith('/start/');

  // Auto-open the group that owns the current route (plan: default closed,
  // open when active). Manual toggles still win until the route changes.
  // Drawer and rail open the SAME group for the same route — a class page
  // opens Classes, not Ensembles, on both.
  useEffect(() => {
    if (inPerforming || onEnsemblesIndex) { setEnsemblesOpen(true); setSideEnsOpen(true); }
    if (inClasses || onClassesIndex) { setClassesOpen(true); setSideClassesOpen(true); }
    if (inCollege || onCollegeIndex) { setCollegeOpen(true); setSideCollegeOpen(true); }
    if (onResources) { setResourcesOpen(true); setSideResourcesOpen(true); }
    if (onHelp) { setHelpOpen(true); setSideHelpOpen(true); }
  }, [pathname, onEnsemblesIndex, onClassesIndex, onCollegeIndex, onResources, onHelp, inPerforming, inClasses, inCollege]);

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
          <ThemeToggle onCustomize={ORG.personalize ? () => setLookOpen(true) : undefined} />
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
                <EnsembleSubLinks items={navPerforming} onNavigate={closeMenu} />
                <AllGroupsLink to="/ensembles" label="nav.allEnsembles" onNavigate={closeMenu} />
              </>
            )}

            {navClasses.length > 0 && (
              <>
                <button
                  className="pub-menu-item pub-menu-expand"
                  onClick={() => setClassesOpen(o => !o)}
                  aria-expanded={classesOpen}
                >
                  <BookOpen size={18} />
                  {t('docs.classes')}
                  <ExpandChevron open={classesOpen} />
                </button>
                {classesOpen && (
                  <>
                    <EnsembleSubLinks items={navClasses} onNavigate={closeMenu} />
                    <AllGroupsLink to="/classes" label="nav.allClasses" onNavigate={closeMenu} />
                  </>
                )}
              </>
            )}

            {(navCollegeEns.length > 0 || navCollegeCls.length > 0) && (
              <>
                <button
                  className="pub-menu-item pub-menu-expand"
                  onClick={() => setCollegeOpen(o => !o)}
                  aria-expanded={collegeOpen}
                >
                  <GraduationCap size={18} />
                  {t('nav.college')}
                  <ExpandChevron open={collegeOpen} />
                </button>
                {collegeOpen && (
                  <>
                    {navCollegeEns.length > 0 && (
                      <div className="pub-menu-subhead">{t('nav.collegeEnsembles')}</div>
                    )}
                    <EnsembleSubLinks items={navCollegeEns} onNavigate={closeMenu} />
                    {navCollegeCls.length > 0 && (
                      <div className="pub-menu-subhead">{t('nav.collegeClasses')}</div>
                    )}
                    <EnsembleSubLinks items={navCollegeCls} onNavigate={closeMenu} />
                    <AllGroupsLink to="/college" label="nav.allCollege" onNavigate={closeMenu} />
                  </>
                )}
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
            {NAV_TOP.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to === '/lookup' ? scheduleTo : to}
                end={end}
                className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />{t(label)}
              </NavLink>
            ))}

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
                {sideEnsOpen && (
                  <>
                    <SideEnsembleLinks items={navPerforming} />
                    <SideAllGroupsLink to="/ensembles" label="nav.allEnsembles" />
                  </>
                )}
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
                {sideClassesOpen && (
                  <>
                    <SideEnsembleLinks items={navClasses} />
                    <SideAllGroupsLink to="/classes" label="nav.allClasses" />
                  </>
                )}
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
                    <SideAllGroupsLink to="/college" label="nav.allCollege" />
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
            {sideResourcesOpen && RESOURCES.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
                <Icon size={18} />{t(label)}
              </NavLink>
            ))}

            <button
              type="button"
              className="pub-side-head pub-side-expand"
              onClick={() => setSideHelpOpen(o => !o)}
              aria-expanded={sideHelpOpen}
            >
              {t('nav.help')}
              <ChevronDown size={14} style={{ transform: sideHelpOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {sideHelpOpen && (
              <NavLink to="/start" className={({ isActive }) => `pub-side-item ${isActive ? 'active' : ''}`}>
                <HelpCircle size={18} />{t('nav.startHere')}
              </NavLink>
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
          <ConcertDayBanner checkinNav={{ to: '/checkin' }} />
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
      {lookOpen && <LookSheet onClose={() => setLookOpen(false)} />}
      <NoteBurst cheer={cheer} />
      {/* Reset/restore window scroll on route change (deep pages otherwise open mid-scroll) */}
      <ScrollRestoration />
    </div>
  );
}
