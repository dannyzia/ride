// Unit tests for lib/storageUrl.ts (R2 migration Task 9) — the C3a validator.
// Covers both branches (legacy Supabase + R2), host hardening, port
// normalization, and prefix/owner scoping.
import { isAllowedStorageUrl } from '../storageUrl';

const SUPA = 'https://zzz.supabase.co';
const R2 = 'https://assets.ride.com.bd';

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

describe('isAllowedStorageUrl — legacy Supabase branch', () => {
  it('accepts a legacy public storage URL for the required bucket', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(
          `${SUPA}/storage/v1/object/public/driver-documents/uid123/license.jpg`,
          { bucket: 'driver-documents' },
        ),
      ).toBe(true);
    });
  });

  it('rejects a legacy URL from the wrong bucket when bucket is passed', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(
          `${SUPA}/storage/v1/object/public/other-bucket/uid123/x.jpg`,
          { bucket: 'driver-documents' },
        ),
      ).toBe(false);
    });
  });

  it('legacy branch ignores ownerId (legacy rows exist under anonymous/)', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(
          `${SUPA}/storage/v1/object/public/driver-documents/anonymous/x.jpg`,
          { bucket: 'driver-documents', ownerId: 'someone-else' },
        ),
      ).toBe(true);
    });
  });

  it('rejects non-storage paths on the Supabase host', () => {
    withEnv(() => {
      expect(isAllowedStorageUrl(`${SUPA}/rest/v1/users`, { bucket: 'b' })).toBe(false);
    });
  });
});

describe('isAllowedStorageUrl — R2 branch', () => {
  const r2Url = (path: string) => `${R2}${path}`;

  it('accepts an R2 URL scoped to the prefix and owner', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(r2Url('/documents/user-1/170000-abcd-license.jpg'), {
          r2Prefix: 'documents',
          ownerId: 'user-1',
        }),
      ).toBe(true);
    });
  });

  it('rejects a foreign host', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl('https://evil.com/documents/user-1/x.jpg', {
          r2Prefix: 'documents',
          ownerId: 'user-1',
        }),
      ).toBe(false);
    });
  });

  it('rejects suffix-host spoofing (evil.com/assets.ride.com.bd)', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(
          'https://evil.com/assets.ride.com.bd/documents/user-1/x.jpg',
          { r2Prefix: 'documents', ownerId: 'user-1' },
        ),
      ).toBe(false);
    });
  });

  it('rejects http scheme on the R2 host', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(
          'http://assets.ride.com.bd/documents/user-1/x.jpg',
          { r2Prefix: 'documents', ownerId: 'user-1' },
        ),
      ).toBe(false);
    });
  });

  it('rejects non-default port :8443', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(
          'https://assets.ride.com.bd:8443/documents/user-1/x.jpg',
          { r2Prefix: 'documents', ownerId: 'user-1' },
        ),
      ).toBe(false);
    });
  });

  it('accepts :443 (WHATWG normalizes default port away)', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(
          'https://assets.ride.com.bd:443/documents/user-1/x.jpg',
          { r2Prefix: 'documents', ownerId: 'user-1' },
        ),
      ).toBe(true);
    });
  });

  it('rejects ownerId mismatch (another user’s object)', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(r2Url('/documents/user-2/x.jpg'), {
          r2Prefix: 'documents',
          ownerId: 'user-1',
        }),
      ).toBe(false);
    });
  });

  it('rejects r2Prefix mismatch (profile/ URL checked as documents/)', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(r2Url('/profile/user-1/x.jpg'), {
          r2Prefix: 'documents',
          ownerId: 'user-1',
        }),
      ).toBe(false);
    });
  });

  it('trailing-slash r2Prefix still matches', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(r2Url('/documents/user-1/x.jpg'), {
          r2Prefix: 'documents/',
          ownerId: 'user-1',
        }),
      ).toBe(true);
    });
  });

  it('rejects empty/whitespace r2Prefix (caller error, not a widening)', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(r2Url('/anything/user-1/x.jpg'), {
          r2Prefix: '',
          ownerId: 'user-1',
        }),
      ).toBe(false);
      expect(
        isAllowedStorageUrl(r2Url('/anything/user-1/x.jpg'), {
          r2Prefix: '   ',
          ownerId: 'user-1',
        }),
      ).toBe(false);
    });
  });

  it('rejects prefix-only path with no owner segment', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl(r2Url('/documents'), { r2Prefix: 'documents' }),
      ).toBe(false);
    });
  });
});

describe('isAllowedStorageUrl — structural rejects', () => {
  it('rejects garbage URLs', () => {
    withEnv(() => {
      expect(isAllowedStorageUrl('not a url')).toBe(false);
      expect(isAllowedStorageUrl('')).toBe(false);
    });
  });

  it('rejects everything when neither branch host matches', () => {
    withEnv(() => {
      expect(
        isAllowedStorageUrl('https://random.example.com/a/b.jpg', {
          bucket: 'driver-documents',
          r2Prefix: 'documents',
          ownerId: 'user-1',
        }),
      ).toBe(false);
    });
  });
});
