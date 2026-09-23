/**
 * Storage contract agreement — the two values the signer and the client share.
 *
 * The presign route binds `Content-Type` + `Cache-Control` into the signature,
 * so a client that sends anything different gets a 403 on EVERY upload. This
 * test drives both real code paths in one place: it runs the client pipeline
 * (`uploadImageToR2`) to capture the headers it hands to its native PUT, runs
 * the route (`POST`) to capture what it actually signs, and asserts the two
 * agree — plus that the signed header set is exactly the set the client sends.
 *
 * A divergence on either side fails here rather than on a device.
 *
 * It also covers the folder DEFAULT: the uploader and the route each fall back
 * to `DEFAULT_STORAGE_FOLDER`, and both must address the same key prefix.
 */
/* eslint-disable import/first */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({ verifySupabaseToken: jest.fn() }));
jest.mock("@/lib/otpRateLimit", () => ({ rateLimitCount: jest.fn() }));
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
jest.mock("expo-file-system", () => ({
  getInfoAsync: jest.fn(),
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" },
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "JPEG", PNG: "PNG", WEBP: "WEBP" },
}));

import { verifySupabaseToken } from "@/lib/auth";
import { rateLimitCount } from "@/lib/otpRateLimit";
import { supabase } from "@/lib/supabase";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { POST } from "@/app/api/storage/upload-url+api";
import { uploadImageToR2 } from "@/lib/imageToURL";
import {
  ALLOWED_MEDIA_TYPES,
  CACHE_CONTROL,
  DEFAULT_STORAGE_FOLDER,
  DOCUMENT_FOLDERS,
  folderPrefix,
  sanitizeFilenameBase,
  type StorageFolder,
} from "@/lib/storageFolders";

const UID = "11111111-1111-4111-a111-111111111111";
const DOMAIN = "https://assets.ride.com.bd";
const UPLOAD_URL = "https://acct123.r2.cloudflarestorage.com/signed?X-Amz-Signature=abc";

let fetchCalls: { url: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  fetchCalls = [];
  process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct123";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET_NAME = "driver-documents";
  process.env.EXPO_PUBLIC_R2_DOMAIN = DOMAIN;

  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: UID });
  (rateLimitCount as jest.Mock).mockResolvedValue(1);
  (randomUUID as jest.Mock).mockReturnValue("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  (getSignedUrl as jest.Mock).mockResolvedValue(UPLOAD_URL);
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { access_token: "token" } },
  });

  // Small PNG: passes the allowlist untouched, so contentType stays image/png.
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 1_024 });
  (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 200, body: "", headers: {} });

  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(
    async (url: string, init: { body: string }) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return {
        ok: true,
        status: 200,
        json: async () => ({ uploadUrl: UPLOAD_URL, key: "documents/k.png", publicUrl: `${DOMAIN}/documents/k.png` }),
      };
    },
  );
});

describe("storage contract: signer and client agree", () => {
  it("the client PUTs exactly the headers the route signed, with the same values", async () => {
    // ── 1. The client pipeline, driven for real (native PUT mocked). ────────
    await uploadImageToR2({
      localUri: "file:///tmp/photo.png",
      folder: "documents",
      fileName: "photo.png",
      mimeType: "image/png",
    });

    const presignBody = fetchCalls[0].body;
    const putOptions = (FileSystem.uploadAsync as jest.Mock).mock.calls[0][2] as {
      httpMethod: string;
      headers: Record<string, string>;
    };
    const putHeaders = putOptions.headers;

    expect(putOptions.httpMethod).toBe("PUT");
    expect(presignBody.contentType).toBe("image/png");

    // ── 2. The route, driven for real (S3 presigner mocked). ───────────────
    const res = await POST({
      json: async () => ({
        filename: "photo.png",
        folder: "documents",
        contentType: presignBody.contentType,
      }),
    } as unknown as Request);
    expect(res.status).toBe(200);

    const signed = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0] as {
      ContentType: string;
      CacheControl: string;
    };
    const signableHeaders = (getSignedUrl as jest.Mock).mock.calls[0][2]
      .signableHeaders as Set<string>;

    // ── 3. The agreement itself. ───────────────────────────────────────────
    expect(putHeaders["Content-Type"]).toBe(signed.ContentType);
    expect(putHeaders["Cache-Control"]).toBe(signed.CacheControl);

    // The values the client sends are the shared, single-sourced ones.
    expect(putHeaders["Cache-Control"]).toBe(CACHE_CONTROL);
    expect(ALLOWED_MEDIA_TYPES).toContain(putHeaders["Content-Type"]);
    expect(putHeaders["Content-Type"]).toBe(presignBody.contentType);

    // Signature covers exactly the headers the client sends (plus host).
    expect(Object.keys(putHeaders).map((h) => h.toLowerCase()).sort()).toEqual(
      [...signableHeaders].sort(),
    );

  });

  it("the client and the route fall back to the same folder when neither names one", async () => {
    // ── 1. Client with NO folder: its default is the shared constant. ──────
    await uploadImageToR2({
      localUri: "file:///tmp/photo.png",
      fileName: "photo.png",
      mimeType: "image/png",
    });

    const clientFolder = fetchCalls[0].body.folder;
    expect(clientFolder).toBe(DEFAULT_STORAGE_FOLDER);

    // ── 2. Route with NO folder: it must address that same key prefix. ─────
    const res = await POST({
      json: async () => ({ filename: "photo.png", contentType: "image/png" }),
    } as unknown as Request);
    expect(res.status).toBe(200);
    const { key } = (await res.json()) as { key: string };

    expect(key.startsWith(`${folderPrefix(clientFolder as StorageFolder)}/`)).toBe(true);
    expect(key.startsWith(`${folderPrefix(DEFAULT_STORAGE_FOLDER)}/`)).toBe(true);

    // The shared default must be one the documents endpoint accepts, so the
    // upload card can use it as its own fallback.
    expect(DOCUMENT_FOLDERS).toContain(DEFAULT_STORAGE_FOLDER);
  });

  it("the route keys the object with the name the uploader sanitized (one rule, both sides)", async () => {
    // Long enough to cross the 100-char cap, unicode + spaces: a second copy of
    // the rule with a different cap or character class cannot agree with this.
    const hostile = `dir/${"\u00fc".repeat(20)} ${"x".repeat(120)}.JPG`;

    // ── 1. What the uploader sends after sanitizing. ───────────────────────
    await uploadImageToR2({
      localUri: "file:///tmp/photo.png",
      fileName: hostile,
      mimeType: "image/png",
    });
    const sentName = fetchCalls[0].body.filename as string;
    expect(sentName).toBe(sanitizeFilenameBase(hostile));

    // ── 2. The key the route builds from the same input. ───────────────────
    const res = await POST({
      json: async () => ({ filename: hostile, contentType: "image/png" }),
    } as unknown as Request);
    expect(res.status).toBe(200);
    const { key } = (await res.json()) as { key: string };

    expect(key.endsWith(`-${sentName}`)).toBe(true);
  });
});
