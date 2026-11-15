#!/usr/bin/env node
/**
 * Throwaway fixture for verifying the delivery hub on device.
 *   node .device-shots/seed-fixture.cjs seed     -> create auth user + users row + couriers row
 *   node .device-shots/seed-fixture.cjs state <NO_PRODUCT|ACTIVE|OWING|LAPSED>
 *   node .device-shots/seed-fixture.cjs clean    -> delete everything this script created
 * The operator rows are scoped to this one courier id; nothing else is touched.
 */
const fs = require("fs");
const path = require("path");

const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
  .split(/\r?\n/)
  .forEach((l) => {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });

const PHONE = "8801700990099";
const PLUS = "+" + PHONE;
const PASSWORD = "test1234";
const COURIER_NAME = "E2E Delivery Courier";

const { Client } = require("pg");
const db = async (fn) => {
  const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
};

async function adminCreateUser() {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ phone: PLUS, password: PASSWORD, phone_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) return { existing: true, body };
  return { existing: false, id: body.id };
}

async function adminFindUser() {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const body = await res.json();
  const u = (body.users || []).find((x) => (x.phone || "").replace(/^\+/, "") === PHONE);
  return u ? u.id : null;
}

(async () => {
  const cmd = process.argv[2] || "seed";

  if (cmd === "seed") {
    let authId = await adminFindUser();
    if (!authId) {
      const created = await adminCreateUser();
      authId = created.id;
      if (!authId) throw new Error("auth create failed: " + JSON.stringify(created.body).slice(0, 300));
      console.log("auth user created", authId);
    } else {
      console.log("auth user already exists", authId);
      // Make sure the fixture password matches the canonical test password.
      await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${authId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ password: PASSWORD, phone_confirm: true }),
      });
    }

    const out = await db(async (c) => {
      const existing = await c.query("select id from users where auth_uid=$1", [authId]);
      let userId = existing.rows[0]?.id;
      if (!userId) {
        const ins = await c.query(
          "insert into users (id, auth_uid, phone, name, role) values (gen_random_uuid(), $1, $2, $3, 'delivery_man') returning id",
          [authId, PLUS, COURIER_NAME],
        );
        userId = ins.rows[0].id;
      }
      const courier = await c.query(
        "select id from couriers where user_id=$1 and courier_type='food'",
        [userId],
      );
      let courierId = courier.rows[0]?.id;
      if (!courierId) {
        const ins = await c.query(
          "insert into couriers (user_id, courier_type, status) values ($1, 'food', 'active') returning id",
          [userId],
        );
        courierId = ins.rows[0].id;
      }
      return { userId, courierId };
    });
    console.log(JSON.stringify({ authId, ...out }));
    return;
  }

  if (cmd === "state") {
    const state = process.argv[3];
    const ids = await db(async (c) => {
      const u = await c.query("select id from users where auth_uid=(select id from users where phone=$1 limit 1) or phone=$1 limit 1", [PHONE]);
      const userId = u.rows[0].id;
      const cr = await c.query("select id from couriers where user_id=$1 and courier_type='food'", [userId]);
      return { userId, courierId: cr.rows[0].id };
    });
    const pkgId = await db(async (c) => {
      const p = await c.query("select id from packages where product_type is not null order by price_bdt limit 1");
      return p.rows[0]?.id ?? null;
    });
    await db(async (c) => {
      // Reset this operator's fixture rows, then build the requested state.
      await c.query("delete from operator_bills where operator_role='delivery' and operator_id=$1", [ids.courierId]);
      await c.query("delete from operator_packages where operator_role='delivery' and operator_id=$1", [ids.courierId]);
      if (state === "NO_PRODUCT") return;
      if (!pkgId) throw new Error("no package row to attach");
      const expires = state === "LAPSED" ? "now() - interval '1 day'" : "now() + interval '30 days'";
      await c.query(
        `insert into operator_packages (operator_role, operator_id, package_id, status, started_at, expires_at)
         values ('delivery', $1, $2, 'active', now() - interval '1 day', ${expires})`,
        [ids.courierId, pkgId],
      );
      if (state === "OWING") {
        await c.query(
          `insert into operator_bills (operator_role, operator_id, kind, amount_bdt, status)
           values ('delivery', $1, 'usage', 15000, 'open')`,
          [ids.courierId],
        );
      }
    });
    console.log("state set:", state, JSON.stringify(ids));
    return;
  }

  if (cmd === "clean") {
    const ids = await db(async (c) => {
      const u = await c.query("select id from users where phone=$1 limit 1", [PHONE]);
      if (!u.rows[0]) return null;
      const cr = await c.query("select id from couriers where user_id=$1 and courier_type='food'", [u.rows[0].id]);
      return { userId: u.rows[0].id, courierId: cr.rows[0]?.id };
    });
    if (ids?.courierId) {
      await db(async (c) => {
        await c.query("delete from operator_bills where operator_role='delivery' and operator_id=$1", [ids.courierId]);
        await c.query("delete from operator_packages where operator_role='delivery' and operator_id=$1", [ids.courierId]);
        await c.query("delete from couriers where id=$1", [ids.courierId]);
      });
    }
    if (ids?.userId) await db((c) => c.query("delete from users where id=$1", [ids.userId]));
    const authId = await adminFindUser();
    if (authId) {
      await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${authId}`, {
        method: "DELETE",
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
    }
    console.log("cleaned", JSON.stringify(ids));
    return;
  }
  console.error("unknown command", cmd);
  process.exit(2);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
