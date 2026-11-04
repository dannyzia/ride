/**
 * ws-recipient-routing.test.ts — WebSocket Recipient Routing Correctness Audit (ISSUE-41, Theme 13).
 *
 * Formally verifies that utils-server WebSocket routing guarantees:
 *  1. Reconnected / superseded sockets are immediately isolated and receive 0 subsequent messages (BUG-WS-084).
 *  2. Sequential dispatch offers are strictly single-recipient; expired/previous candidates receive 0 subsequent offers (BUG-EVENT-004).
 *  3. Terminated / closed connections are pruned from routing tables and receive 0 messages.
 *  4. Direct user routing (sendToUser) accurately routes to either rider or driver and isolates bystanders.
 *  5. Emergency / SOS counterparty messages fan out strictly to the active trip counterparty and admins (C3-7).
 *  6. In-app chat messages are strictly delivered to the counterparty on that specific ride.
 *  7. Trip lifecycle events (arrived, completed, cancelled) route strictly to authorized parties.
 */

jest.mock("../../src/db", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    transaction: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { MockWebSocket, WsRecipientHarness, WS_READY_STATE } from "../wsRecipientHarness";
import { registerBidder, unregisterBidder, sendToBidder } from "../rentalHandler";

describe("WebSocket Recipient Routing Audit (ISSUE-41 / Theme 13)", () => {
  let harness: WsRecipientHarness;

  beforeEach(() => {
    harness = new WsRecipientHarness();
  });

  // ── Scenario 1: Socket Supersession & Reconnection (BUG-WS-084) ────────────

  describe("Scenario 1: Rapid Reconnection & Socket Replacement Isolation (BUG-WS-084)", () => {
    it("should terminate driver's previous socket on reconnect and isolate it from future messages", () => {
      const socket1 = new MockWebSocket("driver-sock-1");
      const socket2 = new MockWebSocket("driver-sock-2");

      // Driver connects with socket1
      harness.connectDriver("drv-1", "user-drv-1", socket1);
      expect(socket1.readyState).toBe(WS_READY_STATE.OPEN);
      expect(harness.connectedDrivers.get("drv-1")?.ws).toBe(socket1);

      // Driver reconnects with socket2
      harness.connectDriver("drv-1", "user-drv-1", socket2);

      // Socket 1 must be closed
      expect(socket1.readyState).toBe(WS_READY_STATE.CLOSED);
      expect(harness.connectedDrivers.get("drv-1")?.ws).toBe(socket2);

      // Emit an event to the driver
      harness.sendToDriver("drv-1", { type: "ride:offer", ride_id: "ride-101" });

      // Socket 2 receives the event
      harness.assertReceived(socket2, "ride:offer", { ride_id: "ride-101" });

      // Socket 1 receives ZERO messages
      harness.assertZeroMessages(socket1);
    });

    it("should terminate rider's previous socket on reconnect and isolate it from future messages", () => {
      const socket1 = new MockWebSocket("rider-sock-1");
      const socket2 = new MockWebSocket("rider-sock-2");

      harness.connectRider("user-rdr-1", socket1);
      harness.connectRider("user-rdr-1", socket2);

      expect(socket1.readyState).toBe(WS_READY_STATE.CLOSED);
      expect(harness.connectedRiders.get("user-rdr-1")?.ws).toBe(socket2);

      harness.routeRideCompleted("ride-101", "user-rdr-1", {
        total_bdt: 25000,
        payment_method: "cash",
      });

      harness.assertReceived(socket2, "ride:completed", { total_bdt: 25000 });
      harness.assertZeroMessages(socket1);
    });

    it("should terminate admin's previous socket on reconnect and isolate it from broadcasts", () => {
      const socket1 = new MockWebSocket("admin-sock-1");
      const socket2 = new MockWebSocket("admin-sock-2");

      harness.connectAdmin("admin-1", socket1);
      harness.connectAdmin("admin-1", socket2);

      expect(socket1.readyState).toBe(WS_READY_STATE.CLOSED);
      expect(harness.connectedAdmins.get("admin-1")?.ws).toBe(socket2);

      harness.broadcastToAdmins({ type: "admin:sos", alert_id: "alert-1" });

      harness.assertReceived(socket2, "admin:sos", { alert_id: "alert-1" });
      harness.assertZeroMessages(socket1);
    });
  });

  // ── Scenario 2: Sequential Dispatch Candidate Isolation (BUG-EVENT-004) ────

  describe("Scenario 2: Sequential Dispatch Recipient Isolation (BUG-EVENT-004)", () => {
    it("should deliver ride:offer strictly to current candidate and offer:lost to expired candidate", () => {
      const sockD1 = new MockWebSocket("driver-d1");
      const sockD2 = new MockWebSocket("driver-d2");
      const sockD3 = new MockWebSocket("driver-d3");

      harness.connectDriver("drv-1", "user-drv-1", sockD1);
      harness.connectDriver("drv-2", "user-drv-2", sockD2);
      harness.connectDriver("drv-3", "user-drv-3", sockD3);

      // Step 1: Offer Candidate 1
      harness.sendToDriver("drv-1", {
        type: "ride:offer",
        ride_id: "ride-seq-1",
        driver_fare_bdt: 35000,
      });

      harness.assertReceived(sockD1, "ride:offer", { ride_id: "ride-seq-1" });
      harness.assertZeroMessages(sockD2);
      harness.assertZeroMessages(sockD3);

      // Step 2: Candidate 1 expires
      harness.sendToDriver("drv-1", {
        type: "offer:lost",
        ride_id: "ride-seq-1",
        reason: "expired",
      });

      harness.assertReceived(sockD1, "offer:lost", { reason: "expired" });

      // Step 3: Offer Candidate 2
      harness.sendToDriver("drv-2", {
        type: "ride:offer",
        ride_id: "ride-seq-1",
        driver_fare_bdt: 35000,
      });

      harness.assertReceived(sockD2, "ride:offer", { ride_id: "ride-seq-1" });

      // Assert Candidate 1 received NO new messages when Candidate 2 was offered
      expect(harness.getMessages(sockD1)).toHaveLength(2); // exactly [ride:offer, offer:lost]
      harness.assertZeroMessages(sockD3);
    });

    it("should never leak ride:matched to unassigned or rejected drivers", () => {
      const sockRider = new MockWebSocket("rider-sock");
      const sockD1 = new MockWebSocket("driver-d1");
      const sockD2 = new MockWebSocket("driver-d2");

      harness.connectRider("rider-1", sockRider);
      harness.connectDriver("drv-1", "user-d1", sockD1);
      harness.connectDriver("drv-2", "user-d2", sockD2);

      // drv-2 accepts the ride
      const matchMsg = {
        type: "ride:matched",
        ride_id: "ride-match-1",
        driver: { name: "Ahmed", rating: 4.9 },
      };

      harness.sendToRider("rider-1", matchMsg);
      harness.sendToDriver("drv-2", matchMsg);

      // Assigned driver and rider receive match
      harness.assertReceived(sockRider, "ride:matched");
      harness.assertReceived(sockD2, "ride:matched");

      // Rejected/unassigned driver receives zero match messages
      harness.assertZeroMessages(sockD1);
    });
  });

  // ── Scenario 3: Disconnected / Closed Socket Routing Pruning ───────────────

  describe("Scenario 3: Closed Connection Pruning & No Leaks", () => {
    it("should cleanly prune disconnected driver and drop subsequent dispatches", () => {
      const socket = new MockWebSocket("driver-d1");
      harness.connectDriver("drv-1", "user-d1", socket);

      expect(harness.connectedDrivers.has("drv-1")).toBe(true);

      // Socket disconnects
      socket.close();

      // Pruned from registry
      expect(harness.connectedDrivers.has("drv-1")).toBe(false);

      // Attempt to send
      const delivered = harness.sendToDriver("drv-1", { type: "ride:cancelled", ride_id: "r1" });
      expect(delivered).toBe(false);
      harness.assertZeroMessages(socket);
    });

    it("should cleanly prune disconnected rider and drop subsequent dispatches", () => {
      const socket = new MockWebSocket("rider-r1");
      harness.connectRider("rider-1", socket);

      expect(harness.connectedRiders.has("rider-1")).toBe(true);

      socket.close();

      expect(harness.connectedRiders.has("rider-1")).toBe(false);

      const delivered = harness.sendToRider("rider-1", { type: "ride:status", status: "completed" });
      expect(delivered).toBe(false);
      harness.assertZeroMessages(socket);
    });
  });

  // ── Scenario 4: User ID Routing (sendToUser) ───────────────────────────────

  describe("Scenario 4: Polymorphic User Routing (sendToUser)", () => {
    it("should route to rider when target user is connected as rider", () => {
      const sockR = new MockWebSocket("sock-r");
      const sockD = new MockWebSocket("sock-d");

      harness.connectRider("user-common-1", sockR);
      harness.connectDriver("drv-99", "user-common-2", sockD);

      const delivered = harness.sendToUser("user-common-1", { type: "alert:custom", body: "hello" });
      expect(delivered).toBe(true);

      harness.assertReceived(sockR, "alert:custom");
      harness.assertZeroMessages(sockD);
    });

    it("should route to driver when target user is connected as driver", () => {
      const sockR = new MockWebSocket("sock-r");
      const sockD = new MockWebSocket("sock-d");

      harness.connectRider("user-r", sockR);
      harness.connectDriver("drv-1", "user-d", sockD);

      const delivered = harness.sendToUser("user-d", { type: "alert:driver", body: "shift" });
      expect(delivered).toBe(true);

      harness.assertReceived(sockD, "alert:driver");
      harness.assertZeroMessages(sockR);
    });

    it("should return false and deliver nothing if user is not connected", () => {
      const sockR = new MockWebSocket("sock-r");
      harness.connectRider("user-r", sockR);

      const delivered = harness.sendToUser("user-unconnected", { type: "ping" });
      expect(delivered).toBe(false);
      harness.assertZeroMessages(sockR);
    });
  });

  // ── Scenario 5: Emergency & SOS Counterparty Isolation (C3-7) ──────────────

  describe("Scenario 5: SOS Alert & Counterparty Delivery (C3-7)", () => {
    it("should route rider SOS strictly to assigned driver and all admins, isolating bystanders", () => {
      const sockRider = new MockWebSocket("rider-sock");
      const sockAssignedDriver = new MockWebSocket("driver-assigned-sock");
      const sockBystanderDriver = new MockWebSocket("driver-bystander-sock");
      const sockBystanderRider = new MockWebSocket("rider-bystander-sock");
      const sockAdmin1 = new MockWebSocket("admin-1-sock");
      const sockAdmin2 = new MockWebSocket("admin-2-sock");

      harness.connectRider("rider-10", sockRider);
      harness.connectDriver("drv-10", "user-d10", sockAssignedDriver);
      harness.connectDriver("drv-99", "user-d99", sockBystanderDriver);
      harness.connectRider("rider-99", sockBystanderRider);
      harness.connectAdmin("admin-1", sockAdmin1);
      harness.connectAdmin("admin-2", sockAdmin2);

      const alert = {
        id: "alert-001",
        role: "rider" as const,
        user_id: "rider-10",
        ride_id: "ride-active-1",
        latitude: "23.8103",
        longitude: "90.4125",
      };

      const result = harness.routeSosAlert(alert, (rideId) => {
        if (rideId === "ride-active-1") {
          return { user_id: "rider-10", driver_id: "drv-10" };
        }
        return null;
      });

      expect(result.adminDelivered).toBe(2);
      expect(result.counterpartyDelivered).toBe(true);

      // 1. Both admins receive admin:sos
      harness.assertReceived(sockAdmin1, "admin:sos", { alert });
      harness.assertReceived(sockAdmin2, "admin:sos", { alert });

      // 2. Assigned driver receives sos:counterparty with from_role='rider'
      harness.assertReceived(sockAssignedDriver, "sos:counterparty", {
        alert_id: "alert-001",
        from_role: "rider",
        ride_id: "ride-active-1",
      });

      // 3. Bystanders receive NOTHING
      harness.assertZeroMessages(sockBystanderDriver);
      harness.assertZeroMessages(sockBystanderRider);

      // 4. Triggering rider does not receive counterparty reflection
      harness.assertZeroMessages(sockRider);
    });

    it("should route driver SOS strictly to assigned rider and all admins", () => {
      const sockRider = new MockWebSocket("rider-assigned");
      const sockDriver = new MockWebSocket("driver-sender");
      const sockAdmin = new MockWebSocket("admin-sock");

      harness.connectRider("rider-20", sockRider);
      harness.connectDriver("drv-20", "user-d20", sockDriver);
      harness.connectAdmin("admin-boss", sockAdmin);

      const alert = {
        id: "alert-002",
        role: "driver" as const,
        user_id: "user-d20",
        ride_id: "ride-active-2",
        latitude: "23.7500",
        longitude: "90.3800",
      };

      const result = harness.routeSosAlert(alert, () => ({
        user_id: "rider-20",
        driver_id: "drv-20",
      }));

      expect(result.counterpartyDelivered).toBe(true);

      // Rider receives safe-exit banner
      harness.assertReceived(sockRider, "sos:counterparty", {
        alert_id: "alert-002",
        from_role: "driver",
      });
      harness.assertReceived(sockAdmin, "admin:sos");
      harness.assertZeroMessages(sockDriver);
    });
  });

  // ── Scenario 6: In-App Chat Routing Isolation ─────────────────────────────

  describe("Scenario 6: In-App Chat Message Isolation", () => {
    it("should deliver chat message strictly to destination user in the ride", () => {
      const sockSender = new MockWebSocket("rider-sender");
      const sockReceiver = new MockWebSocket("driver-receiver");
      const sockBystander = new MockWebSocket("driver-bystander");

      harness.connectRider("rider-user-1", sockSender);
      harness.connectDriver("drv-1", "driver-user-1", sockReceiver);
      harness.connectDriver("drv-2", "driver-user-2", sockBystander);

      const chatPayload = {
        text: "I am waiting near the pharmacy",
        sender_role: "rider",
      };

      const delivered = harness.routeChatMessage("ride-chat-1", "driver-user-1", chatPayload);
      expect(delivered).toBe(true);

      harness.assertReceived(sockReceiver, "chat:message", {
        ride_id: "ride-chat-1",
        message: chatPayload,
      });

      harness.assertZeroMessages(sockSender);
      harness.assertZeroMessages(sockBystander);
    });
  });

  // ── Scenario 7: Trip Lifecycle Event Routing ──────────────────────────────

  describe("Scenario 7: Trip Lifecycle Event Recipient Routing", () => {
    it("should route driver arrival strictly to rider", () => {
      const sockR = new MockWebSocket("r-sock");
      const sockD = new MockWebSocket("d-sock");

      harness.connectRider("rider-1", sockR);
      harness.connectDriver("drv-1", "user-d1", sockD);

      harness.routeDriverArrived("ride-arrive-1", "rider-1", "2026-11-04T12:00:00Z");

      harness.assertReceived(sockR, "ride:arrived", {
        ride_id: "ride-arrive-1",
        arrived_at: "2026-11-04T12:00:00Z",
      });
      harness.assertZeroMessages(sockD);
    });

    it("should route ride cancellation strictly to designated driver", () => {
      const sockD1 = new MockWebSocket("d1-sock");
      const sockD2 = new MockWebSocket("d2-sock");

      harness.connectDriver("drv-1", "user-d1", sockD1);
      harness.connectDriver("drv-2", "user-d2", sockD2);

      harness.routeRideCancelled("drv-1", "ride-c-1", "rider");

      harness.assertReceived(sockD1, "ride:cancelled", {
        ride_id: "ride-c-1",
        cancelled_by: "rider",
      });
      harness.assertZeroMessages(sockD2);
    });
  });

  // ── Scenario 8: Rental Marketplace Bidder Isolation (BUG-MKT-012) ──────────

  describe("Scenario 8: Rental Marketplace Bidder Isolation (BUG-MKT-012)", () => {
    it("should deliver rental events strictly to active registered bidder and ignore unregistered", () => {
      const mockWs1 = new MockWebSocket("bidder-1-sock");
      const mockWs2 = new MockWebSocket("bidder-2-sock");

      // Register bidder 1
      registerBidder("user-bidder-1", mockWs1 as any);

      sendToBidder("user-bidder-1", "rental:bid_awarded", { request_id: "rent-1" });

      expect(mockWs1.sent).toHaveLength(1);
      expect(mockWs1.sent[0].parsed).toEqual({
        type: "rental:bid_awarded",
        request_id: "rent-1",
      });

      // Send to unregistered bidder 2
      sendToBidder("user-bidder-2", "rental:bid_awarded", { request_id: "rent-1" });
      expect(mockWs2.sent).toHaveLength(0);

      // Unregister bidder 1 and assert subsequent sends are dropped
      unregisterBidder("user-bidder-1");
      sendToBidder("user-bidder-1", "rental:cancelled", { request_id: "rent-1" });
      expect(mockWs1.sent).toHaveLength(1); // unchanged
    });
  });
});
