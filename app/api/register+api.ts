import { z } from 'zod';
import { db } from '../../src/db';
import { users, drivers, usedChallenges } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyChallenge } from '../../lib/jwt';

const schema = z.object({
  challenge_jwt:  z.string(),
  name:           z.string().min(2).max(100),
  role:           z.enum(['rider','driver']),
  vehicle_type:   z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();

  if ('auth_uid' in body || 'phone' in body)
    return Response.json({ error: 'body_field_forbidden' }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'invalid_body' }, { status: 400 });

  const { challenge_jwt, name, role, vehicle_type } = parsed.data;

  let payload: { auth_uid: string; phone: string; jti: string };
  try { payload = verifyChallenge(challenge_jwt); }
  catch { return Response.json({ error: 'invalid_challenge' }, { status: 401 }); }

  try {
    const result = await db.transaction(async (tx) => {
      const [used] = await tx.select().from(usedChallenges).where(eq(usedChallenges.jti, payload.jti));
      if (used) throw { status: 401, error: 'challenge_replayed' };

      const [existing] = await tx.select().from(users).where(eq(users.phone, payload.phone));
      if (existing) throw { status: 409, error: 'phone_exists' };

      const [user] = await tx.insert(users).values({
        auth_uid: payload.auth_uid, phone: payload.phone, name, role,
      }).returning();

      if (role === 'driver') {
        await tx.insert(drivers).values({ user_id: user.id, vehicle_type: vehicle_type as any ?? 'bike_basic', status: 'pending' });
      }

      await tx.insert(usedChallenges).values({ jti: payload.jti, expires_at: new Date(Date.now() + 5*60*1000) });

      return { user_id: user.id, role };
    });

    return Response.json({ ...result, next: role === 'driver' ? '/(main)/(rider)/home' : '/(main)/(customer)/home' }, { status: 201 });
  } catch (e: any) {
    if (e?.status) return Response.json({ error: e.error }, { status: e.status });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
