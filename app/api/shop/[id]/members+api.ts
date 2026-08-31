/**
 * Shop members management.
 *
 * GET    /api/shop/[id]/members — list active members
 * POST   /api/shop/[id]/members — add member (OWNER only)
 * DELETE /api/shop/[id]/members?user_id=... — remove member or leave-shop
 */
import { db } from "@/src/db";
import { shopMembers, users } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const { supabaseUser, dbUser } = await requireShopMember(id)(request);

    const rows = await db
      .select({
        id: shopMembers.id,
        user_id: shopMembers.user_id,
        role: shopMembers.role,
        status: shopMembers.status,
        joined_at: shopMembers.joined_at,
        user_name: users.name,
        user_phone: users.phone,
      })
      .from(shopMembers)
      .leftJoin(users, eq(shopMembers.user_id, users.id))
      .where(
        and(eq(shopMembers.shop_id, id), isNull(shopMembers.removed_at)),
      );

    return Response.json({ members: rows });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized for this shop" },
        { status: 403 },
      );
    logger.error("[shop/members GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const { membership } = await requireShopMember(id, ["OWNER"])(request);

    const result = await parseJsonBody(request, addMemberSchema);
    if (!result.ok) return result.response;

    await db.insert(shopMembers).values({
      shop_id: id,
      user_id: result.data.user_id,
      role: result.data.role,
    });

    return Response.json({ message: "Member added" }, { status: 201 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Only the shop owner can add members" },
        { status: 403 },
      );
    if (errors.getErrorCode(err) === "23505")
      return Response.json(
        { error: "already_member", message: "User is already a member" },
        { status: 409 },
      );
    logger.error("[shop/members POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/shop/[id]/members?user_id=...
 * Owner can remove any member. Any member can remove self (leave-shop).
 */
export async function DELETE(request: Request, { id }: { id: string }) {
  try {
    const { supabaseUser, dbUser, membership } = await requireShopMember(id)(
      request,
    );

    const url = new URL(request.url);
    const targetUserId = url.searchParams.get("user_id") ?? dbUser.id;

    // Non-owners can only remove themselves
    if (membership.role !== "OWNER" && targetUserId !== dbUser.id) {
      return Response.json(
        { error: "forbidden", message: "Only the owner can remove other members" },
        { status: 403 },
      );
    }

    await db
      .update(shopMembers)
      .set({ removed_at: new Date() })
      .where(
        and(
          eq(shopMembers.shop_id, id),
          eq(shopMembers.user_id, targetUserId),
          isNull(shopMembers.removed_at),
        ),
      );

    return Response.json({
      message: targetUserId === dbUser.id ? "Left shop" : "Member removed",
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized for this shop" },
        { status: 403 },
      );
    logger.error("[shop/members DELETE] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
