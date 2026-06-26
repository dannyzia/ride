// [public]
import { z } from "zod";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";

const checkUserSchema = z
  .object({
    phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
  })
  .strict();

export async function POST(request: Request) {
  const result = await parseJsonBody(request, checkUserSchema);
  if (!result.ok) return result.response;

  const { phone } = result.data;

  try {
    const user = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (user.length === 0) {
      return Response.json({ exists: false, role: null }, { status: 200 });
    }

    return Response.json({ exists: true, role: user[0].role }, { status: 200 });
  } catch (error) {
    logger.error("[check-user] error", error);
    return Response.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
