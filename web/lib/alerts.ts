/** Web push alerts: register the service worker and subscribe only when the user turns alerts on. */
import { api } from '../api';

export const alertsSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The current subscription, without registering anything. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!alertsSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function turnAlertsOn(vapidPublicKey: string) {
  if (!alertsSupported()) throw new Error('This browser cannot show alerts.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error('Alerts are blocked. Allow notifications for this site in your browser.');
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(vapidPublicKey),
    }));
  await api('/api/alerts/subscribe', 'POST', subscription.toJSON());
}

export async function turnAlertsOff() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await api('/api/alerts/unsubscribe', 'POST', { endpoint });
}
