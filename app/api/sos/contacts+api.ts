// [public]
import { db } from "../../../src/db";
import { systemConfig } from "../../../src/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/sos/contacts
 * Public endpoint — returns the configured SOS emergency contacts.
 * Used by the driver app SOS button. No auth required.
 */
export async function GET() {
  const [row] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, "sos_contacts"))
    .limit(1);
  if (!row) {
    // Default fallback
    return Response.json({
      contacts: [{ label: "National Emergency", number: "999" }],
    });
  }

  try {
    const contacts = JSON.parse(row.value);
    return Response.json({ contacts });
  } catch {
    return Response.json({
      contacts: [{ label: "National Emergency", number: "999" }],
    });
  }
}
