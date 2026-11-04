/**
 * lib/dpmaps/piiScrubber.ts — Cross-stage PII filtering contract for dpMaps.
 *
 * Converts Bengali numerals to ASCII, strips phone-run separators, and drops
 * Bangladeshi mobile phone numbers (013-019) and emails outright.
 * Preserves short road/house numerals like "road 12 34".
 */

const BENGALI_DIGIT_MAP: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

export function scrubPii(rawInput: string): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let text = rawInput.normalize('NFC');
  // 1. Fold Bengali digits to ASCII
  text = text.replace(/[০-৯]/g, (m) => BENGALI_DIGIT_MAP[m] || m);
  // 2. Normalize separators ONLY in 10-13 digit runs
  text = text.replace(/\+?\d(?:[\s\-().+]?\d){9,12}/g, (m) => m.replace(/[\s\-().+]/g, ''));
  // 3. Drop Bangladeshi mobile phone patterns (01[3-9]xxxxxxxx / +8801...)
  text = text.replace(/(?:\+?88)?01[3-9]\d{8}\b/g, ' ');
  // 4. Drop general 9+ consecutive digit runs
  text = text.replace(/\b\d{9,}\b/g, ' ');
  // 5. Drop email patterns
  text = text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

