import { db } from '@/src/db';
import { userDevices, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const broadcastSchema = z.object({
  target: z.enum(['all', 'rider', 'driver']),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
});

let lastBroadcastAt = 0;

async function sendBatch(tokens: string[], title: string, body: string): Promise<{ ok: number; fail: number }> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: tokens, title, body, sound: "default", priority: "high", data: { type: "broadcast" } }),
    });
    const result = await res.json();
    const data = Array.isArray(result.data) ? result.data : [result.data];
    let ok = 0, fail = 0;
    for (const d of data) {
      if (d?.status === "error") fail++;
      else ok++;
    }
    return { ok, fail };
  } catch {
    return { ok: 0, fail: tokens.length };
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('admin')(request);

    const now = Date.now();
    if (now - lastBroadcastAt < 300_000) {
      return Response.json({ error: 'rate_limited', message: 'Broadcast cooldown is 5 minutes' }, { status: 429 });
    }
    lastBroadcastAt = now;

    const parsed = await parseJsonBody(request, broadcastSchema);
    if (!parsed.ok) return parsed.response;

    const { target, title, message } = parsed.data;

    const allDevices = await db
      .select({ push_token: userDevices.push_token, user_id: userDevices.user_id })
      .from(userDevices);

    const allUsers = target !== 'all'
      ? await db.select({ id: users.id }).from(users).where(eq(users.role, target))
      : null;
    const targetUserIds = allUsers ? new Set(allUsers.map((u) => u.id)) : null;

    const filtered = targetUserIds
      ? allDevices.filter((d) => targetUserIds.has(d.user_id))
      : allDevices;

    const tokens = [...new Set(filtered.map((d) => d.push_token))];
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));

    const results = await Promise.allSettled(chunks.map((c) => sendBatch(c, title, message)));
    const sent = results.reduce((acc, r) => r.status === "fulfilled" ? acc + r.value.ok : acc, 0);
    const failed = results.reduce((acc, r) => r.status === "fulfilled" ? acc + r.value.fail : acc + (r.status === "rejected" ? 100 : 0), 0);

    logger.info('[admin/broadcast] done', { target, sent, failed, total: tokens.length });
    return Response.json({ success: true, sent, failed, total: tokens.length });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/broadcast] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
