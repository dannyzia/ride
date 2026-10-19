// C3-6 (STAGE C3-FIX): the rider-facing match card builder. Deliberately
// carries NO phone — in-app chat is the contact channel; masked call is
// DEFERRED (D-x, provider). Any future field added here is rider-visible by
// construction, so raw PII must never be added.

export interface MatchedDriverCard {
  name: string;
  rating: number | null;
  vehicle_type: string;
}

export function buildMatchedDriverCard(row?: {
  name?: string | null;
  rating?: string | number | null;
  vehicle_type?: string | null;
} | null): MatchedDriverCard {
  return {
    name: row?.name ?? "",
    rating: row?.rating != null ? Number(row.rating) : null,
    vehicle_type: row?.vehicle_type ?? "",
  };
}
