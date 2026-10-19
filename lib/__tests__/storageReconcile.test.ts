// C8-FIX D5-2 — post-upload reconciler: lists per-prefix keys, deletes
// anything over MAX_UPLOAD_BYTES, reports owner segments for flagging.
/* eslint-disable import/first */
import { jest } from "@jest/globals";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockSend: jest.Mock = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => ({ __list: true, ...((input ?? {}) as Record<string, unknown>) })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ __delete: true, ...((input ?? {}) as Record<string, unknown>) })),
}));

import { MAX_UPLOAD_BYTES } from "../storageFolders";
import { reconcileOversizedUploads } from "../storageReconcile";

// Direct assignment only (wholesale process.env replacement does not
// propagate inside this jest VM); every key this file touches is restored.
const R2_KEYS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
] as const;
const prevR2Env = new Map<string, string | undefined>();

function setR2Env() {
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET_NAME = "bucket";
}

beforeEach(() => {
  jest.clearAllMocks();
  prevR2Env.clear();
  for (const k of R2_KEYS) prevR2Env.set(k, process.env[k]);
});

afterEach(() => {
  for (const k of R2_KEYS) {
    const prev = prevR2Env.get(k);
    if (prev === undefined) delete process.env[k];
    else process.env[k] = prev;
  }
});

describe("reconcileOversizedUploads", () => {
  it("deletes objects over MAX_UPLOAD_BYTES and keeps the rest", async () => {
    setR2Env();
    mockSend.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as { __list?: boolean; Prefix?: string };
      if (cmd.__list) {
        if ((cmd.Prefix ?? "").startsWith("documents/")) {
          return {
            Contents: [
              { Key: "documents/uid-1/1-a-ok.jpg", Size: 1024 },
              { Key: "documents/uid-2/2-big.jpg", Size: MAX_UPLOAD_BYTES + 1 },
            ],
            IsTruncated: false,
          };
        }
        return { Contents: [], IsTruncated: false };
      }
      return {};
    });

    const summary = await reconcileOversizedUploads();

    expect(summary.checked).toBeGreaterThan(0);
    expect(summary.deleted).toEqual([
      { key: "documents/uid-2/2-big.jpg", sizeBytes: MAX_UPLOAD_BYTES + 1, ownerId: "uid-2" },
    ]);
    const deletes = mockSend.mock.calls.filter(
      (c) => ((c[0] ?? {}) as { __delete?: boolean }).__delete,
    );
    expect(deletes).toHaveLength(1);
  });

  it("resolves to a zero summary when R2 is not configured", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;

    const summary = await reconcileOversizedUploads();

    expect(summary).toEqual({ checked: 0, deleted: [] });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
