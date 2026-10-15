/**
 * Audit trail writer (§7 A3) — the ONE shared audit_logs insert for admin
 * decisions. Extracted from lib/roleVerification.ts (which carried a private
 * copy since S2) so the S7 queues do not grow a second shape.
 *
 * Rules:
 * - audit_logs is append-only (no updated_at) — one insert, never an update.
 * - actor + entity + old/new value + request meta (ip, user agent).
 * - A failed audit write is LOUD but does not roll back the decision it
 *   describes: §7 A3 is a compliance trail, and a decision that already
 *   committed is worse to lose than a missing log line (the caller keeps its
 *   own copy of the intent). Callers that must be atomic about it pass `tx`.
 */
import { db } from '@/src/db';
import { auditLogs } from '@/src/db/schema';
import { logger } from '@/lib/logger';

export interface WriteAuditParams {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(params: WriteAuditParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actor_user_id: params.adminUserId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      old_value: params.oldValue,
      new_value: params.newValue,
      ip_address: params.ip ?? null,
      user_agent: params.userAgent ?? null,
    });
  } catch (auditErr) {
    // The decision itself must not be rolled back by an audit write failure,
    // but it is loud: this is the compliance trail §7 A3 names.
    logger.error('[auditLog] audit_logs write failed', auditErr, {
      action: params.action,
      entity_id: params.entityId,
    });
  }
}
