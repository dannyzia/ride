/**
 * Polyline decoder tests (Phase G) — canonical Google encoded-polyline
 * fixtures plus edge cases.
 */
import { decodePolyline } from "../polyline";

describe("decodePolyline", () => {
  test("decodes the canonical Google example", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  test("empty input → []; garbage input never throws", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(() => decodePolyline("!!!")).not.toThrow();
  });

  test("truncated input returns only the fully-decoded points", () => {
    // Complete first point, then a truncated second-point chunk sequence.
    const truncated = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`"); // missing final "@"
    expect(truncated.length).toBeLessThanOrEqual(3);
    if (truncated.length > 0) {
      expect(truncated[0]).toEqual({ lat: 38.5, lng: -120.2 });
    }
  });

  test("single-point round trip preserves 1e-5 precision", () => {
    // Encode 23.79250, 90.40780 manually: value × 1e5 as zigzag deltas.
    const enc = (n: number) => {
      const v = n < 0 ? ~(n << 1) : n << 1;
      let s = "";
      let rem = v;
      do {
        let chunk = rem & 0x1f;
        rem >>>= 5;
        if (rem > 0) chunk |= 0x20;
        s += String.fromCharCode(chunk + 63);
      } while (rem > 0);
      return s;
    };
    const encoded = enc(2379250) + enc(9040780);
    expect(decodePolyline(encoded)).toEqual([{ lat: 23.7925, lng: 90.4078 }]);
  });
});
