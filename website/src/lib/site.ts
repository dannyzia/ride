/**
 * Central launch configuration.
 * Replace every placeholder before deploying the public site.
 * Do not publish a placeholder privacy policy or deletion contact.
 */
export const site = {
  brand: 'Ride',
  descriptor: 'Everyday mobility, local commerce and delivery',
  siteUrl: 'https://ride.digital-papyrus.com',
  supportEmail: 'support@ride.digital-papyrus.com',
  privacyEmail: 'privacy@ride.digital-papyrus.com',
  legalEntity: 'Ride Digital Services',
  poweredBy: 'Digital-Papyrus',
  businessAddress: '7/1-D, R.K. Mission Road, Dhaka - 1203',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.ride.bd',
  appStoreUrl: '',
  /**
   * Ride API origin (Expo API routes). The /delete-account form posts to this
   * server-side only; it must match EXPO_PUBLIC_SERVER_URL in eas.json.
   * Empty string disables the web deletion form and falls back to email.
   */
  rideApiUrl: 'https://ride-api.digital-papyrus.com',
  lastUpdated: '5 November 2026',
  /** Set true only after the live app, SDKs, backend and retention rules are audited. */
  privacyPolicyApproved: true,
  /** Set true only after the email inbox and deletion workflow have been tested. */
  deletionWorkflowApproved: true
} as const;

export function isPlaceholder(value: string): boolean {
  return !value || /YOUR-|\[.*\]|example\.com/i.test(value);
}

export const supportEmailConfigured = !isPlaceholder(site.supportEmail);
export const privacyEmailConfigured = !isPlaceholder(site.privacyEmail);
export const companyConfigured = !isPlaceholder(site.legalEntity);
export const domainConfigured = !isPlaceholder(site.siteUrl);
export const playStoreConfigured = site.playStoreUrl.startsWith('https://');
