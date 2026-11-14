/**
 * **Purpose:**     Make the FLEET PORTAL reachable for a fixture account so fleet
 *                  screens can be device-verified.
 * **Owner:**       Coding model (Batch-2 follow-up: fleet device verification)
 * **Status:**      ACTIVE — idempotent; safe to re-run.
 *
 * WHY THIS EXISTS (the root cause, measured — do not "simplify" it away):
 * the post-login chooser decides whether a role row is ENTERABLE with
 * `enterable = r.status === "active" && authenticated` (app/(auth)/login-as.tsx);
 * `enterFleet()` — the ONLY code that sets `activeMode=FLEET` + `activeFleetId`,
 * which `app/(main)/(fleet)/_layout.tsx` requires — is called from that row.
 * For `fleet_owner`, `heldRoles()` derives the status from the **BUSINESS** fleet
 * the user owns (`lib/launchRoles.ts`, S2.1 D-2: "scope to the fleet created BY
 * THE ROLE RECORD"), mapped by `fleetStatus()` — `ACTIVE` → `active`.
 *
 * Every fleet row this project's fixtures ever created is `NATIVE` (the implicit
 * solo fleet minted at driver registration), so `fleetRows[0]` is undefined, the
 * role reports `pending`, and the chooser routes the tap to
 * `verification-status` instead of the portal. That is why the fleet dashboard
 * and every `(fleet)` screen were unreachable on a device while the data
 * *looked* fine (`fleets.status='ACTIVE'`, `fleet_members` OWNER rows present).
 *
 * This script provisions exactly what a real fleet-owner signup + admin approval
 * leaves behind:
 *   1. `user_roles` row `fleet_owner`            (via addRoleRecord — the same
 *      writer the add-role API uses, which mints the BUSINESS fleet as PENDING)
 *   2. the BUSINESS fleet flipped to ACTIVE / verification_status 'approved'
 *   3. `fleet_members` OWNER (active)            — what approval mints (§2d)
 *   4. optionally one `fleet_integrations` row in `status='error'`, which is the
 *      ONLY thing that renders the fleet dashboard's issue banner — and that
 *      banner is the only UI route to `(fleet)/integrations`.
 *
 * It writes rows DIRECTLY rather than calling `lib/roleVerification.approve()`:
 * approve() requires an admin actor and appends an `audit_logs` row attributed
 * to that admin, which cannot be removed (the log is append-only). A fixture must
 * not fabricate a real person's verification decision. The row shape below
 * mirrors approve()'s fleet branch exactly; if that branch changes, change this.
 *
 * Usage:
 *   npx tsx scripts/seed-fleet-owner-fixture.ts [--phone=1700000001]
 *        [--fleet-name="Fixture Fleet"] [--failing-integration] [--remove]
 *        [--dry-run]
 *
 * `--remove` deletes ONLY what this script's shape owns: the BUSINESS fleet(s)
 * of that user plus their `fleet_members` / `fleet_integrations` rows and the
 * `user_roles.fleet_owner` row. NATIVE fleets (the driver's real solo fleet),
 * drivers, vehicles and every other table are never touched.
 *
 * Exit codes: 0 = the account's fleet_owner role now resolves `active` (or
 * `--remove`/`--dry-run` finished); 1 = it still does not, or the account could
 * not be resolved — never a silent pass.
 */
import "./_load-env";
import { db } from "../src/db";
import { fleetIntegrations, fleetMembers, fleets, userRoles, users } from "../src/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { addRoleRecord, heldRoles } from "../lib/launchRoles";

const FIXTURE_PROVIDER = "pathao" as const;
const FIXTURE_ERROR = "Provider rejected the sync token (401) — fixture row from seed-fleet-owner-fixture.ts";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const PHONE_RAW = arg("phone", "1700000001")!;
const FLEET_NAME = arg("fleet-name", "Fixture Fleet")!;
const REMOVE = flag("remove");
const DRY_RUN = flag("dry-run");
const WITH_INTEGRATION = flag("failing-integration");

/** Accept 1700000001, 01700000001, +8801700000001 or 8801700000001. */
function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("880") ? digits.slice(3) : digits.replace(/^0+/, "");
  return `+880${local}`;
}

async function main() {
  const phone = normalizePhone(PHONE_RAW);
  const [user] = await db
    .select({ id: users.id, role: users.role, phone: users.phone })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user) {
    console.error(`✗ no users row for ${phone}`);
    process.exit(1);
  }
  console.log(`account : ${user.phone} (users.id ${user.id}, primary role ${user.role})`);

  const ownedFleets = await db
    .select({ id: fleets.id, name: fleets.name, fleet_type: fleets.fleet_type, status: fleets.status })
    .from(fleets)
    .where(eq(fleets.owner_user_id, user.id))
    .orderBy(asc(fleets.created_at));
  const businessFleets = ownedFleets.filter((f) => f.fleet_type === "BUSINESS");
  console.log(
    `fleets  : ${ownedFleets.length} owned — ` +
      ownedFleets.map((f) => `${f.name} [${f.fleet_type}/${f.status}]`).join(", "),
  );

  if (REMOVE) {
    if (businessFleets.length === 0) {
      console.log("nothing to remove: no BUSINESS fleet owned by this account");
    }
    for (const fleet of businessFleets) {
      if (DRY_RUN) {
        console.log(`[dry-run] would delete fleet ${fleet.name} (${fleet.id}) + members + integrations`);
        continue;
      }
      await db.delete(fleetIntegrations).where(eq(fleetIntegrations.fleet_id, fleet.id));
      await db.delete(fleetMembers).where(eq(fleetMembers.fleet_id, fleet.id));
      await db.delete(fleets).where(eq(fleets.id, fleet.id));
      console.log(`removed fleet ${fleet.name} (${fleet.id}) + members + integrations`);
    }
    const removedRole = DRY_RUN
      ? []
      : await db
          .delete(userRoles)
          .where(and(eq(userRoles.user_id, user.id), eq(userRoles.role, "fleet_owner")))
          .returning({ id: userRoles.id });
    console.log(
      DRY_RUN
        ? "[dry-run] would delete the user_roles.fleet_owner row"
        : `removed user_roles.fleet_owner rows: ${removedRole.length}`,
    );
    await report(user.id);
    return;
  }

  if (DRY_RUN) {
    console.log(
      `[dry-run] would ensure user_roles.fleet_owner, a BUSINESS fleet "${FLEET_NAME}" at ACTIVE/approved,` +
        ` an OWNER membership and ${WITH_INTEGRATION ? "one" : "no"} failing integration`,
    );
    await report(user.id);
    return;
  }

  // 1. The role row + the BUSINESS fleet record (the sanctioned writer mints it
  //    PENDING, exactly like the add-role API).
  const held = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.user_id, user.id), eq(userRoles.role, "fleet_owner")))
    .limit(1);
  if (held.length === 0) {
    await db.transaction(async (tx) => {
      await addRoleRecord(tx, {
        userId: user.id,
        role: "fleet_owner",
        payload: {
          fleet: {
            fleet_name: FLEET_NAME,
            business_name: `${FLEET_NAME} Ltd`,
            trade_license_number: "FIXTURE-TL-0001",
            trade_license_url: "https://example.test/fixture/trade-license.pdf",
          },
        },
      });
    });
    console.log(`added user_roles.fleet_owner + BUSINESS fleet "${FLEET_NAME}" (PENDING)`);
  } else {
    console.log("user_roles.fleet_owner already held — no role record written");
  }

  // 2 + 3. Approve it: what an admin decision leaves behind (fleet ACTIVE +
  //        verification_status approved + OWNER membership), minus the audit row.
  const [fleet] = await db
    .select({ id: fleets.id, name: fleets.name, status: fleets.status })
    .from(fleets)
    .where(and(eq(fleets.owner_user_id, user.id), eq(fleets.fleet_type, "BUSINESS")))
    .orderBy(asc(fleets.created_at))
    .limit(1);

  if (!fleet) {
    console.error("✗ no BUSINESS fleet after provisioning — heldRoles() cannot resolve fleet_owner");
    process.exit(1);
  }

  if (fleet.status !== "ACTIVE") {
    await db
      .update(fleets)
      .set({
        status: "ACTIVE",
        verification_status: "approved",
        verification_reason: null,
        verification_reject: null,
        verification_decided_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(fleets.id, fleet.id));
    console.log(`approved fleet ${fleet.name} (${fleet.id}): PENDING → ACTIVE/approved`);
  } else {
    console.log(`fleet ${fleet.name} (${fleet.id}) already ACTIVE`);
  }

  const [membership] = await db
    .select({ id: fleetMembers.id, status: fleetMembers.status })
    .from(fleetMembers)
    .where(and(eq(fleetMembers.fleet_id, fleet.id), eq(fleetMembers.user_id, user.id)))
    .limit(1);
  if (!membership) {
    await db.insert(fleetMembers).values({
      fleet_id: fleet.id,
      user_id: user.id,
      role: "OWNER",
      status: "active",
    });
    console.log("minted fleet_members OWNER (active)");
  } else if (membership.status !== "active") {
    await db
      .update(fleetMembers)
      .set({ status: "active", removed_at: null, updated_at: new Date() })
      .where(eq(fleetMembers.id, membership.id));
    console.log("reactivated fleet_members OWNER");
  } else {
    console.log("fleet_members OWNER already active");
  }

  // 4. Optional: one failing integration. The dashboard renders its
  //    "N integrations need attention" banner only while such a row exists, and
  //    that banner is the ONLY route to (fleet)/integrations.
  if (WITH_INTEGRATION) {
    const [existing] = await db
      .select({ id: fleetIntegrations.id, status: fleetIntegrations.status })
      .from(fleetIntegrations)
      .where(and(eq(fleetIntegrations.fleet_id, fleet.id), eq(fleetIntegrations.status, "error")))
      .limit(1);
    if (existing) {
      console.log(`failing integration already present (${existing.id})`);
    } else {
      const [inserted] = await db
        .insert(fleetIntegrations)
        .values({
          fleet_id: fleet.id,
          provider: FIXTURE_PROVIDER,
          status: "error",
          capabilities: ["vehicles", "drivers"],
          last_sync_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
          last_sync_entity: "vehicles",
          last_error: FIXTURE_ERROR,
          last_error_at: new Date(Date.now() - 10 * 60 * 1000),
        })
        .returning({ id: fleetIntegrations.id });
      console.log(`inserted failing integration ${FIXTURE_PROVIDER} (${inserted.id}) — dashboard banner now renders`);
    }
  }

  await report(user.id);
  console.log(
    "\nNext on device: log in with this account → chooser shows Fleet Owner as ACTIVE → tapping it runs\n" +
      "enterFleet() and lands on the fleet dashboard (fleet.dashboard.*).",
  );
}

/** The decisive check: what the chooser will actually compute. */
async function report(userId: string) {
  const roles = await heldRoles(userId);
  console.log("\nheldRoles() — what the login-as chooser renders:");
  for (const r of roles) console.log(`  ${r.role.padEnd(14)} ${r.status}`);
  if (REMOVE || DRY_RUN) return;
  const fleetRole = roles.find((r) => r.role === "fleet_owner");
  if (fleetRole?.status !== "active") {
    console.error(
      `\n✗ fleet_owner resolves "${fleetRole?.status ?? "absent"}", not "active" — the chooser row is NOT` +
        " enterable and the fleet portal stays unreachable.",
    );
    process.exit(1);
  }
}

void main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`✗ seed-fleet-owner-fixture failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
