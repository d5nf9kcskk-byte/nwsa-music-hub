import { useFeedToken } from './useFeedToken';

/**
 * The token in one director's appointments calendar URL
 * (#signup-appointments): `feedSecrets/appointments__<email>`.
 *
 * Per-DIRECTOR rather than one shared token, because this calendar carries
 * what students wrote on a form — free text and contact details — and no
 * director needs to hold another's. The mechanics live in useFeedToken, shared
 * with the "my calendar" feed (#my-calendar); the Cloud Function that reads
 * this doc is functions/src/appointmentsFeed.ts.
 */
export function useAppointmentsFeed() {
  return useFeedToken('appointments');
}
