/**
 * The Firebase Messaging SDK, behind its OWN module so it lands in a chunk
 * with a stable name (`fcmLazy-*`) that vite.config.ts keeps out of the
 * service-worker precache (#push). Only `pushClient.ts` imports this, and only
 * dynamically: nobody downloads FCM until they tap "Turn on alerts".
 */
export { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
