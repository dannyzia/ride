// Regression coverage for the storage folder ⇄ URL contract.
//
// The bug this exists to prevent: `/api/driver/documents` validated one
// hardcoded `r2Prefix: 'documents'` while the onboarding wizard uploads vehicle
// documents under `vehicle/`, so every vehicle document was rejected at
// persistence (400 invalid_storage_url) and onboarding step 3 was unpassable.
//
// These are REAL-validator tests (no mocks) against the REAL folder contract,
// so a divergence between the prefix the uploader writes and the prefix the
// endpoint accepts fails here instead of on a device.
import {
  DEFAULT_STORAGE_FOLDER,
  DOCUMENT_FOLDERS,
  FOLDER_PREFIX,
  LEGACY_STORAGE_BUCKET,
  PROFILE_FOLDERS,
  STORAGE_FOLDERS,
  folderPrefix,
  sanitizeFilenameBase,
  type StorageFolder,
} from '../storageFolders';
// The composition lives with the validator (server-side), not in the
// dependency-free contract module that the device bundle imports.
import { isAllowedFolderStorageUrl } from '../storageUrl';

const SUPA = 'https://zzz.supabase.co';
const R2 = 'https://assets.ride.com.bd';
const UID = '11111111-1111-4111-a111-111111111111';
const OTHER_UID = '99999999-9999-4999-8999-999999999999';

const withEnv = (fn: () => void) => {
  const prevSupa = process.env.SUPABASE_URL;
  const prevR2 = process.env.EXPO_PUBLIC_R2_DOMAIN;
  process.env.SUPABASE_URL = SUPA;
  process.env.EXPO_PUBLIC_R2_DOMAIN = R2;
  try {
    fn();
  } finally {
    if (prevSupa === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevSupa;
    if (prevR2 === undefined) delete process.env.EXPO_PUBLIC_R2_DOMAIN;
    else process.env.EXPO_PUBLIC_R2_DOMAIN = prevR2;
  }
};

/** The exact public URL the uploader produces for `folder`:
 *  key = `<prefix>/<uid>/<ts>-<suffix>-<name>` (see the presign route). */
const uploadedUrlFor = (folder: StorageFolder): string =>
  `${R2}/${folderPrefix(folder)}/${UID}/1790064328594-abcdef12-photo.jpg`;

/**
 * Which folders `/api/driver/documents` must accept. Typed as an exhaustive
 * Record so adding a folder to STORAGE_FOLDERS fails `tsc` until someone
 * decides whether the documents endpoint accepts it — the divergence that
 * caused the bug cannot reappear silently.
 */
const DOCUMENT_ENDPOINT_EXPECTATION: Record<StorageFolder, boolean> = {
  documents: true,
  vehicle: true,
  profile: false,
};

/** Same exhaustive guard for `/api/driver/me` (the profile photo). */
const PROFILE_ENDPOINT_EXPECTATION: Record<StorageFolder, boolean> = {
  profile: true,
  documents: false,
  vehicle: false,
};

describe('storage folder contract', () => {
  it('maps every folder to a non-empty prefix, and nothing else', () => {
    expect(Object.keys(FOLDER_PREFIX).sort()).toEqual([...STORAGE_FOLDERS].sort());
    expect(STORAGE_FOLDERS).toContain(DEFAULT_STORAGE_FOLDER);
    for (const folder of STORAGE_FOLDERS) {
      expect(folderPrefix(folder).trim()).not.toBe('');
    }
  });

  it('pins the prefixes: changing one re-addresses uploads and needs a migration', () => {
    expect(FOLDER_PREFIX).toEqual({
      profile: 'profile',
      documents: 'documents',
      vehicle: 'vehicle',
    });
  });
});

describe('/api/driver/documents — accepted folders', () => {
  it('accepts a VEHICLE document uploaded under the vehicle folder (regression)', () => {
    withEnv(() => {
      // The literal URL shape the wizard produces for step 3 documents.
      const url = `${R2}/vehicle/${UID}/1790064328594-abcdef12-reg-front.jpg`;
      expect(DOCUMENT_FOLDERS).toContain('vehicle');
      expect(isAllowedFolderStorageUrl(url, DOCUMENT_FOLDERS, UID)).toBe(true);
    });
  });

  it('accepts the uploaded URL of every folder the endpoint declares', () => {
    withEnv(() => {
      for (const folder of DOCUMENT_FOLDERS) {
        expect(isAllowedFolderStorageUrl(uploadedUrlFor(folder), DOCUMENT_FOLDERS, UID)).toBe(true);
      }
    });
  });

  it('classifies EVERY folder in STORAGE_FOLDERS explicitly (no silent gaps)', () => {
    withEnv(() => {
      for (const folder of STORAGE_FOLDERS) {
        expect({
          folder,
          accepted: isAllowedFolderStorageUrl(uploadedUrlFor(folder), DOCUMENT_FOLDERS, UID),
        }).toEqual({ folder, accepted: DOCUMENT_ENDPOINT_EXPECTATION[folder] });
      }
      // The policy constant and the observed behaviour cannot drift apart.
      expect([...DOCUMENT_FOLDERS].sort()).toEqual(
        STORAGE_FOLDERS.filter((f) => DOCUMENT_ENDPOINT_EXPECTATION[f]).sort(),
      );
    });
  });

  it('still rejects a profile photo stored as verification evidence', () => {
    withEnv(() => {
      expect(isAllowedFolderStorageUrl(uploadedUrlFor('profile'), DOCUMENT_FOLDERS, UID)).toBe(false);
    });
  });
});

describe('/api/driver/me — profile photo folders', () => {
  it('classifies EVERY folder in STORAGE_FOLDERS explicitly', () => {
    withEnv(() => {
      for (const folder of STORAGE_FOLDERS) {
        expect({
          folder,
          accepted: isAllowedFolderStorageUrl(uploadedUrlFor(folder), PROFILE_FOLDERS, UID),
        }).toEqual({ folder, accepted: PROFILE_ENDPOINT_EXPECTATION[folder] });
      }
    });
  });
});

describe('legacy Supabase rows keep validating', () => {
  const legacyUrl = `${SUPA}/storage/v1/object/public/${LEGACY_STORAGE_BUCKET}/uid123/license.jpg`;

  it('accepts a legacy URL on both endpoints (bucket carries the path, not a folder)', () => {
    withEnv(() => {
      expect(isAllowedFolderStorageUrl(legacyUrl, DOCUMENT_FOLDERS, UID)).toBe(true);
      expect(isAllowedFolderStorageUrl(legacyUrl, PROFILE_FOLDERS, UID)).toBe(true);
    });
  });

  it('rejects a legacy URL from another bucket', () => {
    withEnv(() => {
      const other = `${SUPA}/storage/v1/object/public/other-bucket/uid123/x.jpg`;
      expect(isAllowedFolderStorageUrl(other, DOCUMENT_FOLDERS, UID)).toBe(false);
    });
  });
});

describe('host + owner hardening survives the folder helper', () => {
  it('rejects another user\'s folder path', () => {
    withEnv(() => {
      const elsewhere = `${R2}/documents/${OTHER_UID}/1790-abcdef12-x.jpg`;
      expect(isAllowedFolderStorageUrl(elsewhere, DOCUMENT_FOLDERS, UID)).toBe(false);
    });
  });

  it('rejects foreign, suffix-spoofed and non-https hosts', () => {
    withEnv(() => {
      const cases = [
        `https://evil.com/documents/${UID}/x.jpg`,
        `https://evil.com/assets.ride.com.bd/documents/${UID}/x.jpg`,
        `http://assets.ride.com.bd/documents/${UID}/x.jpg`,
        `https://assets.ride.com.bd:8443/documents/${UID}/x.jpg`,
      ];
      for (const url of cases) {
        expect(isAllowedFolderStorageUrl(url, DOCUMENT_FOLDERS, UID)).toBe(false);
      }
    });
  });

  it('rejects everything when no folder is declared (caller error, not a wildcard)', () => {
    withEnv(() => {
      expect(isAllowedFolderStorageUrl(uploadedUrlFor('documents'), [], UID)).toBe(false);
    });
  });
});

// The uploader sanitizes the name it sends and the presign route applies the
// same rule again when building the key, so the rule has to be the same one.
// These pin its exact output — a changed cap, a changed character class or a
// dropped step fails here instead of silently re-naming keys.
describe('sanitizeFilenameBase — the single filename rule', () => {
  it('drops directory components', () => {
    expect(sanitizeFilenameBase('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilenameBase('a/b/c/photo.png')).toBe('photo.png');
  });

  it('replaces anything outside [\\w.\\-] with an underscore', () => {
    expect(sanitizeFilenameBase('my photo (1).jpg')).toBe('my_photo__1_.jpg');
    expect(sanitizeFilenameBase('  spaced  name.jpg  ')).toBe('__spaced__name.jpg__');
  });

  it('is ASCII-safe for unicode names', () => {
    expect(sanitizeFilenameBase('ছবি (1).JPG')).toBe('_____1_.JPG');
  });

  it('caps at 100 characters and leaves shorter names untouched', () => {
    expect(sanitizeFilenameBase('z'.repeat(101))).toBe('z'.repeat(100));
    expect(sanitizeFilenameBase(`a/b/${'y'.repeat(150)}`)).toBe('y'.repeat(100));
    expect(sanitizeFilenameBase('short.jpg')).toBe('short.jpg');
  });

  it('returns an empty string for an empty name (the route keeps its fallback)', () => {
    expect(sanitizeFilenameBase('')).toBe('');
    expect(sanitizeFilenameBase('dir/')).toBe('');
  });

  it('is idempotent, so re-applying it in the route cannot change the name', () => {
    const names = [
      'my photo (1).jpg',
      'ছবি (1).JPG',
      `a/b/${'y'.repeat(150)}`,
      '',
      '../../etc/passwd',
    ];
    for (const name of names) {
      const once = sanitizeFilenameBase(name);
      expect(sanitizeFilenameBase(once)).toBe(once);
    }
  });
});
