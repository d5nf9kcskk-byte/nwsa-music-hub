import './startGuide.css';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { GraduationCap, Users, Music2, ChevronDown, Printer, BookOpen } from 'lucide-react';
import { LABELS } from '../shared/labels';
import { PageHeader } from './components/PageHeader';

type Audience = 'students' | 'parents' | 'directors';

interface QA {
  q: string;
  a: ReactNode;
}

/* ── Questions, by audience. Answers deep-link into the app. ─────────────── */

const STUDENT_QA: QA[] = [
  {
    q: 'Is rehearsal cancelled or changed today?',
    a: (
      <>
        Check the <Link to="/">Home page</Link> first. Anything unusual today — a
        cancellation, a double block, a room move — appears in a red{' '}
        <strong>“Schedule change today”</strong> strip at the very top. No red strip
        means today runs as normal.
      </>
    ),
  },
  {
    q: 'Where do I find my part (sheet music)?',
    a: (
      <>
        Go to <Link to="/lookup">{LABELS.mySchedule}</Link> and find yourself once —
        the app remembers you. After that, pieces on your schedule show a{' '}
        <strong>“My part”</strong> link matched to your instrument. You can also browse
        everything under <Link to="/repertoire">{LABELS.repertoire}</Link>.
      </>
    ),
  },
  {
    q: 'What time do I need to be at the concert — and what do I wear?',
    a: (
      <>
        Open the concert from <Link to="/concerts">{LABELS.concerts}</Link> (or from
        Home). The event page lists the <strong>call time</strong> (when you must
        arrive — earlier than the concert start), the dress code, the venue address,
        and the pickup time, all in one place.
      </>
    ),
  },
  {
    q: 'Where do I sit? (chairs / seating)',
    a: (
      <>
        Published seating charts live on your ensemble’s page — pick yours under{' '}
        <Link to="/ensembles">{LABELS.ensembles}</Link>. Seat 1 in a section is the{' '}
        <strong>principal</strong> (first chair).
      </>
    ),
  },
  {
    q: 'When is my playing exam, and how do I turn it in?',
    a: (
      <>
        Everything due is on <Link to="/assignments">{LABELS.assignments}</Link>.
        Playing exams are submitted through the Google Form linked on the assignment —
        not in person.
      </>
    ),
  },
  {
    q: 'I have to miss a rehearsal — what do I do?',
    a: (
      <>
        Open <Link to="/lookup">{LABELS.mySchedule}</Link> and use{' '}
        <strong>“{LABELS.plannedAbsence}”</strong>. Your director sees it right on the
        roll screen for that day, so you don’t get marked as a no-show.
      </>
    ),
  },
  {
    q: 'Can I get the schedule on my phone’s calendar?',
    a: (
      <>
        Yes — open the <Link to="/calendar">{LABELS.calendar}</Link> (or your own
        schedule page) and tap <strong>Subscribe</strong>. Your phone’s calendar app
        stays up to date automatically.
      </>
    ),
  },
  {
    q: 'What does “call time” (or “sectional”, “pull-out”…) mean?',
    a: (
      <>
        See the <a href="#glossary">glossary</a> at the bottom of this page — it
        defines the words you’ll hear around the music department.
      </>
    ),
  },
];

const PARENT_QA: QA[] = [
  {
    q: 'Is rehearsal cancelled today?',
    a: (
      <>
        The <Link to="/">Home page</Link> shows a red{' '}
        <strong>“Schedule change today”</strong> strip whenever anything is cancelled
        or moved. Worth a glance before you plan pickup.
      </>
    ),
  },
  {
    q: 'When and where do I pick up my student after a concert?',
    a: (
      <>
        Open the concert from <Link to="/concerts">{LABELS.concerts}</Link>. Its page
        lists the <strong>pickup time</strong> and the full venue address (tap the
        address for directions).
      </>
    ),
  },
  {
    q: 'What should my student wear on stage?',
    a: (
      <>
        The dress code is on each concert’s own page — find the concert on{' '}
        <Link to="/concerts">{LABELS.concerts}</Link> and look for{' '}
        <strong>Dress</strong>.
      </>
    ),
  },
  {
    q: 'What concerts are coming up this year?',
    a: (
      <>
        <Link to="/concerts">{LABELS.concerts}</Link> lists every concert of the
        season, month by month — and it prints nicely if you want one on the fridge.
      </>
    ),
  },
  {
    q: 'I have more than one student in the program — can I follow both?',
    a: (
      <>
        Yes. Look up each student on <Link to="/lookup">{LABELS.mySchedule}</Link> and
        choose to save them — the app remembers all of your students and shows each
        one’s schedule.
      </>
    ),
  },
  {
    q: 'My student will be absent — who do I tell?',
    a: (
      <>
        Use <strong>“{LABELS.plannedAbsence}”</strong> on your student’s schedule page
        (start at <Link to="/lookup">{LABELS.mySchedule}</Link>). The director sees it
        when taking roll.
      </>
    ),
  },
  {
    q: '¿La información está disponible en español?',
    a: (
      <>
        Sí — en <Link to="/announcements">{LABELS.announcements}</Link>, los avisos que
        tienen traducción muestran un botón <strong>ES</strong> para leerlos en
        español.
      </>
    ),
  },
  {
    q: 'Can I put the whole schedule on my phone’s calendar?',
    a: (
      <>
        Yes — tap <strong>Subscribe</strong> on the{' '}
        <Link to="/calendar">{LABELS.calendar}</Link> page (or on your student’s
        schedule page for just their events).
      </>
    ),
  },
];

const DIRECTOR_QA: QA[] = [
  {
    q: 'How do I tell everyone rehearsal is cancelled or changed today?',
    a: (
      <>
        In the <Link to="/director">director app</Link>, edit the event: cancel it or
        add a change note. That alone drives the red “Schedule change today” banner on
        the public Home page — nothing else to post.
      </>
    ),
  },
  {
    q: 'How do I post an announcement — or a site-wide urgent alert?',
    a: (
      <>
        Use {LABELS.announcements} in the <Link to="/director">director app</Link>.
        Priority <strong>Urgent</strong> shows a banner on every public page and
        queues an outbound Teams / email notification; <strong>Important</strong> gets
        a highlighted card; plain posts appear on Home and ensemble pages.
      </>
    ),
  },
  {
    q: 'How do I take roll?',
    a: (
      <>
        Open <strong>{LABELS.takeRoll}</strong> from the Today screen of the{' '}
        <Link to="/director">director app</Link>. Roll is per period, and each event
        shows a receipt once its roll has been taken.
      </>
    ),
  },
  {
    q: 'A student is subbing into another ensemble for one concert — how?',
    a: (
      <>
        Use <strong>{LABELS.scheduleChange}</strong> in the{' '}
        <Link to="/director">director app</Link>: add or remove a student for a single
        event or a date range. The base roster is untouched, and rosters, roll, and
        the student’s public schedule all update automatically.
      </>
    ),
  },
  {
    q: 'How do I publish seating after a playing exam?',
    a: (
      <>
        In the <Link to="/director">director app</Link>, open your ensemble under{' '}
        <strong>Ensembles</strong> and use its <strong>{LABELS.seating}</strong>{' '}
        section — seat 1 is the principal. Students see published charts on their
        ensemble’s public page.
      </>
    ),
  },
  {
    q: 'How do I attach parts so students can find their own?',
    a: (
      <>
        In the {LABELS.repertoire} manager (<Link to="/director">director app</Link>),
        add per-instrument part links to a piece. Students who have saved their
        identity get a <strong>“My part”</strong> button matched to their instrument.
      </>
    ),
  },
  {
    q: 'Where do parent-reported absences show up?',
    a: (
      <>
        On the roll screen for that date in the{' '}
        <Link to="/director">director app</Link> — each planned absence is ready to be
        converted to Excused or dismissed on the spot.
      </>
    ),
  },
];

/* ── Glossary ────────────────────────────────────────────────────────────── */

const GLOSSARY: { term: string; def: string }[] = [
  {
    term: 'Call time',
    def: 'The time performers must be in place, warmed up and ready — always earlier than the concert start. Arrive by call time, not by the concert time.',
  },
  {
    term: 'Pull-out',
    def: 'A short lesson during rehearsal: the student steps out only for that window of time, then returns. It is not an absence.',
  },
  {
    term: 'Sub',
    def: 'A student temporarily performing with an ensemble that is not their usual one — for a single event or a set of dates.',
  },
  {
    term: 'Sectional',
    def: 'A rehearsal for one section only (just the violins, just the brass) instead of the full ensemble.',
  },
  {
    term: 'Score order',
    def: 'The standard top-to-bottom ordering of instruments in a conductor’s score — woodwinds, brass, percussion, then strings. Rosters and lists often follow it.',
  },
  {
    term: 'Seating / chair',
    def: 'Your position within your section. Chair 1 is “first chair”; seating charts are published after playing exams.',
  },
  {
    term: 'Downbeat',
    def: 'The very first beat — the moment playing actually starts. “Downbeat at 7:00” means the music begins at 7:00, so be seated before then.',
  },
  {
    term: 'Principal',
    def: 'The leader of a section (the first chair). The principal plays the solos and leads how the section plays.',
  },
];

const ALL_TABS: { key: Audience; label: string; Icon: typeof Users; panelTitle: string; qa: QA[] }[] = [
  { key: 'students', label: 'Students', Icon: GraduationCap, panelTitle: 'For Students', qa: STUDENT_QA },
  { key: 'parents', label: 'Parents', Icon: Users, panelTitle: 'For Parents', qa: PARENT_QA },
  { key: 'directors', label: 'Directors & Staff', Icon: Music2, panelTitle: 'For Directors & Staff', qa: DIRECTOR_QA },
];

export function StartGuide() {
  // Public visitors see Students + Parents. The staff view (linked from the
  // director app menu as /start?staff=1) adds the Directors & Staff tab.
  const [searchParams] = useSearchParams();
  const staffView = searchParams.get('staff') === '1';
  const TABS = staffView ? ALL_TABS : ALL_TABS.filter(t => t.key !== 'directors');
  const [tab, setTab] = useState<Audience>(staffView ? 'directors' : 'students');

  return (
    <div className="pub-page pub-sg">
      <PageHeader
        title={LABELS.startHere}
        action={
          <button className="pub-sg-print-btn" onClick={() => window.print()}>
            <Printer size={14} /> Print this guide
          </button>
        }
      />
      <p className="pub-sg-intro">
        New to NWSA Music? Pick who you are, then tap any question. Every answer links
        straight to the right page.
      </p>

      <div className="pub-sg-tabs" role="tablist" aria-label="Who are you?">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`pub-sg-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Every visible audience's panel stays in the DOM so print shows them all. */}
      {TABS.map(({ key, panelTitle, qa }) => (
        <section key={key} className={`pub-sg-panel ${tab === key ? 'active' : ''}`}>
          <h2 className="pub-sg-panel-title">{panelTitle}</h2>
          <QAList items={qa} />
        </section>
      ))}

      <h2 className="pub-sg-glossary-title" id="glossary">
        <BookOpen size={17} /> Glossary — words you’ll hear
      </h2>
      <dl className="pub-sg-glossary">
        {GLOSSARY.map(({ term, def }) => (
          <div key={term} className="pub-sg-glossary-item">
            <dt>{term}</dt>
            <dd>{def}</dd>
          </div>
        ))}
      </dl>

      <p className="pub-sg-contact">
        Still stuck, or something looks wrong? Email the music office at{' '}
        <a href="mailto:nwsaorchestras@gmail.com">nwsaorchestras@gmail.com</a>.
      </p>
    </div>
  );
}

function QAList({ items }: { items: QA[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <div className="pub-sg-list">
      {items.map((item, i) => (
        <div key={i} className={`pub-sg-item ${open[i] ? 'open' : ''}`}>
          <button
            className="pub-sg-q"
            aria-expanded={!!open[i]}
            onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
          >
            <span>{item.q}</span>
            <ChevronDown size={16} className="pub-sg-chev" />
          </button>
          <div className="pub-sg-answer">{item.a}</div>
        </div>
      ))}
    </div>
  );
}
