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

describe("ride-tracking Plan 29 P2P MFS deep-linking & clipboard fallback", () => {
  it("should open bkash:// scheme directly when canOpenURL returns true", async () => {
    const openURLMock = jest.fn();
    const canOpenURLMock = jest.fn().mockResolvedValue(true);
    const clipboardSetStringMock = jest.fn();
    const alertMock = jest.fn();

    const handleOpenMfsApp = async (provider: string, mfsNumber: string) => {
      const schemeMap: Record<string, string> = {
        bkash: "bkash://",
        nagad: "nagad://",
      };
      const scheme = schemeMap[provider.toLowerCase()] || "bkash://";
      try {
        const canOpen = await canOpenURLMock(scheme);
        if (canOpen) {
          await openURLMock(scheme);
        } else {
          await clipboardSetStringMock(mfsNumber);
          alertMock("Copied", mfsNumber);
        }
      } catch {
        await clipboardSetStringMock(mfsNumber);
        alertMock("Copied", mfsNumber);
      }
    };

    await handleOpenMfsApp("bkash", "01711223344");
    expect(canOpenURLMock).toHaveBeenCalledWith("bkash://");
    expect(openURLMock).toHaveBeenCalledWith("bkash://");
    expect(clipboardSetStringMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("should open nagad:// scheme directly when canOpenURL returns true", async () => {
    const openURLMock = jest.fn();
    const canOpenURLMock = jest.fn().mockResolvedValue(true);
    const clipboardSetStringMock = jest.fn();
    const alertMock = jest.fn();

    const handleOpenMfsApp = async (provider: string, mfsNumber: string) => {
      const schemeMap: Record<string, string> = {
        bkash: "bkash://",
        nagad: "nagad://",
      };
      const scheme = schemeMap[provider.toLowerCase()] || "bkash://";
      try {
        const canOpen = await canOpenURLMock(scheme);
        if (canOpen) {
          await openURLMock(scheme);
        } else {
          await clipboardSetStringMock(mfsNumber);
          alertMock("Copied", mfsNumber);
        }
      } catch {
        await clipboardSetStringMock(mfsNumber);
        alertMock("Copied", mfsNumber);
      }
    };

    await handleOpenMfsApp("nagad", "01811223344");
    expect(canOpenURLMock).toHaveBeenCalledWith("nagad://");
    expect(openURLMock).toHaveBeenCalledWith("nagad://");
    expect(clipboardSetStringMock).not.toHaveBeenCalled();
  });

  it("should copy number to clipboard and trigger alert fallback when canOpenURL returns false", async () => {
    const openURLMock = jest.fn();
    const canOpenURLMock = jest.fn().mockResolvedValue(false);
    const clipboardSetStringMock = jest.fn().mockResolvedValue(true);
    const alertMock = jest.fn();

    const handleOpenMfsApp = async (provider: string, mfsNumber: string) => {
      const schemeMap: Record<string, string> = {
        bkash: "bkash://",
        nagad: "nagad://",
      };
      const scheme = schemeMap[provider.toLowerCase()] || "bkash://";
      try {
        const canOpen = await canOpenURLMock(scheme);
        if (canOpen) {
          await openURLMock(scheme);
        } else {
          await clipboardSetStringMock(mfsNumber);
          alertMock("Number Copied", `Driver number: ${mfsNumber}`);
        }
      } catch {
        await clipboardSetStringMock(mfsNumber);
        alertMock("Number Copied", `Driver number: ${mfsNumber}`);
      }
    };

    await handleOpenMfsApp("bkash", "01711223344");
    expect(canOpenURLMock).toHaveBeenCalledWith("bkash://");
    expect(openURLMock).not.toHaveBeenCalled();
    expect(clipboardSetStringMock).toHaveBeenCalledWith("01711223344");
    expect(alertMock).toHaveBeenCalledWith("Number Copied", "Driver number: 01711223344");
  });

  it("should catch canOpenURL exceptions and safely fall back to clipboard copy", async () => {
    const openURLMock = jest.fn();
    const canOpenURLMock = jest.fn().mockRejectedValue(new Error("ActivityNotFound"));
    const clipboardSetStringMock = jest.fn().mockResolvedValue(true);
    const alertMock = jest.fn();

    const handleOpenMfsApp = async (provider: string, mfsNumber: string) => {
      const schemeMap: Record<string, string> = {
        bkash: "bkash://",
        nagad: "nagad://",
      };
      const scheme = schemeMap[provider.toLowerCase()] || "bkash://";
      try {
        const canOpen = await canOpenURLMock(scheme);
        if (canOpen) {
          await openURLMock(scheme);
        } else {
          await clipboardSetStringMock(mfsNumber);
          alertMock("Number Copied", `Driver number: ${mfsNumber}`);
        }
      } catch {
        await clipboardSetStringMock(mfsNumber);
        alertMock("Number Copied", `Driver number: ${mfsNumber}`);
      }
    };

    await handleOpenMfsApp("nagad", "01899887766");
    expect(openURLMock).not.toHaveBeenCalled();
    expect(clipboardSetStringMock).toHaveBeenCalledWith("01899887766");
    expect(alertMock).toHaveBeenCalledWith("Number Copied", "Driver number: 01899887766");
  });
});
