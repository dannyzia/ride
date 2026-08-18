import { sanitizePin } from '../pin';

describe('sanitizePin', () => {
  it('strips non-digit characters', () => {
    expect(sanitizePin('12a3', 4)).toBe('123');
    expect(sanitizePin('1-2 3', 4)).toBe('123');
    expect(sanitizePin('abc', 4)).toBe('');
    expect(sanitizePin('12.34', 4)).toBe('1234');
  });

  it('caps the result at the requested length', () => {
    expect(sanitizePin('123456', 4)).toBe('1234');
    expect(sanitizePin('1234', 2)).toBe('12');
    expect(sanitizePin('999999999', 4)).toBe('9999');
  });

  it('passes through clean short input unchanged', () => {
    expect(sanitizePin('12', 4)).toBe('12');
    expect(sanitizePin('', 4)).toBe('');
  });

  it('handles a zero length (input fully discarded)', () => {
    expect(sanitizePin('1234', 0)).toBe('');
  });

  it('returns digits only, not other numeric scripts', () => {
    // Unicode digits (Arabic-Indic, full-width) are not in [0-9] — stripped.
    expect(sanitizePin('٣٤', 4)).toBe('');
    expect(sanitizePin('１2', 4)).toBe('2');
  });
});
