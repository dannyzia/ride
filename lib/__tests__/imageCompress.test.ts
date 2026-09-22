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
import {
  compressIfNeeded,
  sanitizeFilenameBase,
  MAX_UPLOAD_BYTES,
  ImageCompressError,
} from '../imageCompress';

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const manipulateAsync = ImageManipulator.manipulateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sanitizeFilenameBase', () => {
  it('drops directory components, sanitizes unsafe chars, caps length', () => {
    expect(sanitizeFilenameBase('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilenameBase('my photo (1).jpg')).toBe('my_photo__1_.jpg');
    expect(sanitizeFilenameBase('x'.repeat(300)).length).toBeLessThanOrEqual(100);
  });
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
  it('converts HEIC to JPEG regardless of size', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 50_000 });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/conv.jpeg' });
    const out = await compressIfNeeded('file:///tmp/IMG_0001.heic', 'image/heic');
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file:///tmp/IMG_0001.heic',
      [],
      expect.objectContaining({ format: ImageManipulator.SaveFormat.JPEG }),
    );
    expect(out.contentType).toBe('image/jpeg');
    expect(out.uri).toBe('file:///tmp/conv.jpeg');
  });

  it('converts small GIF to JPEG (first frame), not an error', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 20_000 });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/gif.jpeg' });
    const out = await compressIfNeeded('file:///tmp/anim.gif', 'image/gif');
    expect(out.contentType).toBe('image/jpeg');
  });

  it('treats unknown mime as unsupported and normalizes to JPEG', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 10 });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/x.jpeg' });
    const out = await compressIfNeeded('file:///tmp/mystery.bin');
    expect(out.contentType).toBe('image/jpeg');
  });
});

describe('compressIfNeeded — compression passes', () => {
  it('large JPEG: pass 1 brings it under 2MB', async () => {
    let call = 0;
    getInfoAsync.mockImplementation(async () => {
      call += 1;
      // 1st: source 3MB; 2nd: pass-1 output 1MB
      return call === 1
        ? { exists: true, size: 3 * 1024 * 1024 }
        : { exists: true, size: 1024 * 1024 };
    });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/p1.jpeg' });
    const out = await compressIfNeeded('file:///tmp/big.jpg');
    expect(manipulateAsync).toHaveBeenCalledTimes(1);
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file:///tmp/big.jpg',
      [{ resize: { width: 1200 } }],
      expect.objectContaining({ compress: 0.75, format: 'JPEG' }),
    );
    expect(out).toEqual({
      uri: 'file:///tmp/p1.jpeg',
      sizeBytes: 1024 * 1024,
      contentType: 'image/jpeg',
    });
  });

  it('still-too-large after pass 1 runs pass 2 (width 800, 0.65)', async () => {
    let call = 0;
    getInfoAsync.mockImplementation(async () => {
      call += 1;
      if (call === 1) return { exists: true, size: 4 * 1024 * 1024 }; // source
      if (call === 2) return { exists: true, size: 2_500_000 }; // pass 1
      return { exists: true, size: 1_500_000 }; // pass 2
    });
    manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///tmp/p1.jpeg' })
      .mockResolvedValueOnce({ uri: 'file:///tmp/p2.jpeg' });
    const out = await compressIfNeeded('file:///tmp/big.jpg');
    expect(manipulateAsync).toHaveBeenCalledTimes(2);
    expect(manipulateAsync).toHaveBeenLastCalledWith(
      'file:///tmp/p1.jpeg',
      [{ resize: { width: 800 } }],
      expect.objectContaining({ compress: 0.65 }),
    );
    expect(out.uri).toBe('file:///tmp/p2.jpeg');
    expect(out.contentType).toBe('image/jpeg');
  });

  it('large WebP is recompressed to JPEG (contentType reflects final bytes)', async () => {
    let call = 0;
    getInfoAsync.mockImplementation(async () => {
      call += 1;
      return call === 1
        ? { exists: true, size: 3 * 1024 * 1024 }
        : { exists: true, size: 900_000 };
    });
    manipulateAsync.mockResolvedValue({ uri: 'file:///tmp/w.jpeg' });
    const out = await compressIfNeeded('file:///tmp/big.webp', 'image/webp');
    expect(out.contentType).toBe('image/jpeg');
    expect(out.uri).toBe('file:///tmp/w.jpeg');
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
