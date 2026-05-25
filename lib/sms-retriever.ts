export function getSmsRetrieverHash(): string {
  return 'RIDE_APP_HASH_PLACEHOLDER';
}

export function parseOtpFromMessage(message: string): string | null {
  const match = message.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}
