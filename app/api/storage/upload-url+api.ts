// Pre-signed R2 PUT URL issuer (plan: MIgrate File Uploads.md Task 2).
// Stateless except the rate-limit counter → exempt from the Idempotency-Key
// convention (a replayed POST just issues another presigned URL; the client
// PUT is what mutates object state, and keys are unique per request).
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { rateLimitCount } from '@/lib/otpRateLimit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

export const R2_UPLOAD_MAX = 30; // uploads per user per 5-min window

const uploadUrlSchema = z.object({
  filename: z.string().max(200),
  folder: z.enum(['profile', 'documents', 'vehicle']).default('documents'),
  contentType: z
    .enum(['image/jpeg', 'image/png', 'image/webp'])
    .default('image/jpeg'),
});

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function missingR2Env(): string | null {
  const required = [
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'EXPO_PUBLIC_R2_DOMAIN',
  ];
  const missing = required.filter((k) => !process.env[k]);
  return missing.length ? missing.join(',') : null;
}

export async function POST(request: Request) {
  let supabaseUser;
  try {
    supabaseUser = await verifySupabaseToken(request);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      return Response.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    }
    throw err;
  }

  const parsed = await parseJsonBody(request, uploadUrlSchema);
  if (!parsed.ok) return parsed.response;
  const { filename, folder, contentType } = parsed.data;

  const missing = missingR2Env();
  if (missing) {
    logger.error('[upload-url] R2 env missing', { missing });
    return Response.json(
      { error: 'server_misconfigured', message: 'Storage is not configured' },
      { status: 500 },
    );
  }

  // Rate limit: after auth, before any S3 work.
  const count = await rateLimitCount(`r2upload:${supabaseUser.id}`);
  if (count > R2_UPLOAD_MAX) {
    return Response.json(
      { error: 'rate_limited', message: 'Too many uploads. Wait a few minutes.' },
      { status: 429 },
    );
  }

  const sanitizedFilename = filename
    .split('/')
    .pop()
    ?.replace(/[^\w.\-]/g, '_')
    .slice(0, 100) ?? 'file';

  const randomSuffix = randomUUID().substring(0, 8);
  const key = `${folder}/${supabaseUser.id}/${Date.now()}-${randomSuffix}-${sanitizedFilename}`;

  const s3 = new S3Client({
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    CacheControl: CACHE_CONTROL,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  const publicUrl = `${(process.env.EXPO_PUBLIC_R2_DOMAIN ?? '').replace(/\/+$/, '')}/${key}`;

  logger.info('[upload-url] issued', { key, folder });
  return Response.json({ uploadUrl, key, publicUrl });
}
