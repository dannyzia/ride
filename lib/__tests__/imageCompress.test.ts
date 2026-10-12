/* eslint-disable import/first -- mocks must be declared before the imports */
// Unit tests for lib/imageCompress.ts (R2 migration Task 9).
// expo-file-system / expo-image-manipulator are mocked; assertions cover the
// format-normalization matrix, both compression passes, and surfaced failures.
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'JPEG', PNG: 'PNG', WEBP: 'WEBP' },
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { compressIfNeeded, MAX_UPLOAD_BYTES, ImageCompressError } from '../imageCompress';
import { ALLOWED_MEDIA_TYPES } from '../storageFolders';

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const manipulateAsync = ImageManipulator.manipulateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('compressIfNeeded — passthrough', () => {
  it('small JPEG passes through unchanged with original mime', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 500_000 });
    const out = await compressIfNeeded('file:///tmp/photo.jpg');
    expect(out).toEqual({
      uri: 'file:///tmp/photo.jpg',
      sizeBytes: 500_000,
      contentType: 'image/jpeg',
    });
    expect(manipulateAsync).not.toHaveBeenCalled();
  });

  it('small PNG passes through with image/png (final bytes = original)', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 100_000 });
    const out = await compressIfNeeded('file:///tmp/scan.png', 'image/png');
    expect(out.contentType).toBe('image/png');
    expect(manipulateAsync).not.toHaveBeenCalled();
  });

  it('small WebP passes through with image/webp', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 300_000 });
    const out = await compressIfNeeded('file:///tmp/pic.webp', 'image/webp');
    expect(out.contentType).toBe('image/webp');
    expect(manipulateAsync).not.toHaveBeenCalled();
  });

  it('uses picker mimeType over extension sniff', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 10 });
    const out = await compressIfNeeded('file:///tmp/noext', 'image/png');
    expect(out.contentType).toBe('image/png');
  });
});

describe('compressIfNeeded — format normalization (non-allowed mime)', () => {
  it('converts HEIC to WebP regardless of size', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 50_000 });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/conv.webp' });
    const out = await compressIfNeeded('file:///tmp/IMG_0001.heic', 'image/heic');
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file:///tmp/IMG_0001.heic',
      [],
      expect.objectContaining({ format: ImageManipulator.SaveFormat.WEBP }),
    );
    expect(out.contentType).toBe('image/webp');
    expect(out.uri).toBe('file:///tmp/conv.webp');
  });

  it('converts small GIF to WebP (first frame), not an error', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 20_000 });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/gif.webp' });
    const out = await compressIfNeeded('file:///tmp/anim.gif', 'image/gif');
    expect(out.contentType).toBe('image/webp');
  });

  it('treats unknown mime as unsupported and normalizes to WebP', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 10 });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/x.webp' });
    const out = await compressIfNeeded('file:///tmp/mystery.bin');
    expect(out.contentType).toBe('image/webp');
  });
});

describe('compressIfNeeded — compression passes', () => {
  it('large JPEG: pass 1 brings it under 2MB, final encode emits WebP', async () => {
    let call = 0;
    getInfoAsync.mockImplementation(async () => {
      call += 1;
      // 1st: source 3MB; 2nd: pass-1 output 1MB; 3rd: final WebP output
      return call === 1
        ? { exists: true, size: 3 * 1024 * 1024 }
        : call === 2
          ? { exists: true, size: 1024 * 1024 }
          : { exists: true, size: 700_000 };
    });
    manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///tmp/p1.jpeg' })
      .mockResolvedValueOnce({ uri: 'file:///tmp/p1.webp' });
    const out = await compressIfNeeded('file:///tmp/big.jpg');
    expect(manipulateAsync).toHaveBeenCalledTimes(2);
    // Intermediate pass stays JPEG (no compounding WebP generations)…
    expect(manipulateAsync).toHaveBeenNthCalledWith(
      1,
      'file:///tmp/big.jpg',
      [{ resize: { width: 1200 } }],
      expect.objectContaining({ compress: 0.75, format: 'JPEG' }),
    );
    // …and the FINAL encode converts to WebP exactly once, no further resize.
    expect(manipulateAsync).toHaveBeenNthCalledWith(
      2,
      'file:///tmp/p1.jpeg',
      [],
      expect.objectContaining({ compress: 0.65, format: 'WEBP' }),
    );
    expect(out).toEqual({
      uri: 'file:///tmp/p1.webp',
      sizeBytes: 700_000,
      contentType: 'image/webp',
    });
  });

  it('still-too-large after pass 1 runs pass 2 (width 800, 0.65) then emits WebP', async () => {
    let call = 0;
    getInfoAsync.mockImplementation(async () => {
      call += 1;
      if (call === 1) return { exists: true, size: 4 * 1024 * 1024 }; // source
      if (call === 2) return { exists: true, size: 2_500_000 }; // pass 1
      if (call === 3) return { exists: true, size: 1_500_000 }; // pass 2
      return { exists: true, size: 1_100_000 }; // final WebP output
    });
    manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///tmp/p1.jpeg' })
      .mockResolvedValueOnce({ uri: 'file:///tmp/p2.jpeg' })
      .mockResolvedValueOnce({ uri: 'file:///tmp/p2.webp' });
    const out = await compressIfNeeded('file:///tmp/big.jpg');
    expect(manipulateAsync).toHaveBeenCalledTimes(3);
    expect(manipulateAsync).toHaveBeenNthCalledWith(
      2,
      'file:///tmp/p1.jpeg',
      [{ resize: { width: 800 } }],
      expect.objectContaining({ compress: 0.65, format: 'JPEG' }),
    );
    expect(manipulateAsync).toHaveBeenLastCalledWith(
      'file:///tmp/p2.jpeg',
      [],
      expect.objectContaining({ compress: 0.65, format: 'WEBP' }),
    );
    expect(out.uri).toBe('file:///tmp/p2.webp');
    expect(out.contentType).toBe('image/webp');
  });

  it('large WebP is downscaled and re-emitted as WebP (contentType reflects final bytes)', async () => {
    let call = 0;
    getInfoAsync.mockImplementation(async () => {
      call += 1;
      return call === 1
        ? { exists: true, size: 3 * 1024 * 1024 }
        : call === 2
          ? { exists: true, size: 900_000 }
          : { exists: true, size: 600_000 };
    });
    manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///tmp/w.jpeg' })
      .mockResolvedValueOnce({ uri: 'file:///tmp/w.webp' });
    const out = await compressIfNeeded('file:///tmp/big.webp', 'image/webp');
    expect(out.contentType).toBe('image/webp');
    expect(out.uri).toBe('file:///tmp/w.webp');
  });

  it('throws ImageCompressError when 2 passes still exceed the limit', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 3 * 1024 * 1024 });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/still-big.jpeg' });
    await expect(compressIfNeeded('file:///tmp/huge.jpg')).rejects.toThrow(
      ImageCompressError,
    );
  });
});

describe('compressIfNeeded — failure handling (H3)', () => {
  it('surfaces a typed error when the manipulator throws; never uploads original bytes', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 3 * 1024 * 1024 });
    manipulateAsync.mockRejectedValue(new Error('decoder failure'));
    await expect(compressIfNeeded('file:///tmp/broken.heic')).rejects.toThrow(
      'Could not process image',
    );
  });

  it('surfaces when source file is missing', async () => {
    getInfoAsync.mockResolvedValue({ exists: false, size: 0 });
    await expect(compressIfNeeded('file:///tmp/gone.jpg')).rejects.toThrow(
      'Could not process image',
    );
  });
});

describe('constants', () => {
  it('threshold is 2MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
  });
});

// The compression engine's passthrough allowlist is derived from
// ALLOWED_MEDIA_TYPES in lib/storageFolders.ts — the SAME list the presign route
// uses as its Zod enum. So adding a member there is not a local change: the client
// starts passing that type through UNCHANGED instead of normalizing it to JPEG.
// These pin the set in both directions, so a newly accepted type is a deliberate
// decision (three visible edits) rather than a silent behavior change.
describe('compressIfNeeded — the passthrough set is ALLOWED_MEDIA_TYPES, exactly', () => {
  it('pins the accepted set: changing it must be a deliberate three-place edit', () => {
    // Tripwire, same convention as the FOLDER_PREFIX / CACHE_CONTROL pins: the
    // route enum, this allowlist and the header prose all read this one list.
    expect([...ALLOWED_MEDIA_TYPES]).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('passes every accepted type through untouched', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 500_000 });
    for (const mime of ALLOWED_MEDIA_TYPES) {
      const out = await compressIfNeeded(`file:///tmp/photo.${mime.split('/')[1]}`, mime);
      expect({ mime, contentType: out.contentType }).toEqual({ mime, contentType: mime });
      expect(manipulateAsync).not.toHaveBeenCalled();
    }
  });

  it('normalizes every type OUTSIDE the set to WebP — so adding one cannot go unnoticed', async () => {
    const outsideTheSet = ['image/heic', 'image/gif', 'image/tiff', 'image/bmp', 'image/jpg'];
    for (const mime of outsideTheSet) {
      // Guard the guard: each of these must really be outside the shared list,
      // otherwise this case would silently stop testing the normalization path.
      expect(ALLOWED_MEDIA_TYPES as readonly string[]).not.toContain(mime);

      getInfoAsync.mockResolvedValue({ exists: true, size: 500_000 });
      manipulateAsync.mockClear();
      manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/normalized.webp' });

      const out = await compressIfNeeded('file:///tmp/photo.bin', mime);
      expect({ mime, contentType: out.contentType }).toEqual({
        mime,
        contentType: 'image/webp',
      });
      expect(manipulateAsync).toHaveBeenCalledTimes(1);
    }
  });
});
