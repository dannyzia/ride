import { useCallback } from "react";
import { useAppearance } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";
import type { BdtNumbering } from "@/lib/format";

/**
 * React binding for taka formatting (Bengali Numerals plan P2.2 — this hook
 * is the ONLY place the preference becomes load-bearing; `formatBDT` itself
 * never reads it, so `lib/format.ts` stays React-free for its unit tests and
 * non-React importers; precedent: lib/useAppearance.ts is its own file).
 *
 * Phase 2–3 semantics: 'auto' resolves to latn (byte-identical rendering —
 * no visual change anywhere until the Phase 4 flip, which reinterprets
 * 'auto' as "follow i18n.language" in ONE line here). An explicit 'on'/'off'
 * chosen by the user always wins.
 *
 * Returns `(paisa, opts?) => string` delegating to `formatBDT`.
 */
export function useTaka(): (
  paisa: number | null | undefined,
  opts?: { decimals?: boolean },
) => string {
  const pref = useAppearance((s) => s.bengaliNumerals);
  const numbering: BdtNumbering = pref === "on" ? "beng" : "latn";
  return useCallback(
    (paisa, opts) => formatBDT(paisa, { ...opts, numbering }),
    [numbering],
  );
}
