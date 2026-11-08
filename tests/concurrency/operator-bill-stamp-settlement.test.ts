/**
 * Batch-2 Item 7 — non-driver settlement through the initiation stamp.
 *
 * Covers, on real Postgres:
 *   1. a shop bill stamped with an event settles via that stamp (bill →
 *      settled, event → paid), with the stamp preserved;
 *   2. a retry overwrites the stamp with its own event and settles on it (the
 *      failed first event stays failed — one event still settles at most one
 *      bill);
 *   3. replaying a settled event is a no-op (null) and never re-touches rows.
 *
 * Gated: RUN_CONCURRENCY_TESTS=1 + SCRATCH_DATABASE_URL (never the shared dev
 * project — tests/concurrency/scratch-db-url.ts). Default suite: skip, zero
 * connections (tests/meta/concurrency-gate.test.ts). Requires migrations 0095
 * and 0098 applied on the scratch DB.
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";
import { randomUUID } from "crypto";
import { requireScratchDbUrl } from "./scratch-db-url";
import { db, recyclePool } from "@/src/db";
import { eq, inArray } from "drizzle-orm";
import { operatorBills, paymentEvents } from "@/src/db/schema";
import { accrueUsageBill, settleSubscriptionBill } from "@/lib/billsLedger";

const RUN = process.env.RUN_CONCURRENCY_TESTS === "1";
const T = RUN ? it : it.skip;
const DB_URL = process.env.SCRATCH_DATABASE_URL || process.env.DATABASE_URL;
const ORIG_DB_URL = process.env.DATABASE_URL;
const CASE_TIMEOUT_MS = 60_000;

let scratch: ReturnType<typeof postgresTag>;
const operatorIds: string[] = [];
const eventKeys: string[] = [];

beforeAll(async () => {
  requireScratchDbUrl();
  scratch = postgresTag(DB_URL!, { max: 4, connect_timeout: 15 });
  const [ok] = await scratch.unsafe<{ operator_bills: unknown }[]>(
    "SELECT to_regclass('public.operator_bills') AS operator_bills",
  );
  if (!ok.operator_bills) {
    throw new Error(
      "operator_bills is missing on SCRATCH_DATABASE_URL — run drizzle-kit push against it first",
    );
  }
  process.env.DATABASE_URL = DB_URL;
  recyclePool();
}, 120_000);

afterAll(async () => {
  process.env.DATABASE_URL = ORIG_DB_URL;
  await scratch?.end({ timeout: 5 }).catch(() => {});
}, 120_000);

afterEach(async () => {
  try {
    if (operatorIds.length > 0) {
      await db.delete(operatorBills).where(inArray(operatorBills.operator_id, operatorIds));
    }
    if (eventKeys.length > 0) {
      await db.delete(paymentEvents).where(inArray(paymentEvents.idempotency_key, eventKeys));
    }
  } catch {
    // best-effort teardown
  }
  operatorIds.length = 0;
  eventKeys.length = 0;
});

/** The purchase gate's figure for this shop (operator_unpaid_obligations). */
async function owedTotal(operatorId: string): Promise<number> {
  const [row] = await scratch.unsafe<{ total_unpaid_paisa: string | number }[]>(
    "SELECT total_unpaid_paisa FROM operator_unpaid_obligations WHERE operator_role = 'shop' AND operator_id = $1",
    [operatorId],
  );
  return Number(row?.total_unpaid_paisa ?? 0);
}

async function seedSettlementEvent(amountBdt = 5_000): Promise<string> {
  const key = `conc-op-settle-${randomUUID()}`;
  eventKeys.push(key);
  const [evt] = await db
    .insert(paymentEvents)
    .values({
      provider: "portpos",
      idempotency_key: key,
      amount_bdt: amountBdt,
      purpose: "subscription_settlement",
      status: "callback_pending",
    })
    .returning({ id: paymentEvents.id });
  return evt.id;
}

async function seedShopBill(
  amountBdt = 5_000,
  paymentEventId: string | null = null,
  kind: "subscription_purchase" | "usage" = "subscription_purchase",
) {
  const operatorId = randomUUID();
  operatorIds.push(operatorId);
  const [bill] = await db
    .insert(operatorBills)
    .values({
      operator_role: "shop",
      operator_id: operatorId,
      amount_bdt: amountBdt,
      status: "open",
      kind,
      // Batch-2 Item 8: usage bills are payable anytime (D6).
      due_at: null,
      payment_event_id: paymentEventId,
    })
    .returning({ id: operatorBills.id });
  return { billId: bill.id, operatorId };
}

async function readBill(billId: string) {
  const [row] = await db
    .select({
      status: operatorBills.status,
      payment_event_id: operatorBills.payment_event_id,
    })
    .from(operatorBills)
    .where(eq(operatorBills.id, billId))
    .limit(1);
  return row;
}

async function readEventStatus(eventId: string) {
  const [row] = await db
    .select({ status: paymentEvents.status })
    .from(paymentEvents)
    .where(eq(paymentEvents.id, eventId))
    .limit(1);
  return row?.status;
}

describe("operator bill settlement by pre-stamp", () => {
  T(
    "a stamped shop bill settles and the event is marked paid",
    async () => {
      const eventId = await seedSettlementEvent();
      const { billId } = await seedShopBill(5_000, eventId);

      const result = await db.transaction(async (tx) =>
        settleSubscriptionBill(tx, { eventId }),
      );

      expect(result).toMatchObject({ billId, billIds: [billId] });
      expect(await readBill(billId)).toMatchObject({
        status: "settled",
        payment_event_id: eventId,
      });
      expect(await readEventStatus(eventId)).toBe("paid");
    },
    CASE_TIMEOUT_MS,
  );

  T(
    "a retry overwrites the stamp and settles on its own event",
    async () => {
      const firstEvent = await seedSettlementEvent();
      const { billId } = await seedShopBill(5_000, firstEvent);

      // First attempt failed at the gateway: the event is failed, the bill open.
      await db
        .update(paymentEvents)
        .set({ status: "failed" })
        .where(eq(paymentEvents.id, firstEvent));

      // Retry: a NEW event, and the stamp is overwritten with it.
      const secondEvent = await seedSettlementEvent();
      await db
        .update(operatorBills)
        .set({ payment_event_id: secondEvent })
        .where(eq(operatorBills.id, billId));

      const result = await db.transaction(async (tx) =>
        settleSubscriptionBill(tx, { eventId: secondEvent }),
      );

      expect(result).toMatchObject({ billId, billIds: [billId] });
      expect(await readBill(billId)).toMatchObject({
        status: "settled",
        payment_event_id: secondEvent,
      });
      expect(await readEventStatus(secondEvent)).toBe("paid");
      // The superseded event never settles anything.
      expect(await readEventStatus(firstEvent)).toBe("failed");
    },
    CASE_TIMEOUT_MS,
  );

  T(
    "a stamped USAGE bill settles through the same stamp mechanism",
    async () => {
      const eventId = await seedSettlementEvent(1_200);
      const { billId } = await seedShopBill(1_200, eventId, "usage");

      const result = await db.transaction(async (tx) =>
        settleSubscriptionBill(tx, { eventId }),
      );

      expect(result).toMatchObject({ billId, billIds: [billId] });
      expect(await readBill(billId)).toMatchObject({
        status: "settled",
        payment_event_id: eventId,
      });
      expect(await readEventStatus(eventId)).toBe("paid");
    },
    CASE_TIMEOUT_MS,
  );

  T(
    "concurrent accruals serialize into ONE aggregate usage bill",
    async () => {
      const operatorId = randomUUID();
      operatorIds.push(operatorId);

      // Four orders settling at the same instant must not lose an increment
      // (the usage lock) nor open a second slot (the partial unique index).
      await Promise.all(
        Array.from({ length: 4 }, () =>
          db.transaction(async (tx) =>
            accrueUsageBill(tx, { operatorRole: "shop", operatorId, amountBdt: 100 }),
          ),
        ),
      );

      const rows = await db
        .select({ id: operatorBills.id, amount_bdt: operatorBills.amount_bdt })
        .from(operatorBills)
        .where(eq(operatorBills.operator_id, operatorId));

      expect(rows).toHaveLength(1);
      expect(rows[0].amount_bdt).toBe(400);
    },
    CASE_TIMEOUT_MS,
  );

  T(
    "the event barrier is kind-scoped: usage bills share a stamp, subscription bills cannot",
    async () => {
      const eventId = await seedSettlementEvent(2_000);
      // Migration 0100 scopes operator_bills_payment_event_uq to subscription
      // bills, so the aggregated usage rows of two shops may share ONE stamp.
      const a = await seedShopBill(1_000, eventId, "usage");
      const b = await seedShopBill(1_000, eventId, "usage");

      let subscriptionRejected = false;
      try {
        await seedShopBill(1_000, eventId, "subscription_purchase");
      } catch {
        subscriptionRejected = true;
      }
      expect(subscriptionRejected).toBe(true);

      // One payment settles BOTH usage bills.
      const result = await db.transaction(async (tx) =>
        settleSubscriptionBill(tx, { eventId }),
      );
      expect(result?.billIds.sort()).toEqual([a.billId, b.billId].sort());
      expect(await readBill(a.billId)).toMatchObject({ status: "settled" });
      expect(await readBill(b.billId)).toMatchObject({ status: "settled" });
      expect(await readEventStatus(eventId)).toBe("paid");
    },
    CASE_TIMEOUT_MS,
  );

  T(
    "settling the usage bill clears the gate's owed figure (usage-only shop)",
    async () => {
      const eventId = await seedSettlementEvent(2_500);
      const { billId, operatorId } = await seedShopBill(2_500, eventId, "usage");

      // The purchase gate reads this view: >= ৳10 blocks a new package.
      expect(await owedTotal(operatorId)).toBe(2_500);

      await db.transaction(async (tx) => settleSubscriptionBill(tx, { eventId }));

      expect(await owedTotal(operatorId)).toBe(0);
      expect(await readBill(billId)).toMatchObject({ status: "settled" });
    },
    CASE_TIMEOUT_MS,
  );

  T(
    "replaying a settled event is a no-op",
    async () => {
      const eventId = await seedSettlementEvent();
      const { billId } = await seedShopBill(5_000, eventId);

      await db.transaction(async (tx) => settleSubscriptionBill(tx, { eventId }));
      const replay = await db.transaction(async (tx) =>
        settleSubscriptionBill(tx, { eventId }),
      );

      expect(replay).toBeNull();
      expect(await readBill(billId)).toMatchObject({
        status: "settled",
        payment_event_id: eventId,
      });
    },
    CASE_TIMEOUT_MS,
  );
});
