import * as crypto from 'crypto';
const SECRET = () => (require('firebase-functions').config().hmac?.secret as string | undefined)
  ?? process.env.HMAC_SECRET ?? (() => { throw new Error('hmac.secret not configured'); })();

export function generateSessionCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}
