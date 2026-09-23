// R2 upload pipeline (plan: MIgrate File Uploads.md Task 3).
// compress → presign (our API) → PUT to R2 with retry. The two 429 sources are
// structurally separate: a 429 from OUR presign route surfaces to the user and
// never reaches the PUT loop; a 429 the PUT itself receives is retried
// alongside network errors and 5xx.
import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { logger } from './logger';
import { compressIfNeeded } from './imageCompress';
import {
  CACHE_CONTROL,
  DEFAULT_STORAGE_FOLDER,
  sanitizeFilenameBase,
  type StorageFolder,
} from './storageFolders';

type UploadFolder = StorageFolder;

const PUT_RETRY_ATTEMPTS = 3;

export async function uploadImageToR2({
  localUri,
  folder = DEFAULT_STORAGE_FOLDER,
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

  // PUT to R2 with bounded retry (network errors, 5xx, and 429 — including
  // R2's own throttling).
  let lastError: unknown;
  for (let attempt = 0; attempt < PUT_RETRY_ATTEMPTS; attempt++) {
    try {
      const put = await FileSystem.uploadAsync(uploadUrl, compressed.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        // Both headers are signature-bound by the presign route: sending a
        // different value is rejected by R2 (403 SignatureDoesNotMatch), so they
        // must match what it signed — contentType as requested, and the same
        // immutable CACHE_CONTROL value the route uses.
        headers: {
          'Content-Type': compressed.contentType,
          'Cache-Control': CACHE_CONTROL,
        },
      });
      if (put.status < 200 || put.status >= 300) {
        // Normalize into a typed error; retryability is decided ONCE below,
        // from the status. The PUT target is always the presigned R2 URL, so a
        // URL-host predicate here would only ever compare the destination with
        // itself — the decision is status-driven, not host-driven.
        throw Object.assign(new Error(`Upload failed (${put.status})`), {
          status: put.status,
        });
      } else {
        logger.info('[storage] uploaded to R2', { key, sizeBytes: compressed.sizeBytes });
        return { publicUrl, key, fileSizeBytes: compressed.sizeBytes };
      }
    } catch (err) {
      // The single owner of the retry decision: retry by status (network error
      // or 5xx/429), stop on anything else — notably a 403, which means the
      // PUT's signature-bound headers differ from what the presign route signed.
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
