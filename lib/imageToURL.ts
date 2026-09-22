// R2 upload pipeline (plan: MIgrate File Uploads.md Task 3).
// compress → presign (our API) → PUT to R2 with retry. The two 429 sources are
// structurally separate: a 429 from OUR presign route surfaces to the user and
// is never retried; only the R2 PUT (network/5xx/R2-429) is retried here.
import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { logger } from './logger';
import { compressIfNeeded, sanitizeFilenameBase } from './imageCompress';

export type UploadFolder = 'profile' | 'documents' | 'vehicle';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PUT_RETRY_ATTEMPTS = 3;

export async function uploadImageToR2({
  localUri,
  folder = 'documents',
  fileName,
  mimeType,
}: {
  localUri: string;
  folder?: UploadFolder;
  fileName: string;
  mimeType?: string;
}): Promise<{ publicUrl: string; key: string; fileSizeBytes: number }> {
  const compressed = await compressIfNeeded(localUri, mimeType);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw Object.assign(new Error('Not authenticated'), { status: 401 });
  }

  // Presign (outside the retry loop — our 429 must surface, not retry).
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SERVER_URL}/api/storage/upload-url`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: sanitizeFilenameBase(fileName),
        folder,
        contentType: compressed.contentType,
      }),
    },
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw Object.assign(
        new Error('Too many uploads. Wait a few minutes.'),
        { status: 429 },
      );
    }
    const body = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw Object.assign(
      new Error(body?.message ?? 'Could not start upload'),
      { status: response.status },
    );
  }

  const { uploadUrl, key, publicUrl } = (await response.json()) as {
    uploadUrl: string;
    key: string;
    publicUrl: string;
  };

  // PUT to R2 with bounded retry (network errors, 5xx, R2-sourced 429 only).
  let lastError: unknown;
  for (let attempt = 0; attempt < PUT_RETRY_ATTEMPTS; attempt++) {
    try {
      const put = await FileSystem.uploadAsync(uploadUrl, compressed.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': compressed.contentType,
          'Cache-Control': CACHE_CONTROL,
        },
      });
      if (put.status < 200 || put.status >= 300) {
        const status = put.status;
        const r2Host = (process.env.EXPO_PUBLIC_R2_DOMAIN ?? '').replace(/^https?:\/\//, '');
        const isR2Host = uploadUrl.includes(r2Host);
        const retryable = status >= 500 || (status === 429 && isR2Host);
        if (!retryable || attempt === PUT_RETRY_ATTEMPTS - 1) {
          throw Object.assign(new Error(`Upload failed (${status})`), { status });
        }
        lastError = Object.assign(new Error(`Upload failed (${status})`), { status });
      } else {
        logger.info('[storage] uploaded to R2', { key, sizeBytes: compressed.sizeBytes });
        return { publicUrl, key, fileSizeBytes: compressed.sizeBytes };
      }
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      const retryable = err == null || status === undefined || status >= 500 || status === 429;
      if (!retryable || attempt === PUT_RETRY_ATTEMPTS - 1) break;
    }
    await new Promise((r) =>
      setTimeout(r, 500 * (attempt + 1) + Math.floor(Math.random() * 250)),
    );
  }

  logger.error('[storage] upload failed after retries', lastError);
  throw lastError instanceof Error
    ? lastError
    : new Error('Upload failed');
}
