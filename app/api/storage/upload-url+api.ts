// Pre-signed R2 PUT URL issuer (plan: MIgrate File Uploads.md Task 2).
// The URL is signed for `host` PLUS `Content-Type` and `Cache-Control`, so the
// stored object's metadata is decided by this route: a PUT that sends different
// values for those two headers is rejected by R2 (403 SignatureDoesNotMatch).
// The client must therefore send exactly the headers that were signed
// (plan Task 3.4).
// Stateless except the rate-limit counter → exempt from the Idempotency-Key
// convention (a replayed POST just issues another presigned URL; the client
// PUT is what mutates object state, and keys are unique per request).
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { rateLimitCount } from '@/lib/otpRateLimit';
import {
  ALLOWED_MEDIA_TYPES,
  CACHE_CONTROL,
  DEFAULT_STORAGE_FOLDER,
  STORAGE_FOLDERS,
  folderPrefix,
  sanitizeFilenameBase,
} from '@/lib/storageFolders';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
export const R2_UPLOAD_MAX = 30; // uploads per user per 5-min window

const uploadUrlSchema = z.object({
  filename: z.string().max(200),
  folder: z.enum(STORAGE_FOLDERS).default(DEFAULT_STORAGE_FOLDER),
  contentType: z.enum(ALLOWED_MEDIA_TYPES).default('image/jpeg'),
});
// Headers to bind into the signature. Without this the presigner signs only
// `host`, leaving ContentType/CacheControl advisory — a caller could PUT any
// content type and omit the immutable Cache-Control.
const SIGNED_PUT_HEADERS = new Set(['content-type', 'cache-control']);

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
  const { filename, contentType } = parsed.data;
  // Zod's .default() fills this at runtime; parseJsonBody types the body via
  // z.ZodType<T>, so a defaulted field still reads as optional here.
  const folder = parsed.data.folder ?? DEFAULT_STORAGE_FOLDER;

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

  // The same rule the uploader applied before sending the name; the fallback is
  // unreachable for a string input (the shared sanitizer always returns one) and
  // is kept so the route's key contract is unchanged.
  const sanitizedFilename = sanitizeFilenameBase(filename) ?? 'file';

  // Node's global crypto, not expo-crypto's randomUUID(): this route is served
  // from the web-platform bundle, where expo-crypto resolves to `window.crypto`
  // and `window` does not exist on the server (it threw on every request).
  // Same source the other API routes use to mint references.
  const randomSuffix = crypto.randomUUID().substring(0, 8);
  const key = `${folderPrefix(folder)}/${supabaseUser.id}/${Date.now()}-${randomSuffix}-${sanitizedFilename}`;

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

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: 300,
    signableHeaders: SIGNED_PUT_HEADERS,
  });
  const publicUrl = `${(process.env.EXPO_PUBLIC_R2_DOMAIN ?? '').replace(/\/+$/, '')}/${key}`;

  logger.info('[upload-url] issued', { key, folder });
  return Response.json({ uploadUrl, key, publicUrl });
}
