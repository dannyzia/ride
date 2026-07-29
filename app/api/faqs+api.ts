import { db } from "@/src/db";
import { faqs } from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");

    const conditions = [eq(faqs.is_active, true)];
    if (role === "rider" || role === "driver") {
      conditions.push(eq(faqs.role, role as "rider" | "driver"));
    }

    const rows = await db.select({
      id: faqs.id,
      role: faqs.role,
      question: faqs.question,
      answer: faqs.answer,
      category: faqs.category,
      sort_order: faqs.sort_order,
    })
      .from(faqs)
      .where(and(...conditions))
      .orderBy(faqs.sort_order);

    return Response.json({ faqs: rows }, { status: 200 });
  } catch (err: any) {
    logger.error("[faqs] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
