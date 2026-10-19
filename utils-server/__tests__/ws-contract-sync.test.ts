// @ts-nocheck — source-text contract sync check (house pattern:
// tests/api/scheduler/scheduler-phase0.test.ts scheduler-source pins).
/**
 * B5-4 sync check — utils-server/types.ts round-trips against the handlers.
 *
 * Every domain event declared in types.ts must occur in its handler source,
 * and the retired delivery:* domain must NOT be declared. Deleting a handler
 * case without updating the contract (or vice versa) fails this suite.
 * B-8 banner in types.ts points here.
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const TYPES = read("types.ts");
const INDEX = read("index.ts");
const RENTAL = read("rentalHandler.ts");
const SHOP = read("shopHandler.ts");
const EMERGENCY = read("emergencyHandler.ts");
const CHAIN = read("emergencyChain.ts");

describe("B5-4 — WS contract sync (types.ts ↔ handlers)", () => {
  it("declares no delivery:* domain (B5-1 retired it)", () => {
    expect(TYPES).not.toMatch(/delivery:[a-z_]+/);
  });

  it("rental relay vocabulary matches rentalHandler cases", () => {
    for (const ev of [
      "rental:bid_request",
      "rental:new_bid",
      "rental:bid_won",
      "rental:bid_settled",
      "rental:driver_assigned",
      "rental:fleet_ack",
      "rental:status",
    ]) {
      expect(TYPES).toContain(`"${ev}"`);
      expect(RENTAL).toContain(`case "${ev}"`);
    }
  });

  it("shop relay shapes match shopHandler cases", () => {
    for (const ev of [
      "shop:order_status",
      "shop:rfq_quote",
      "shop:new_rfq",
      "shop:delivery_created",
    ]) {
      expect(TYPES).toContain(`"${ev}"`);
      expect(SHOP).toContain(`case "${ev}"`);
    }
  });

  it("emergency inbound + acks match emergencyHandler; relays match chain/index", () => {
    for (const ev of ["emergency:accept", "emergency:status", "emergency:cancel"]) {
      expect(TYPES).toContain(`"${ev}"`);
      expect(EMERGENCY).toContain(`case "${ev}"`);
    }
    for (const ev of ["emergency:accepted", "emergency:status_ack", "emergency:cancel_ack"]) {
      expect(TYPES).toContain(`"${ev}"`);
      expect(EMERGENCY).toContain(`"${ev}"`);
    }
    expect(TYPES).toContain('"emergency:new_request"');
    expect(CHAIN).toContain('"emergency:new_request"');
    expect(TYPES).toContain('"emergency:location"');
    expect(INDEX).toContain('"emergency:location"');
  });

  it("auth hello/ok admit shop; chat:typing + location:driver carry live fields", () => {
    expect(TYPES).toContain('role: "driver" | "rider" | "admin" | "shop"');
    expect(INDEX).toContain('role === "shop"');
    // Inbound typing fields the S-1 check reads.
    expect(TYPES).toContain("recipient_user_id: string");
    expect(TYPES).toContain("sender_user_id: string");
    expect(INDEX).toContain("recipient_user_id");
    // Outbound driver-location fields the branch forwards.
    expect(TYPES).toContain("eta_minutes: number | null");
    expect(INDEX).toContain("eta_minutes: msg.eta_minutes");
  });
});
