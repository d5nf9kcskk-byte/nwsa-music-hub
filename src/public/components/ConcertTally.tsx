import { useState } from 'react';
import { Music4, AlertTriangle, Check } from 'lucide-react';
import { emailProblem, domainsLabel, normalizeEmail } from '../../shared/concertCheckin';
import { useCheckinSettings } from '../hooks/useCheckinSettings';
import { fmtShortDate } from '../../shared/dates';
import { t, tn, tType, useLang } from '../../shared/i18n';
import type { Student } from '../../director/types';
import '../checkin.css';

/**
 * "How many concerts have I done this semester?" (#concert-checkin)
 *
 * The count comes from the concertTally Cloud Function, not from Firestore:
 * `concertCheckins` is staff-only with no public projection, because
 * attendance is staff-only under the Hub's privacy model even though names
 * are public.
 *
 * The student gives the school email they check in with, and the server only
 * answers if it matches the address on their OWN records. That is the whole
 * difference between "see your own count" and "type any classmate's name and
 * read their attendance" — the director chose it deliberately over name-only.
 * It is not authentication, and it is not claimed to be; it is the bar that
 * stops this page from being a roster of everyone's attendance.
 *
 * The address is remembered on the device afterwards, so it is asked once.
 */

const EMAIL_KEY = 'nwsa.checkin.email.v1';

interface TermTally {
  termId: string;
  termName: string;
  required: number;
  optional: number;
  requiredGoal?: number;
  optionalGoal?: number;
}

function rememberedEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; }
}

/** The concertTally function answers in English and sends no failure code.
 *  It has exactly two refusals; map those by their exact text and show
 *  anything else as the function wrote it. */
const SERVER_MESSAGE_KEY: Record<string, string> = {
  'We could not match that name and email. Use the school address you check in with, or ask a director.': 'tally.srv.noMatch',
  'The Hub is busy. Try once more.': 'tally.srv.busy',
};

function serverMessage(message: string): string {
  const key = SERVER_MESSAGE_KEY[message];
  return key ? t(key) : message;
}

function tallyEndpoint(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/concertTally` : '';
}

export function ConcertTally({ student }: { student: Student }) {
  useLang(); // re-render when the EN|ES toggle flips
  const site = useCheckinSettings();
  const [email, setEmail] = useState(rememberedEmail);
  const [terms, setTerms] = useState<TermTally[] | null>(null);
  const [incomplete, setIncomplete] = useState<{ eventTitle: string; eventDate: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const domains = site.emailDomains ?? [];
  const hint = domainsLabel(domains, t('misc.or'));
  const badEmail = Boolean(emailProblem(email, domains));

  async function look() {
    const url = tallyEndpoint();
    if (!url) { setError(t('tally.off')); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, email: normalizeEmail(email) }),
      });
      const data = await res.json() as {
        ok: boolean; message?: string; terms?: TermTally[];
        incomplete?: { eventTitle: string; eventDate: string }[];
      };
      if (!data.ok) {
        setError(data.message ? serverMessage(data.message) : t('tally.failed'));
        setTerms(null);
        return;
      }
      try { localStorage.setItem(EMAIL_KEY, normalizeEmail(email)); } catch { /* private mode */ }
      setTerms(data.terms ?? []);
      setIncomplete(data.incomplete ?? []);
    } catch {
      setError(t('tally.network'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pub-card pub-tally">
      <h2 className="pub-tally-head"><Music4 size={18} aria-hidden /> {t('tally.title')}</h2>

      {!terms && (
        <>
          <p className="pub-checkin-hint">{t('tally.intro')}</p>
          <div className="pub-tally-ask">
            <input
              className="pub-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={hint ? hint.split(',')[0].replace('@', t('ci.youAt')) : t('ci.schoolEmailPh')}
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
            />
            <button type="button" className="pub-btn" disabled={badEmail || busy} onClick={look}>
              {busy ? t('tally.checking') : t('tally.show')}
            </button>
          </div>
          {hint && <p className="pub-checkin-hint">{t('tally.mustEnd', { hint })}</p>}
        </>
      )}

      {error && (
        <p className="pub-checkin-hint warn" role="alert">
          <AlertTriangle size={14} aria-hidden /> {error}
        </p>
      )}

      {terms && (
        <>
          {terms.map(term => (
            <div key={term.termId} className="pub-tally-term">
              <h3>{term.termName}</h3>
              <div className="pub-tally-rows">
                <TallyRow label={t('tally.required')} count={term.required} goal={term.requiredGoal} />
                <TallyRow label={t('tally.optional')} count={term.optional} goal={term.optionalGoal} />
              </div>
            </div>
          ))}
          {terms.length === 0 && <p className="pub-checkin-hint">{t('tally.noTerms')}</p>}

          {incomplete.length > 0 && (
            <div className="pub-tally-warn">
              <AlertTriangle size={16} aria-hidden />
              <div>
                <strong>{tn('tally.notCounted', incomplete.length)}</strong>
                <p>{tn('tally.notCountedWhy', incomplete.length)}</p>
                <ul>
                  {incomplete.map((c, i) => (
                    <li key={`${c.eventDate}-${i}`}>
                      {c.eventTitle || tType('Concert')}{c.eventDate ? ` · ${fmtShortDate(c.eventDate)}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <button
            type="button"
            className="pub-linkish"
            onClick={() => { setTerms(null); setIncomplete([]); }}
          >
            {t('tally.otherAddress')}
          </button>
        </>
      )}
    </section>
  );
}

function TallyRow({ label, count, goal }: { label: string; count: number; goal?: number }) {
  const met = goal != null && count >= goal;
  return (
    <div className={`pub-tally-row ${met ? 'met' : ''}`}>
      <span className="pub-tally-n">
        {goal != null ? t('tally.ofGoal', { count, goal }) : count}
        {met && <Check size={16} aria-hidden />}
      </span>
      <span className="pub-tally-l">{label}</span>
    </div>
  );
}
