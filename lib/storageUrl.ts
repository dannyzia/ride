// Server-side validation that a client-supplied upload URL actually belongs
// to this project's Supabase storage. Documents and profile images are the
// verification evidence the admin trusts — accepting `z.string().url()` from
// any host lets a driver point the admin at arbitrary external content.
// See C3a: spoofable document URLs.

const STORAGE_PATH_PREFIX = "/storage/v1/object/public/";

/**
 * True when `url` is served from this project's own Supabase storage.
 * Bucket is optional — pass it when the caller requires a specific bucket.
 */
export function isAllowedStorageUrl(
  url: string,
  bucket?: string,
): boolean {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!supabaseUrl) {
    // No server URL configured — be conservative and reject everything rather
    // than accidentally allow-listing arbitrary hosts.
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const storageHost = new URL(supabaseUrl).host;
  if (parsed.host !== storageHost) return false;

  const path = parsed.pathname;
  if (!path.startsWith(STORAGE_PATH_PREFIX)) return false;

  if (bucket) {
    const rest = path.slice(STORAGE_PATH_PREFIX.length);
    if (!rest.startsWith(`${bucket}/`)) return false;
  }

  return true;
}
