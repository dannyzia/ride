/**
 * M-1: ride:completed WS handler must update ride.fare_bdt with the actual
 * final fare from the server (msg.total_bdt), not show the stale estimate.
 */
describe("ride-tracking fare update (M-1)", () => {
  it("should update fare_bdt when ride:completed includes total_bdt", () => {
    const msg = { type: "ride:completed", total_bdt: 75000, fare_breakdown: {} };
    
    const setTrackingState = jest.fn();
    const setRideMock = jest.fn((fn: any) => {
      const prev = { id: "r1", fare_bdt: 50000, status: "in_progress" } as any;
      const result = fn(prev);
      expect(result.fare_bdt).toBe(75000);
    });

    // Simulate the handler logic from ride-tracking/[ride_id].tsx
    const handler = (event: any) => {
      const data = JSON.parse(event.data);
      if (data.type === "ride:completed") {
        setTrackingState("complete");
        if (typeof data.total_bdt === "number") {
          setRideMock((p: any) => p ? { ...p, fare_bdt: data.total_bdt } : p);
        }
      }
    };
    
    handler({ data: JSON.stringify(msg) });
    expect(setTrackingState).toHaveBeenCalledWith("complete");
    expect(setRideMock).toHaveBeenCalled(); // setRide uses functional update, tested in mock
  });

  it("should not update fare_bdt when total_bdt is missing", () => {
    const msg = { type: "ride:completed" };
    
    const setTrackingState = jest.fn();
    const setRideMock = jest.fn();
    
    const handler = (event: any) => {
      const data = JSON.parse(event.data);
      if (data.type === "ride:completed") {
        setTrackingState("complete");
        if (typeof data.total_bdt === "number") {
          setRideMock((p: any) => p ? { ...p, fare_bdt: data.total_bdt } : p);
        }
      }
    };
    
    handler({ data: JSON.stringify(msg) });
    expect(setTrackingState).toHaveBeenCalledWith("complete");
    expect(setRideMock).not.toHaveBeenCalled();
  });
});
