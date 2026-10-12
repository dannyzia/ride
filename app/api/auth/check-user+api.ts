// [public]
import { z } from "zod";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { heldRoles } from "@/lib/launchRoles";

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
      return Response.json({ exists: false, role: null, roles: [] }, { status: 200 });
    }

    // OWNER-DECISION #9: the post-OTP "Login as [Role]" chooser needs the full
    // set of roles the account holds. Only ROLE LABELS + verification state
    // cross this public boundary — no ids, names or documents.
    const roles = await heldRoles(user[0].id);

    return Response.json({ exists: true, role: user[0].role, roles }, { status: 200 });
  } catch (error) {
    logger.error("[check-user] error", error);
    return Response.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
