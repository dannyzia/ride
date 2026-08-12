export async function GET() {
  // TODO: Replace with real DB query using authenticated driver ID
  // For now, return mock data so the UI works immediately
  const stats = {
    earnings_bdt: 2450_00, // ৳2,450 in paisa
    trips: 12,
    online_hours: 4.5,
    rating: 4.8,
    acceptance_rate: 92,
  };

  return Response.json(stats);
}
