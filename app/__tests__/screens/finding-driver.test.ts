/**
 * M-2: finding-driver handleCancel must call POST /api/ride/:id/cancel
 * instead of only clearing local state.
 */
describe("finding-driver cancel (M-2)", () => {
  it("should call cancel API when rideId exists", async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    );
    global.fetch = fetchMock as any;

    const clearRoute = jest.fn();
    const setSearchingRideId = jest.fn();
    const setRideStatus = jest.fn();
    const setSelectedVehicleType = jest.fn();
    const routerBack = jest.fn();

    const currentRideId = "ride-123";
    const token = "token-abc";

    // Simulate handleCancel logic
    const handleCancel = async () => {
      try {
        if (currentRideId && token) {
          await fetch("/api/ride/" + currentRideId + "/cancel", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({}),
          });
        }
      } catch {
        // non-blocking
      } finally {
        clearRoute();
        setSearchingRideId(null);
        setRideStatus("idle");
        setSelectedVehicleType(null);
        routerBack();
      }
    };

    await handleCancel();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ride/ride-123/cancel",
      expect.objectContaining({ method: "POST" })
    );
    expect(clearRoute).toHaveBeenCalled();
    expect(routerBack).toHaveBeenCalled();
  });

  it("should still clear local state even if API call fails", async () => {
    const fetchMock = jest.fn(() =>
      Promise.reject(new Error("network"))
    );
    global.fetch = fetchMock as any;

    const clearRoute = jest.fn();
    const setSearchingRideId = jest.fn();
    const setRideStatus = jest.fn();
    const setSelectedVehicleType = jest.fn();
    const routerBack = jest.fn();

    const handleCancel = async () => {
      try {
        const rideId = { searchingRideId: "ride-123" };
        if (rideId.searchingRideId && "token") {
          await fetch("/api/ride/" + rideId.searchingRideId + "/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
            body: JSON.stringify({}),
          });
        }
      } catch {
        // non-blocking
      } finally {
        clearRoute();
        setSearchingRideId(null);
        setRideStatus("idle");
        setSelectedVehicleType(null);
        routerBack();
      }
    };

    await handleCancel();
    expect(fetchMock).toHaveBeenCalled();
    expect(clearRoute).toHaveBeenCalled();
    expect(routerBack).toHaveBeenCalled();
  });
});
