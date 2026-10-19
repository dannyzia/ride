/**
 * notifyCopy.ts — D2-3 server-side push copy (STAGE D2-FIX).
 *
 * Small en/bn dictionary for push title/body templates sent from the
 * server (notify.ts convenience sends, shopNotify customer-status copy,
 * fleetNotify staff invite, emergencyChain pushes). lib/notify.ts selects
 * the recipient's stored locale (users.locale, default 'en') at send time
 * when a NotificationRequest carries a copyKey.
 *
 * {var} templates are filled from copyVars (addresses, names, reasons).
 * Callers ALWAYS keep their literal title/body as fallback — a missing
 * key or locale resolves to the live literal, never to an empty string.
 * Copy-truth rule: both locales ship every key (no key ships en-only).
 */

export type NotifyLocale = 'en' | 'bn';

export type NotifyCopyKey =
  | 'ride_matched'
  | 'ride_completed'
  | 'driver_arrived'
  | 'shop_order_picked_up'
  | 'shop_order_delivered'
  | 'shop_order_self_delivered'
  | 'shop_courier_assigned'
  | 'fleet_staff_invite'
  | 'emergency_search_widening'
  | 'emergency_ambulance_call';

interface CopyEntry {
  title: string;
  body: string;
}

const COPY: Record<NotifyCopyKey, { en: CopyEntry; bn: CopyEntry }> = {
  ride_matched: {
    en: { title: 'Driver Found', body: 'Your driver is on the way!' },
    bn: { title: 'ড্রাইভার পাওয়া গেছে', body: 'আপনার ড্রাইভার আসছেন!' },
  },
  ride_completed: {
    en: { title: 'Ride Complete', body: 'Thanks for riding with us! Rate your driver.' },
    bn: { title: 'রাইড সম্পন্ন', body: 'আমাদের সাথে যাত্রার জন্য ধন্যবাদ! আপনার ড্রাইভারকে রেট করুন।' },
  },
  driver_arrived: {
    en: { title: 'Driver Arrived', body: 'Your driver has arrived at the pickup location.' },
    bn: { title: 'ড্রাইভার পৌঁছে গেছেন', body: 'আপনার ড্রাইভার পিকআপ স্থানে পৌঁছে গেছেন।' },
  },
  shop_order_picked_up: {
    en: { title: 'Order picked up', body: 'The courier picked up your order and is on the way.' },
    bn: { title: 'অর্ডার তুলে নেওয়া হয়েছে', body: 'কুরিয়ার আপনার অর্ডারটি তুলে নিয়েছেন, আসছেন।' },
  },
  shop_order_delivered: {
    en: { title: 'Order delivered', body: 'Your order has been delivered. Pay cash on receipt.' },
    bn: { title: 'অর্ডার পৌঁছে গেছে', body: 'আপনার অর্ডার পৌঁছে গেছে। প্রাপ্তির সময় নগদ পরিশোধ করুন।' },
  },
  shop_order_self_delivered: {
    en: { title: 'Order delivered', body: 'Your order was delivered directly by the shop. Pay cash on receipt.' },
    bn: { title: 'অর্ডার পৌঁছে গেছে', body: 'দোকান সরাসরি আপনার অর্ডার পৌঁছে দিয়েছে। প্রাপ্তির সময় নগদ পরিশোধ করুন।' },
  },
  shop_courier_assigned: {
    en: { title: 'Courier assigned', body: 'A courier is on the way for your order.' },
    bn: { title: 'কুরিয়ার নিয়োগ হয়েছে', body: 'আপনার অর্ডারের জন্য একজন কুরিয়ার আসছেন।' },
  },
  fleet_staff_invite: {
    en: {
      title: "You've been added to a fleet team",
      body: '{fleet_name} added you as {role_label}. Open the fleet surface to see your workspace.',
    },
    bn: {
      title: 'আপনাকে একটি ফ্লিট টিমে যোগ করা হয়েছে',
      body: '{fleet_name} আপনাকে {role_label} হিসেবে যোগ করেছে। আপনার ওয়ার্কস্পেস দেখতে ফ্লিট স্ক্রিন খুলুন।',
    },
  },
  emergency_search_widening: {
    en: {
      title: '🚑 Widening the ambulance search',
      body: 'No ambulance has answered yet — we are alerting more units near {pickup_address}. Keep this screen open.',
    },
    bn: {
      title: '🚑 অ্যাম্বুলেন্স অনুসন্ধান সম্প্রসারণ করা হচ্ছে',
      body: 'এখনো কোনো অ্যাম্বুলেন্স সাড়া দেয়নি — {pickup_address}-এর কাছে আরও ইউনিটকে জানানো হচ্ছে। এই স্ক্রিনটি খোলা রাখুন।',
    },
  },
  emergency_ambulance_call: {
    en: { title: '🚨 Emergency ambulance call', body: '{service_level} needed — {pickup_address}' },
    bn: { title: '🚨 জরুরি অ্যাম্বুলেন্স কল', body: '{service_level} প্রয়োজন — {pickup_address}' },
  },
};

/** Normalize a stored locale to a supported dictionary locale (default en). */
export function normalizeLocale(locale: unknown): NotifyLocale {
  return locale === 'bn' ? 'bn' : 'en';
}

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{([a-z_]+)\}/g, (m, k: string) =>
    vars[k] === undefined ? m : String(vars[k]),
  );
}

/**
 * Resolve a copy key to the recipient-locale title/body. Returns null when
 * the key is unknown so the caller keeps its literal copy (never blank).
 */
export function resolveCopy(
  key: string,
  locale: unknown,
  vars?: Record<string, string | number>,
): CopyEntry | null {
  const entry = (COPY as Record<string, { en: CopyEntry; bn: CopyEntry }>)[key];
  if (!entry) return null;
  const localized = entry[normalizeLocale(locale)] ?? entry.en;
  return { title: fill(localized.title, vars), body: fill(localized.body, vars) };
}
