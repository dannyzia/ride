/**
 * Centralized storage-key registry.
 *
 * Every AsyncStorage key used by the driver app lives here so key names are
 * grep-able in one place and collisions are impossible. Keys follow the
 * pattern `ride:{domain}:{key}` to avoid clashes with third-party libs.
 *
 * Add new keys here — never hard-code AsyncStorage strings in screen or
 * utility files.
 */

export const STORAGE_KEYS = {
  /** Persisted language choice ('en' | 'bn'). Hydrated before first render. */
  LANGUAGE: 'ride:i18n:language' as const,

  /** Daily earnings goal in *integer paisa* (not taka). */
  EARNINGS_GOAL_PAISA: 'ride:earnings:goal_paisa' as const,

  /** Auto-accept enabled preference (boolean, persisted per driver). */
  AUTO_ACCEPT: 'ride:driver:auto_accept' as const,

  /** Sound enabled for ride offers (boolean). */
  SOUND_ENABLED: 'ride:driver:sound_enabled' as const,

  /** Theme preference ('light' | 'dark' | 'system'). */
  THEME: 'ride:driver:theme' as const,

  /** Last-selected vehicle ID for quick switching. */
  LAST_VEHICLE_ID: 'ride:driver:last_vehicle_id' as const,

  /** Emergency contacts list (JSON array, max 5 entries). */
  EMERGENCY_CONTACTS: 'ride:driver:emergency_contacts' as const,

  /** Notification preferences (JSON object). */
  NOTIFICATION_PREFS: 'ride:driver:notification_prefs' as const,
} as const;

export type StorageKey =
  (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
