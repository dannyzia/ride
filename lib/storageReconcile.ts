// Post-upload R2 reconciler (C8-FIX D5-2) — defense in depth behind the
// presign content-length binding. The binding stops signed-URL abuse, but an
// object larger than MAX_UPLOAD_BYTES can still reach the bucket by another
// path (a leaked credential, a future route that forgets the check). This job
// lists recent keys per storage prefix, deletes anything oversized, and
// returns the evidence so the scheduler can flag the uploaders in logs.
//
// Server-only: imports @aws-sdk directly (never import from client code).
// Size comes from ListObjectsV2 itself — no per-object HEAD needed.
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { logger } from './logger';
import { FOLDER_PREFIX, MAX_UPLOAD_BYTES } from './storageFolders';

export interface ReconciledDeletion {
  key: string;
  sizeBytes: number;
  /** uid segment of the key (<prefix>/<uid>/…); empty when unparseable. */
  ownerId: string;
}

export interface ReconcileSummary {
  checked: number;
  deleted: ReconciledDeletion[];
}

const MAX_KEYS_PER_PREFIX = 1000;

function missingR2Env(): string | null {
  const required = [
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ];
  const missing = required.filter((k) => !process.env[k]);
  return missing.length ? missing.join(',') : null;
}

/**
 * One pass over every storage prefix. Returns the summary; throws only on
 * transport failure (the scheduler catches and logs). Missing R2 env is NOT
 * an error — it resolves to a zero summary so local/dev schedulers stay quiet.
 */
export async function reconcileOversizedUploads(): Promise<ReconcileSummary> {
  const missing = missingR2Env();
  if (missing) {
    logger.info('[storage-reconcile] R2 not configured, skipping', { missing });
    return { checked: 0, deleted: [] };
  }

  const s3 = new S3Client({
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const bucket = process.env.R2_BUCKET_NAME!;

  const summary: ReconcileSummary = { checked: 0, deleted: [] };

  for (const prefix of Object.values(FOLDER_PREFIX)) {
    let token: string | undefined;
    do {
      const listed = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${prefix}/`,
          MaxKeys: MAX_KEYS_PER_PREFIX,
          ContinuationToken: token,
        }),
      );
      for (const obj of listed.Contents ?? []) {
        if (obj.Key === undefined) continue;
        summary.checked += 1;
        const size = obj.Size ?? 0;
        if (size <= MAX_UPLOAD_BYTES) continue;
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
        const ownerId = obj.Key.split('/')[1] ?? '';
        summary.deleted.push({ key: obj.Key, sizeBytes: size, ownerId });
        // The flag surface: fraud_flags is driver-scoped with a fixed enum
        // (no upload-abuse type), so oversized-upload abuse is flagged here
        // in structured logs the admin can alert on — not silently dropped.
        logger.warn('[storage-reconcile] deleted oversized object', {
          key: obj.Key,
          sizeBytes: size,
          ownerId,
        });
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  }

  return summary;
}
