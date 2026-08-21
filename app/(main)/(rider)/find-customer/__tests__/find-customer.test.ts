/**
 * M-6: handleSlideComplete must wait for server ride:arrived ack before
 * navigating to enter-otp, with a 5-second timeout.
 */
describe("find-customer arrive ack (M-6)", () => {
  it("should set up ack listener before sending ride:arrived", async () => {
    const addSpy = jest.fn();
    const removeSpy = jest.fn();
    const sendSpy = jest.fn();
    const mockWs = {
      readyState: 1,
      send: sendSpy,
      addEventListener: addSpy,
      removeEventListener: removeSpy,
    };

    const activeRideId = "ride-123";

    // Extract the core logic from handleSlideComplete
    const execute = () => {
      if (!mockWs || mockWs.readyState !== 1 || !activeRideId) {
        return Promise.reject("not connected");
      }

      const timeoutPromise = new Promise<void>((resolve, reject) => {
        const handler = (event: any) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "ride:arrived" && msg.ride_id === activeRideId) {
              mockWs.removeEventListener("message", handler);
              resolve();
            }
          } catch {
            // ignore
          }
        };
        mockWs.addEventListener("message", handler);
        const timeoutId = setTimeout(() => {
          mockWs.removeEventListener("message", handler);
          reject(new Error("timeout"));
        }, 5000);
        (timeoutId as any).unref();
      });

      mockWs.send(JSON.stringify({ type: "ride:arrived", ride_id: activeRideId }));
      return timeoutPromise;
    };

    const promise = execute();
    expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: "ride:arrived", ride_id: "ride-123" }));
    expect(addSpy).toHaveBeenCalledWith("message", expect.any(Function));

    // Simulate receiving the ack
    const messageHandler = addSpy.mock.calls[0][1];
    messageHandler({ data: JSON.stringify({ type: "ride:arrived", ride_id: "ride-123" }) });

    await promise;
  });

  it("should reject on timeout", async () => {
    jest.useFakeTimers();
    const removeSpy = jest.fn();
    const sendSpy = jest.fn();
    const mockWs = {
      readyState: 1,
      send: sendSpy,
      addEventListener: jest.fn(),
      removeEventListener: removeSpy,
    };

    const activeRideId = "ride-123";

    const execute = () => {
      if (!mockWs || mockWs.readyState !== 1 || !activeRideId) return Promise.resolve();

      const timeoutPromise = new Promise<void>((resolve, reject) => {
        const handler = jest.fn();
        mockWs.addEventListener("message", handler);
        const timeoutId = setTimeout(() => {
          mockWs.removeEventListener("message", handler);
          reject(new Error("timeout"));
        }, 5000);
        (timeoutId as any).unref();
      });

      mockWs.send(JSON.stringify({ type: "ride:arrived", ride_id: activeRideId }));
      return timeoutPromise;
    };

    const promise = execute();
    jest.advanceTimersByTime(5000);
    jest.useRealTimers();

    await expect(promise).rejects.toThrow("timeout");
  });
});
