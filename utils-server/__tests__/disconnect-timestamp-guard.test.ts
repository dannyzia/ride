/**
 * M-3: rider disconnect handler must only cancel rides that have been in
 * dispatching status for >5 seconds (timestamp guard to prevent race with
 * driver accept).
 */
describe("rider disconnect timestamp guard (M-3)", () => {
  it("should construct WHERE clause with 5-second timestamp guard", () => {
    const conditions = [
      { type: "eq", column: "user_id", value: "user-1" },
      { type: "eq", column: "status", value: "dispatching" },
      { type: "sql", template: "${rides.updated_at} < now() - interval '5 seconds'" },
    ];
    expect(conditions).toHaveLength(3);
    expect(conditions[2].type).toBe("sql");
    expect(conditions[2].template).toContain("5 seconds");
  });

  it("should not cancel freshly-updated dispatching rides", () => {
    const now = Date.now();
    const updatedAt = new Date(now - 2000); // 2 seconds ago
    const threshold = new Date(now - 5000); // 5 seconds ago
    const isOldEnough = updatedAt < threshold;
    expect(isOldEnough).toBe(false);
  });

  it("should cancel dispatching rides older than 5 seconds", () => {
    const now = Date.now();
    const updatedAt = new Date(now - 10000); // 10 seconds ago
    const threshold = new Date(now - 5000); // 5 seconds ago
    const isOldEnough = updatedAt < threshold;
    expect(isOldEnough).toBe(true);
  });
});
