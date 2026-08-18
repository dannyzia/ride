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
