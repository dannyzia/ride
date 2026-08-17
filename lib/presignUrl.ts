import { supabaseAdmin } from './supabaseServer';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function generatePresignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) {
      logger.error('[presignUrl] failed', { bucket, path, error: error.message });
      return null;
    }
    return data.signedUrl;
  } catch (e: unknown) {
    logger.error('[presignUrl] exception', { bucket, path, error: errors.getErrorMessage(e) });
    return null;
  }
}
