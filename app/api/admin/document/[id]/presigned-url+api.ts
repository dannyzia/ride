// GET /api/admin/document/[id]/presigned-url
// F15-API-05. Generate a short-lived signed URL for viewing a document.
import { db } from "@/src/db";
import { documents } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";

interface Params {
  params: { id: string };
}

const SIXTY_SECONDS = 60;

export async function GET(request: Request, { params }: Params) {
  try {
    await requireRole("admin")(request);
    const { id } = params;

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    if (!doc)
      return Response.json({ error: "document_not_found" }, { status: 404 });

    const storageUrl = doc.storage_url;

    // If it's already a full public URL (https://...), return as-is.
    if (/^https?:\/\//i.test(storageUrl)) {
      return Response.json({
        url: storageUrl,
        expires_at: null,
        public: true,
      });
    }

    // Otherwise, attempt to issue a signed URL via Supabase Storage.
    // Convention: storage_url is of the form "<bucket>/<path>"
    const slashIdx = storageUrl.indexOf("/");
    if (slashIdx < 0) {
      return Response.json(
        {
          error: "invalid_storage_url",
          message: "storage_url must contain a bucket and path",
        },
        { status: 422 },
      );
    }
    const bucket = storageUrl.slice(0, slashIdx);
    const path = storageUrl.slice(slashIdx + 1);

    const { supabaseAdmin } = await import("@/lib/supabaseServer");
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, SIXTY_SECONDS);

    if (error || !data?.signedUrl) {
      logger.error("[admin/document/presigned-url] signed url failed", error);
      return Response.json(
        { error: "signed_url_failed", message: error?.message ?? "unknown" },
        { status: 502 },
      );
    }

    return Response.json({
      url: data.signedUrl,
      expires_at: new Date(Date.now() + SIXTY_SECONDS * 1000).toISOString(),
      public: false,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/document/presigned-url] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
