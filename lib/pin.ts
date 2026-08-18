/**
 * Sanitize raw text input into a numeric PIN: strips every non-digit
 * character and caps the result at `length`. This is the single source of
 * truth for the §6.5 hidden-input PIN pattern (PinInput's onChangeText) —
 * extracted as a pure function so the digit-filtering / length-capping rules
 * are unit-testable without mounting the RN component.
 */
export function sanitizePin(raw: string, length: number): string {
  return raw.replace(/[^0-9]/g, "").slice(0, length);
}

/**
 * Display-side edit guard for the rider's PIN reveal: a complete 4-digit
 * value that differs from the ride's PIN is an accidental edit of a fixed
 * value — the screen flashes the mismatch and reverts after
 * PIN_REVERT_DELAY_MS so the rider never shows the driver a wrong PIN.
 * Incomplete entries and screens without a reference PIN are never "wrong".
 */
export function isPinMismatch(value: string, correctPin?: string | null): boolean {
  return value.length === 4 && !!correctPin && value !== correctPin;
}

/** How long the mismatch flash stays visible before the boxes auto-restore. */
export const PIN_REVERT_DELAY_MS = 900;
