// Single owner of the storage contract (R2 migration): the folder ⇄ URL
// mapping, plus every value and rule the signer and the client must agree on.
//
// Ownership story: the presign route decides the folder a key is written
// under, the API routes decide which folders a stored URL may come from, and
// the client decides which folder it asks for. Before this module those three
// were separate literal lists (`z.enum([...])` in the route, a hardcoded
// `r2Prefix` in each endpoint, the caller's `folder` prop) and they drifted:
// the documents endpoint validated with `r2Prefix: 'documents'` while the
// onboarding wizard uploads vehicle documents under `vehicle/`, so every
// vehicle document was rejected at persistence (onboarding step 3 dead).
// This file is now the one place the folder list, its prefixes, and the
// per-endpoint accepted sets live.
//
// It is deliberately DEPENDENCY-FREE: the device bundle imports these values, so
// anything pulled in here ships to the app. The URL validator that consumes these
// policies lives in ./storageUrl.ts (server-only) instead.

/** Folders the uploader may use; also the presign route's Zod enum source. */
export const STORAGE_FOLDERS = ['profile', 'documents', 'vehicle'] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

/**
 * R2 key prefix per folder — read by BOTH the key builder (the presign route)
 * and the URL validator. Changing a value here re-addresses every future
 * upload, so an existing prefix may only be changed with a data migration.
 */
export const FOLDER_PREFIX: Record<StorageFolder, string> = {
  profile: 'profile',
  documents: 'documents',
  vehicle: 'vehicle',
};

export function folderPrefix(folder: StorageFolder): string {
  return FOLDER_PREFIX[folder];
}

/**
 * Folder used when a caller does not name one — the ONE default, read by the
 * presign route, the upload pipeline and the upload card alike. Typed as the
 * literal rather than `StorageFolder` so its membership in STORAGE_FOLDERS (the
 * route's enum) and in DOCUMENT_FOLDERS (the card's accepted set) is a
 * compile-time fact wherever it is used as a default.
 */
export const DEFAULT_STORAGE_FOLDER = 'documents' as const;

/** Legacy Supabase bucket that pre-migration rows still live in. */
export const LEGACY_STORAGE_BUCKET = 'driver-documents';

/**
 * Cache-Control signed into every presigned PUT and sent by the client on the
 * PUT itself. The presign binds that header into the signature, so both sides
 * must send byte-identical values or every upload fails with 403 — one
 * definition here, read by the signer and the client alike.
 */
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Content types the presign route accepts (its Zod enum source) and that the
 * client's compressor may hand to the upload pipeline. One list, so the client
 * cannot compress to a type the route would reject.
 */
export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * R2 key filename rule — the ONE definition, read by the client (which sends
 * the sanitized name to the presign route) and by the route (which applies it
 * again when it builds the key). Both must apply the identical rule: the route
 * used to carry its own copy of the same three operations, so any change to the
 * cap or the character class on one side silently re-named keys on the other.
 * Splits off directory components, replaces anything outside `[\w.\-]` with
 * `_`, and caps the result at 100 characters.
 */
export function sanitizeFilenameBase(name: string): string {
  const base = name.split('/').pop() ?? name;
  return base.replace(/[^\w.\-]/g, '_').slice(0, 100);
}

/**
 * Folders that may hold a driver's verification documents — the policy
 * `/api/driver/documents` validates against, and (through `DocumentFolder`) the
 * set an upload card may target, so a card cannot offer a folder the endpoint
 * would reject. Declared `as const` to keep the names a literal union instead
 * of widening them to `string`.
 */
export const DOCUMENT_FOLDERS = ['documents', 'vehicle'] as const;
/** A folder the documents endpoint accepts — derived here, never restated. */
export type DocumentFolder = (typeof DOCUMENT_FOLDERS)[number];

/** Folders that may hold a driver's profile photo. */
export const PROFILE_FOLDERS: readonly StorageFolder[] = ['profile'];
