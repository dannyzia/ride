// [public]
import { z } from 'zod';
import { db } from '../../src/db';
import { users, drivers } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '../../lib/supabaseServer';

const schema = z.object({
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

  const { name, role, vehicle_type } = parsed.data;

  // Verify Supabase session
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: 'missing_token' }, { status: 401 });
  }

  const { data: { user: supabaseUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !supabaseUser) {
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }

  const phone = supabaseUser.phone ?? '';
  const authUid = supabaseUser.id;

  if (!phone) {
    return Response.json({ error: 'phone_required' }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.phone, phone));
      if (existing) throw { status: 409, error: 'phone_exists' };

      const [user] = await tx.insert(users).values({
        auth_uid: authUid,
        phone,
        name,
        role,
      }).returning();

      if (role === 'driver') {
        await tx.insert(drivers).values({
          user_id: user.id,
          vehicle_type: (vehicle_type as any) ?? 'bike_basic',
          status: 'pending',
        });
      }

      return { user_id: user.id, role };
    });

    return Response.json({
      ...result,
      next: role === 'driver' ? '/(main)/(rider)/home' : '/(main)/(customer)/home',
    }, { status: 201 });
  } catch (e: any) {
    if (e?.status) return Response.json({ error: e.error }, { status: e.status });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
