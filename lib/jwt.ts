import jwt from 'jsonwebtoken';
const SECRET = () => process.env.FUNCTIONS_JWT_SECRET!;

export function signChallenge(payload: { auth_uid: string; phone: string; jti: string }): string {
  return jwt.sign(payload, SECRET(), { algorithm: 'HS256', expiresIn: '5m' });
}

export function verifyChallenge(token: string): { auth_uid: string; phone: string; jti: string } {
  return jwt.verify(token, SECRET()) as any;
}
