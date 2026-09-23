// Client-side compression engine for R2 uploads (plan: MIgrate File Uploads.md
// Task 1). Guarantees no image > 2 MB is ever handed to the upload pipeline.
// Format normalization: any source mime outside ALLOWED_MEDIA_TYPES (HEIC, GIF,
// BMP, TIFF…) is converted to JPEG. That is deliberately the SAME list the presign
// route accepts, so the client cannot produce a type the route rejects — which
// makes adding a member a two-sided change: the client would start passing that
// type through UNCHANGED instead of normalizing it. That switch is pinned as a
// deliberate decision by the passthrough-set tests in
// lib/__tests__/imageCompress.test.ts, so a new member fails there first, not on a
// device. A large WebP is recompressed to JPEG (not WebP) because the final
// contentType must reflect the actual bytes.
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from './logger';
import { ALLOWED_MEDIA_TYPES } from './storageFolders';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Tunable, verify on device.
export const COMPRESS_PASS_1 = { width: 1200, compress: 0.75 };
export const COMPRESS_PASS_2 = { width: 800, compress: 0.65 };

// Widened to Set<string> so the `.has(mime)` check type-checks against the
// shared literal list.
const ALLOWED_MIMES: ReadonlySet<string> = new Set<string>(ALLOWED_MEDIA_TYPES);

export class ImageCompressError extends Error {}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function sniffMime(uri: string, mimeType?: string): string | undefined {
  if (mimeType) return mimeType;
  const ext = (uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
  return EXT_MIME[ext];
}

/**
 * Compress if needed and return the FINAL byte descriptor.
 * `contentType` always reflects the actual bytes that will be PUT.
 */
export async function compressIfNeeded(
  uri: string,
  mimeType?: string,
): Promise<{ uri: string; sizeBytes: number; contentType: string }> {
  try {
    let mime = sniffMime(uri, mimeType);

    // Generalized HEIC rule: non-allowed mime → convert to JPEG regardless of
    // size (a small GIF would pass the picker then 400 at the server).
    if (!mime || !ALLOWED_MIMES.has(mime)) {
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: COMPRESS_PASS_1.compress, format: ImageManipulator.SaveFormat.JPEG },
      );
      const info = await FileSystem.getInfoAsync(out.uri);
      if (!info.exists) throw new Error('compressed output missing');
      return { uri: out.uri, sizeBytes: info.size ?? 0, contentType: 'image/jpeg' };
    }

    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) throw new Error('source file missing');
    const size = info.size ?? 0;

    // Already small and allowed → passthrough with the ORIGINAL mime.
    if (size <= MAX_UPLOAD_BYTES) {
      return { uri, sizeBytes: size, contentType: mime };
    }

    // Large allowed mime → Pass 1 (JPEG), re-check, Pass 2 if needed.
    let current = uri;
    let currentSize = size;
    for (const pass of [COMPRESS_PASS_1, COMPRESS_PASS_2]) {
      const out = await ImageManipulator.manipulateAsync(
        current,
        [{ resize: { width: pass.width } }],
        { compress: pass.compress, format: ImageManipulator.SaveFormat.JPEG },
      );
      const outInfo = await FileSystem.getInfoAsync(out.uri);
      if (!outInfo.exists) throw new Error('compressed output missing');
      current = out.uri;
      currentSize = outInfo.size ?? 0;
      if (currentSize <= MAX_UPLOAD_BYTES) break;
    }

    if (currentSize > MAX_UPLOAD_BYTES) {
      throw new ImageCompressError('Image could not be compressed under 2MB — try another photo');
    }

    return { uri: current, sizeBytes: currentSize, contentType: 'image/jpeg' };
  } catch (err) {
    if (err instanceof ImageCompressError) throw err;
    logger.error('[imageCompress] failed', err);
    throw new ImageCompressError('Could not process image — try another photo');
  }
}
