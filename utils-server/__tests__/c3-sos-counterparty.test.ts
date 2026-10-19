/**
 * C3-7 (STAGE C3-FIX): the sos:counterparty message is role-directed and
 * never batched — one message, one recipient, no contacts/admin folded in.
 */
import { buildSosCounterpartyMessage } from "../sosCounterparty";

const BASE = {
  id: "alert-1",
  latitude: "23.8103",
  longitude: "90.4125",
  ride_id: "ride-1",
};

describe("buildSosCounterpartyMessage (C3-7)", () => {
  it("rider SOS builds the driver-banner message", () => {
    expect(buildSosCounterpartyMessage({ ...BASE, role: "rider" })).toEqual({
      type: "sos:counterparty",
      alert_id: "alert-1",
      ride_id: "ride-1",
      from_role: "rider",
      lat: "23.8103",
      lng: "90.4125",
    });
  });

  it("driver SOS builds the rider safe-exit message", () => {
    const msg = buildSosCounterpartyMessage({ ...BASE, role: "driver" });
    expect(msg?.type).toBe("sos:counterparty");
    expect(msg?.from_role).toBe("driver");
    expect(msg).not.toHaveProperty("contacts");
    expect(msg).not.toHaveProperty("admin");
  });

  it("returns null without ride context (no counterparty to fan out to)", () => {
    expect(buildSosCounterpartyMessage({ ...BASE, role: "rider", ride_id: null })).toBeNull();
  });

  it("returns null for unknown roles", () => {
    expect(buildSosCounterpartyMessage({ ...BASE, role: "admin" })).toBeNull();
  });
});
