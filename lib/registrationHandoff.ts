/**
 * registrationHandoff.ts — S2.1 M-6 (§16).
 *
 * The account password must NOT travel in route params (register.tsx → the
 * three onboarding wizards — URLs leak into history, devtools and crash
 * reports). This module holds the handoff in memory, equivalent to the
 * validated-input-only pattern of lib/parseBody: no storage, no export.
 *
 * LIFECYCLE: register.tsx calls setRegistrationHandoff() right before pushing
 * a wizard; the wizard PEEKS with getRegistrationHandoff() (a second render or
 * StrictMode remount must not lose it) and clears it after the account is
 * successfully created. If the peek returns null (app killed, deep-linked
 * straight into the wizard), the wizard bounces back to register.tsx — the
 * re-prompt fallback the §16 order allows instead of silently failing.
 */

export interface RegistrationHandoff {
  phone: string;
  name: string;
  password: string;
  // C1-1: T&C + Privacy consent carried from the phone-entry checkbox gate.
  terms_accepted: true;
}

let handoff: RegistrationHandoff | null = null;

/** register.tsx: store the freshly-collected credentials for the wizard. */
export function setRegistrationHandoff(value: RegistrationHandoff): void {
  handoff = value;
}

/** Wizard: read the handoff WITHOUT consuming it — register.tsx still owns the
 *  clear. Returns null when the credentials never arrived. */
export function getRegistrationHandoff(): RegistrationHandoff | null {
  return handoff;
}

/** Wizard: after POST /api/register succeeded (account created, no live use
 *  for the password remains), drop it from memory. */
export function clearRegistrationHandoff(): void {
  handoff = null;
}
