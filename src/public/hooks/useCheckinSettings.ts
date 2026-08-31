import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { ORG } from '../../org';
import { DEFAULT_CHECKIN_SETTINGS, type CheckinSettings, type Term } from '../../shared/concertCheckin';

/**
 * Site-wide check-in settings (#concert-checkin), read live so a director can
 * change the accepted domains or the window from their phone at the venue and
 * have every student's page pick it up without a deploy.
 *
 * `settings/concertAttendance` is world-readable on purpose — every value on
 * it is a rule of the station (which domains, how early it opens, how many
 * concerts a semester asks for), never anything about a person. The Cloud
 * Function reads the same doc, and ITS answer is the binding one; this hook
 * exists so the page can tell a student "not open until 6pm" before they
 * bother taking a photograph.
 *
 * The org config is a complete answer on its own: before anyone opens the
 * settings screen the doc does not exist, and that is the normal state.
 */
export interface SiteCheckinSettings extends Partial<CheckinSettings> {
  terms: Term[];
  goals: Record<string, { required?: number; optional?: number }>;
  loading: boolean;
}

export function useCheckinSettings(): SiteCheckinSettings {
  const [state, setState] = useState<SiteCheckinSettings>(() => ({
    emailDomains: ORG.checkin?.emailDomains ?? [],
    // Org config only, never the settings doc: `settings/concertAttendance`
    // is world-readable with a pinned key allowlist in firestore.rules, and
    // widening who may take the roster-less college door is a deploy rather
    // than something a phone can change at the venue. The Cloud Function
    // reads the same org value and ITS answer is the binding one.
    guestEmailDomains: ORG.checkin?.guestEmailDomains ?? [],
    opensMinutesBefore: ORG.checkin?.opensMinutesBefore ?? DEFAULT_CHECKIN_SETTINGS.opensMinutesBefore,
    closesMinutesAfter: ORG.checkin?.closesMinutesAfter ?? DEFAULT_CHECKIN_SETTINGS.closesMinutesAfter,
    terms: ORG.terms ?? [],
    goals: {},
    // Nothing to wait for when Firestore is not configured — the org config
    // alone is a working station, so the page must not sit on a spinner.
    loading: Boolean(db),
  }));

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      doc(db, 'settings', 'concertAttendance'),
      snap => {
        const d = snap.data() ?? {};
        setState(s => ({
          ...s,
          emailDomains: Array.isArray(d.emailDomains) && d.emailDomains.length
            ? (d.emailDomains as string[])
            : (ORG.checkin?.emailDomains ?? []),
          opensMinutesBefore: typeof d.opensMinutesBefore === 'number'
            ? d.opensMinutesBefore
            : (ORG.checkin?.opensMinutesBefore ?? DEFAULT_CHECKIN_SETTINGS.opensMinutesBefore),
          closesMinutesAfter: typeof d.closesMinutesAfter === 'number'
            ? d.closesMinutesAfter
            : (ORG.checkin?.closesMinutesAfter ?? DEFAULT_CHECKIN_SETTINGS.closesMinutesAfter),
          goals: (d.goals as SiteCheckinSettings['goals']) ?? {},
          loading: false,
        }));
      },
      // A settings read that fails must not take the station down with it —
      // the org defaults are a working configuration.
      () => setState(s => ({ ...s, loading: false })),
    );
  }, []);

  return state;
}
