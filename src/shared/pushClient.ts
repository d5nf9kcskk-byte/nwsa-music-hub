/**
 * The device side of web push (#push): ask permission, get an FCM token
 * against the app's EXISTING service worker (the one vite-plugin-pwa
 * generates — public/push-handler.js is imported into it), and write the
 * subscription doc. Used by the staff trial panel and, once familiesOpen is
 * on, by the public Home button.
 *
 * The messaging SDK is imported HERE, dynamically, and this module is itself
 * only ever imported dynamically by the two buttons, so nobody downloads a
 * byte of it until they tap "Turn on alerts".
 *
 * No VAPID key is configured: getToken() falls back to the Firebase SDK's
 * built-in default key, which FCM accepts without any console step.
 * VITE_FIREBASE_VAPID_KEY overrides it if the project ever generates its own.
 */
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { app, db } from '../director/firebase';
import {
  subscriptionDocId, type PushLang, type PushScope, type PushSubscriptionDoc,
} from './pushAlerts';

export type PushSupport = 'ok' | 'unsupported' | 'ios-needs-home-screen' | 'blocked';

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Can this browser, as it is open right now, receive a push? */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  // iOS only exposes PushManager to a Hub opened from the Home Screen icon.
  if (isIos() && !isStandalone()) return 'ios-needs-home-screen';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ok';
}

/** What this device remembers about its own subscription. Per device, in
 *  localStorage: the doc itself is unreadable by design. */
export interface LocalPushState {
  id: string;
  scope: PushScope;
  ensembleIds: string[];
  studentIds: string[];
  createdAt: number;
}

function storageKey(kind: 'staff' | 'family'): string {
  return kind === 'staff' ? 'hub.push.staff.v1' : 'hub.push.family.v1';
}

export function readPushState(kind: 'staff' | 'family'): LocalPushState | null {
  try {
    const raw = localStorage.getItem(storageKey(kind));
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalPushState;
    return typeof v?.id === 'string' ? v : null;
  } catch {
    return null;
  }
}

function writePushState(kind: 'staff' | 'family', state: LocalPushState | null) {
  try {
    if (state) localStorage.setItem(storageKey(kind), JSON.stringify(state));
    else localStorage.removeItem(storageKey(kind));
  } catch { /* private mode: the doc still exists, the device just forgets it */ }
}

async function swRegistration(): Promise<ServiceWorkerRegistration> {
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('no-service-worker')), 10_000));
  return Promise.race([ready, timeout]);
}

async function fcmToken(): Promise<string> {
  if (!app) throw new Error('not-configured');
  const { getMessaging, getToken, isSupported } = await import('./fcmLazy');
  if (!(await isSupported())) throw new Error('unsupported');
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  return getToken(getMessaging(app), {
    serviceWorkerRegistration: await swRegistration(),
    ...(vapidKey ? { vapidKey } : {}),
  });
}

export interface SubscribeInput {
  kind: 'staff' | 'family';
  scope: PushScope;
  ensembleIds: string[];
  studentIds: string[];
  lang: PushLang;
  /** Staff only: the signed-in email (the rules require it to match). */
  staffEmail?: string;
}

/**
 * Turn alerts on (or change what they cover) for THIS device. Throws an Error
 * whose message is one of: 'permission', 'unsupported', 'not-configured',
 * 'no-service-worker', or whatever Firebase raised.
 */
export async function subscribeThisDevice(input: SubscribeInput): Promise<LocalPushState> {
  if (!db) throw new Error('not-configured');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission');
  const token = await fcmToken();
  const id = await subscriptionDocId(token);
  const prev = readPushState(input.kind);
  const now = Date.now();
  const createdAt = prev?.id === id ? prev.createdAt : now;
  const data: PushSubscriptionDoc = {
    token,
    studentIds: input.studentIds.slice(0, 8),
    ensembleIds: [...new Set(input.ensembleIds)].slice(0, 40),
    lang: input.lang,
    scope: input.kind === 'family' ? 'groups' : input.scope,
    createdAt,
    updatedAt: now,
    ...(input.kind === 'staff' && input.staffEmail ? { staffEmail: input.staffEmail } : {}),
  };
  // A family has no update rule: a changed list is a fresh create.
  if (input.kind === 'family' && prev?.id === id) {
    await deleteDoc(doc(db, 'pushSubscriptions', id));
  }
  await setDoc(doc(db, 'pushSubscriptions', id), data);
  // A token that rotated leaves its old doc behind; take it with us.
  if (prev && prev.id !== id) {
    try { await deleteDoc(doc(db, 'pushSubscriptions', prev.id)); } catch { /* already gone */ }
  }
  const state: LocalPushState = {
    id, scope: data.scope, ensembleIds: data.ensembleIds, studentIds: data.studentIds, createdAt,
  };
  writePushState(input.kind, state);
  return state;
}

/** Turn alerts off for this device: delete its doc and its FCM token. */
export async function unsubscribeThisDevice(kind: 'staff' | 'family'): Promise<void> {
  const prev = readPushState(kind);
  if (prev && db) await deleteDoc(doc(db, 'pushSubscriptions', prev.id));
  writePushState(kind, null);
  if (app) {
    try {
      const { getMessaging, deleteToken } = await import('./fcmLazy');
      await deleteToken(getMessaging(app));
    } catch { /* the doc is gone, which is what stops the sends */ }
  }
}

function testAlertUrl(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/pushTestAlert` : '';
}

/** Ask the pushTestAlert function to buzz this device. Staff only. */
export async function sendTestAlertToThisDevice(idToken: string, subId: string): Promise<{ ok: boolean; message?: string }> {
  const url = testAlertUrl();
  if (!url) return { ok: false, message: 'This build has no Firebase project.' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ subId }),
    });
    const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string; code?: string };
    if (body.ok) return { ok: true };
    return { ok: false, message: [body.message, body.code].filter(Boolean).join(' ') || `HTTP ${res.status}` };
  } catch {
    return { ok: false, message: 'That did not reach the Hub. Check the connection and try again.' };
  }
}
