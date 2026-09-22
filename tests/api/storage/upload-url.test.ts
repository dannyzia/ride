/**
 * R2 migration Task 9 — POST /api/storage/upload-url.
 * Mocked: auth, rate limiter, S3 presigner, expo-crypto.
 * Invariants: 401, Zod failures, rate-limit 429 past R2_UPLOAD_MAX, key shape
 * (user scoping + random suffix), ContentType + CacheControl binding,
 * 300s expiry, server_misconfigured fail-fast.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/lib/otpRateLimit", () => ({
  rateLimitCount: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(),
}));

import { verifySupabaseToken } from "@/lib/auth";
import { rateLimitCount } from "@/lib/otpRateLimit";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "expo-crypto";
import { POST, R2_UPLOAD_MAX } from "@/app/api/storage/upload-url+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";

function jsonRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

async function getJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct123";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET_NAME = "driver-documents";
  process.env.EXPO_PUBLIC_R2_DOMAIN = "https://assets.ride.com.bd";

  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (rateLimitCount as jest.Mock).mockResolvedValue(1);
  (getSignedUrl as jest.Mock).mockResolvedValue(
    "https://acct123.r2.cloudflarestorage.com/signed?X-Amz-Signature=abc",
  );
  (randomUUID as jest.Mock).mockReturnValue(
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  );
});

afterAll(() => {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET_NAME;
  delete process.env.EXPO_PUBLIC_R2_DOMAIN;
});

describe("POST /api/storage/upload-url", () => {
  test("401 unauthorized when token verification fails with 401", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest({ filename: "a.jpg" }));
    expect(res.status).toBe(401);
    expect((await getJson(res)).error).toBe("unauthorized");
  });

  test("rethrows non-401 auth errors", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue(new Error("boom"));
    await expect(POST(jsonRequest({ filename: "a.jpg" }))).rejects.toThrow("boom");
  });

  test("400 validation_error for invalid body", async () => {
    const res = await POST(jsonRequest({ folder: "not-a-folder" }));
    expect(res.status).toBe(400);
  });

  test("400 for disallowed contentType", async () => {
    const res = await POST(
      jsonRequest({ filename: "a.jpg", contentType: "image/gif" }),
    );
    expect(res.status).toBe(400);
  });

  test("500 server_misconfigured when R2 env vars are missing", async () => {
    delete process.env.R2_BUCKET_NAME;
    const res = await POST(jsonRequest({ filename: "a.jpg" }));
    expect(res.status).toBe(500);
    expect((await getJson(res)).error).toBe("server_misconfigured");
  });

  test("429 rate_limited when the window count exceeds R2_UPLOAD_MAX", async () => {
    (rateLimitCount as jest.Mock).mockResolvedValue(R2_UPLOAD_MAX + 1);
    const res = await POST(jsonRequest({ filename: "a.jpg" }));
    expect(res.status).toBe(429);
    expect((await getJson(res)).error).toBe("rate_limited");
  });

  test("rate-limit key is scoped per user and checked before presigning", async () => {
    await POST(jsonRequest({ filename: "a.jpg" }));
    expect(rateLimitCount).toHaveBeenCalledWith(`r2upload:${SUPABASE_UID}`);
    expect(getSignedUrl).toHaveBeenCalled();
  });

  test("key shape: folder/userId/timestamp-8charRandom-sanitizedFilename", async () => {
    const res = await POST(
      jsonRequest({ filename: "../../my photo (1).jpg", folder: "profile" }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const key = body.key as string;
    expect(key).toMatch(
      /^profile\/11111111-1111-4111-a111-111111111111\/\d+-a1b2c3d4-my_photo__1_\.jpg$/,
    );
    expect(body.publicUrl).toBe(`https://assets.ride.com.bd/${key}`);
    expect((body.uploadUrl as string).length).toBeGreaterThan(0);
  });

  test("PutObjectCommand binds Bucket, ContentType and immutable CacheControl", async () => {
    await POST(
      jsonRequest({ filename: "a.jpg", contentType: "image/png" }),
    );
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: "driver-documents",
      Key: expect.stringContaining(`${SUPABASE_UID}/`),
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  test("presign expiry is 300s", async () => {
    await POST(jsonRequest({ filename: "a.jpg" }));
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 },
    );
  });

  test("defaults: folder=documents, contentType=image/jpeg", async () => {
    const res = await POST(jsonRequest({ filename: "a.jpg" }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.key).toMatch(/^documents\//);
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ ContentType: "image/jpeg" }),
    );
  });

  test("publicUrl strips trailing slashes from the configured domain", async () => {
    process.env.EXPO_PUBLIC_R2_DOMAIN = "https://assets.ride.com.bd///";
    const res = await POST(jsonRequest({ filename: "a.jpg" }));
    const body = await getJson(res);
    expect(body.publicUrl).toMatch(/^https:\/\/assets\.ride\.com\.bd\/documents\//);
    expect(body.publicUrl).not.toContain("//documents");
  });
});
