/**
 * Upload retry-loop coverage for lib/imageToURL.ts.
 *
 * The loop's two 429 sources are structurally different and are pinned here:
 *   - OUR presign route's 429 → surfaces to the user, no PUT is attempted
 *   - the R2 PUT's own 429 → retried, like a 5xx
 * A 403 is a signature failure (the presign binds Content-Type + Cache-Control)
 * and must NOT be retried — retrying a bad signature just burns three PUTs.
 *
 * The presigned URL in these tests is the REAL host shape R2 hands back
 * (`<bucket>.<account>.r2.cloudflarestorage.com`), while EXPO_PUBLIC_R2_DOMAIN
 * is the public-read domain — deliberately different, because a same-value
 * check against the read domain would classify every real R2 PUT as "not R2".
 */
/* eslint-disable import/first */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock("expo-file-system", () => ({
  getInfoAsync: jest.fn(),
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" },
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "JPEG", PNG: "PNG", WEBP: "WEBP" },
}));

import * as FileSystem from "expo-file-system";
import { supabase } from "@/lib/supabase";
import { uploadImageToR2 } from "@/lib/imageToURL";

const UID = "11111111-1111-4111-a111-111111111111";
/** Real presigned-URL host shape (observed from the live bucket). */
const R2_API_URL = `https://driver-documents.2187194e5332364b004268e554c547a1.r2.cloudflarestorage.com/documents/${UID}/1790-abcd1234-photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-SignedHeaders=cache-control%3Bcontent-type%3Bhost&X-Amz-Signature=deadbeef`;
/** A PUT target that is not R2 at all (misconfigured endpoint). */
const FOREIGN_URL = "https://uploads.example.com/blob/1790-photo.jpg?token=x";

const uploadAsync = FileSystem.uploadAsync as jest.Mock;
const puts = () => uploadAsync.mock.calls.length;

/** Script PUT statuses; the last one repeats once the script is exhausted. */
function scriptPut(statuses: number[]): void {
  uploadAsync.mockImplementation(async () => {
    const status = statuses.length > 1 ? statuses.shift()! : statuses[0];
    return { status, body: "", headers: {} };
  });
}

function presignServes(uploadUrl: string, status = 200): void {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
    ok: status === 200,
    status,
    json: async () => ({ uploadUrl, key: `documents/${UID}/k.jpg`, publicUrl: `https://cdn.test/documents/${UID}/k.jpg` }),
  }));
}

const upload = () =>
  uploadImageToR2({
    localUri: "file:///tmp/photo.jpg",
    folder: "documents",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
  // The public READ domain — never the host of a presigned PUT.
  process.env.EXPO_PUBLIC_R2_DOMAIN = "https://ride.digital-papyrus.com";
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { access_token: "token" } },
  });
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 1_024 });
});

describe("upload retry loop", () => {
  it("retries a 429 from the R2 host and succeeds on the next attempt", async () => {
    presignServes(R2_API_URL);
    scriptPut([429, 200]);

    const result = await upload();

    expect(puts()).toBe(2);
    expect(result.key).toMatch(/^documents\//);
  });

  it("gives up after 3 attempts when the R2 host keeps throttling", async () => {
    presignServes(R2_API_URL);
    scriptPut([429]);

    await expect(upload()).rejects.toThrow("Upload failed (429)");
    expect(puts()).toBe(3);
  });

  it("does NOT retry a 403 from the R2 host (signature failure)", async () => {
    presignServes(R2_API_URL);
    scriptPut([403]);

    await expect(upload()).rejects.toThrow("Upload failed (403)");
    expect(puts()).toBe(1);
  });

  it("retries a 5xx from the R2 host", async () => {
    presignServes(R2_API_URL);
    scriptPut([503, 200]);

    await upload();

    expect(puts()).toBe(2);
  });

  it("does not attempt a PUT when OUR presign route itself rate-limits", async () => {
    presignServes(R2_API_URL, 429);

    await expect(upload()).rejects.toThrow("Too many uploads");

    expect(puts()).toBe(0);
  });

  it("retries by status, not by URL host (a 429 from any PUT target)", async () => {
    // Guards against re-introducing a URL-host predicate as the decision-maker:
    // the retry rule is status-driven, so this case and the R2 one must agree.
    // A host test that became authoritative would break one of the two.
    presignServes(FOREIGN_URL);
    scriptPut([429, 200]);

    await upload();

    expect(puts()).toBe(2);
  });
});
