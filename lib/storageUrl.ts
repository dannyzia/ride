// Server-side validation that a client-supplied upload URL actually belongs
// to this project's storage (C3a: spoofable document URLs). Two branches:
//   legacy — Supabase storage public URLs (exact host + /storage/v1/... prefix)
//   R2     — exact EXPO_PUBLIC_R2_DOMAIN host + folder-prefix + owner scoping
// Legacy rows exist under an `anonymous/` uid fallback, so the legacy branch
// deliberately does NOT enforce ownerId.
//
// Also exports the folder-policy composition the driver endpoints use. It lives
// here rather than in lib/storageFolders.ts so that module can stay
// dependency-free (the device bundle imports its values).
import {
  LEGACY_STORAGE_BUCKET,
  folderPrefix,
  type StorageFolder,
} from './storageFolders';

const STORAGE_PATH_PREFIX = "/storage/v1/object/public/";

interface StorageUrlOptions {
  /** legacy Supabase bucket path check (e.g. 'driver-documents') */
  bucket?: string;
  /** required path prefix on the R2 branch (e.g. 'documents') */
  r2Prefix?: string;
  /** R2-only: path segment after the prefix must equal this */
  ownerId?: string;
}

/**
 * True when `url` is served from our own storage. Pass `opts.bucket` to
 * require a specific legacy Supabase bucket; pass `opts.r2Prefix` (+
 * `opts.ownerId`) to scope R2 URLs. When both are passed the legacy branch is
 * evaluated first.
 */
export function isAllowedStorageUrl(
  url: string,
  opts?: StorageUrlOptions,
): boolean {
  const options: StorageUrlOptions = opts ?? {};

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // https: for BOTH branches (native enforces strict TLS; http is a downgrade).
  if (parsed.protocol !== 'https:') return false;

  // ── Legacy Supabase branch ────────────────────────────────────────────────
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (supabaseUrl) {
    const storageHost = new URL(supabaseUrl).host;
    if (parsed.host === storageHost) {
      const path = parsed.pathname;
      if (!path.startsWith(STORAGE_PATH_PREFIX)) return false;
      if (options.bucket) {
        const rest = path.slice(STORAGE_PATH_PREFIX.length);
        if (!rest.startsWith(`${options.bucket}/`)) return false;
      }
      // Deliberately no ownerId check here (legacy anonymous/ rows).
      return true;
    }
  }

  // ── R2 branch ─────────────────────────────────────────────────────────────
  const r2Domain = (process.env.EXPO_PUBLIC_R2_DOMAIN ?? "").replace(/\/+$/, "");
  if (!r2Domain) return false;
  let r2Host: string;
  try {
    r2Host = new URL(r2Domain).host;
  } catch {
    return false;
  }

  // Exact host equality (URL.host includes non-default ports, so :8443
  // rejects automatically; :443 is normalized away by WHATWG parsing).
  if (parsed.host !== r2Host) return false;

  // An empty/whitespace r2Prefix is a caller error — reject rather than
  // silently widening the check to "path starts with /".
  const rawPrefix = options.r2Prefix ?? '';
  const prefix = rawPrefix.replace(/\/+$/, '');
  if (!prefix) return false;

  const path = parsed.pathname;
  if (!path.startsWith(`/${prefix}/`)) return false;

  if (options.ownerId !== undefined) {
    // pathname always carries a leading slash: /<prefix>/<owner>/...
    const rest = path.slice(prefix.length + 2);
    const owner = rest.split('/')[0];
    if (owner !== options.ownerId) return false;
  }

  return true;
}

/**
 * True when `url` is a Ride-owned storage URL for one of `folders` — or for the
 * legacy Supabase bucket, which carries the bucket in its path rather than a
 * folder prefix, so it matches on any folder iteration and is deliberately not
 * owner-scoped (legacy rows exist under an `anonymous/` fallback uid).
 *
 * Composes `isAllowedStorageUrl` once per allowed folder so that validator stays
 * single-prefix and keeps its proven host/owner hardening.
 */
export function isAllowedFolderStorageUrl(
  url: string,
  folders: readonly StorageFolder[],
  ownerId: string,
): boolean {
  return folders.some((folder) =>
    isAllowedStorageUrl(url, {
      bucket: LEGACY_STORAGE_BUCKET,
      r2Prefix: folderPrefix(folder),
      ownerId,
    }),
  );
}
