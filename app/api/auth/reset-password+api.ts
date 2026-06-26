// [public]
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { parseJsonBody } from "@/lib/parseBody";
import { consumeVerification } from "@/lib/verifiedPhones";
import { logger } from "@/lib/logger";

const resetPasswordSchema = z
  .object({
    phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  })
  .strict();

export async function POST(request: Request) {
  const result = await parseJsonBody(request, resetPasswordSchema);
  if (!result.ok) return result.response;

  const { phone, newPassword } = result.data;

  if (!consumeVerification(phone)) {
    return Response.json(
      { error: "phone_not_verified", message: "Phone number must be verified via OTP first" },
      { status: 403 },
    );
  }

  const [userRecord] = await db
    .select({ auth_uid: users.auth_uid })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!userRecord) {
    return Response.json(
      { error: "user_not_found", message: "No user found with this phone number" },
      { status: 404 },
    );
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userRecord.auth_uid, {
    password: newPassword,
  });

  if (error) {
    logger.error("[reset-password] updateUserById failed", error);
    return Response.json(
      { error: "password_update_failed", message: "Failed to update password" },
      { status: 500 },
    );
  }

  return Response.json({ message: "Password updated successfully" }, { status: 200 });
}
