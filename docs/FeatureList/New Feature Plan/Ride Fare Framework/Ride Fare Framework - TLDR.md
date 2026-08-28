# Ride Fare Framework — TL;DR

*Condensed from [`Ride Fare Framework v6.md`](Ride%20Fare%20Framework%20v6.md). Full spec, config schemas, and calibration data live there — this is the one-pager for fast reference.*

*Provenance (2026-08-28): reconstructed verbatim by the orchestrator from the last verified state (post-REV-3) after the file was deleted untracked from the working tree; REV-4 values applied during reconstruction. Commit immediately.*

> ⚠ **Three lock amendments (decided, not open):** (1) `zone_fee` charges the rider for destination — **amends** the original "never price destination into rider fare" lock. Justification: published flat schedule (airport-fee model) passes the one-honest-sentence test — the rider chose the destination; the driver's stranding is caused by that choice. (2) Pickup fee at flat 1.0× (no category multiplier) — **user correction** replacing the 0.75/0.80/0.90 tiered multiplier. Justification: removes a guessed number; driver-protective; simpler. (3) Pickup free allowances are flat per category (REV-3) — zone-density radii deleted; the time component self-adjusts for traffic. **REV-4 updates the allowance values** (below).

## Objective
Maximize **weekly package renewal rate** via network growth + match quality. Not gross lead volume.

## Non-negotiables
Every charge explainable in one sentence, tied to something the payer caused/can see · no surge · no live hotspot multiplier · road-network km, not haversine · GPS snapshot at accept · 0% commission — subscription is the *only* revenue · lead debited at dispatch offer, not completion · sequential dispatch (one driver at a time) · fuel price = live config.

## Fare Formula
```
final_fare = base_fare + km_rate×trip_km + time_rate×trip_min×night_mult
           + waiting_rate×max(0, wait−grace)×night_mult + pickup_fee + zone_fee
```
- **base_fare** = `base_km × km_rate + ~4min × time_rate` (flag-fall as minimum distance + driver initiation time).
- **km_rate** = fuel + driver-paid maintenance + joma/km (parking removed REV-4 — owner-borne, inside joma).
- **time_rate** = daily_target ÷ expected billed minutes (traffic paid per minute).
- `night_mult` applies to all `time_rate` components (trip, base initiation, waiting).
- Bike/CNG rates stack bottom-up; car rates back-solve from daily target (owner takes 50% of net).
- **grace (free wait)**: bike 1 / CNG 1 / car 2 min (REV-4; was 3/3/4) — Stage 0 monitors waiting-complaint rate.

## Pricing Layer
- **Floor** = formula with surveyed costs (sanity check = minimum fare).
- **Launch price** = market-minus-X per tier, never below floor. Indicative: bikes −10/−15%, CNG −10%, cars at/near market.
- **Commission headroom** (~20–25% of incumbent fares at parity pricing) = subscription budget, 3–4× package coverage.

## Pickup Fee
- Free allowance per category (bike 1.0 km/5 min · CNG 1.5 km/5 min · car 2.0 km/10 min — REV-4, supersedes 1.0/1.2/1.5 km + 3/4/5 min; provisional, Stage-0 calibrates to 25–30% charge incidence) → billable km capped at 2.0 km; billable min free-allowanced with no dedicated cap (dawdle-guarded). Both at full km_rate/time_rate (1.0×, no category multiplier). Whole fee still subject to the % backstop.
- % of trip fare as backstop (~25–30%, calibrate — load-bearing at 1.0× rate).
- Reference distance = 75th percentile of nearest 5 drivers (quote only, not a paid broadcast).
- Lifecycle: **Request** → capped range shown · **Accept** → firm line item from routed path · **Post-ride** → true-up: downward uncapped, upward capped 1.25×.
- Dawdle guard: flags drivers whose distance *or* time deviation trends high (rolling median/p90 triggers) → escalates to package review.
- Hard rule: `low_confidence_never_bills_above_firm_quote` — bad GPS never costs the rider more.

## Zone Fee
- Published flat fee per zone/tier, monthly schedule (indicative: bike +25 / CNG +40 / car +60 BDT).
- Trigger: median driver recovery time (drop-off → next accepted lead) > ~30min in a zone; auto-retires below ~20min.
- 100% to driver, cash — not a lead discount.
- Distinct from the out-of-coverage return allowance / remote-zone fee (Stage 3, static-geofence, only if live data shows needed).

## Dispatch Layer (never touches price, only matching)
0. **Idle positioning** — suggests zones to wait in, relative to current idle density (never mandatory).
1. **Heat tag** — hot/neutral/cold shown pre-accept; exact address unlocks post-accept.
2. **Cold-drop rank boost** — ~15min decaying priority after a driver lands in a cold zone.
3. **Return-lead pre-matching** — proactively surfaces leads near a known cold drop zone.

## Lead Economics
- Packages are **weekly**, sized to p50 of realized leads/driver/week, reviewed quarterly.
- **Joma (REV-4)**: bike tiers 8,000/10,000/12,000 BDT/month (≈275/345/415 per day @ 26 days) — rising bike joma is the early-warning metric for owner-capture of the 0%-commission dividend. Parking is owner-borne, inside joma. 50/50-for-all = stress overlay (cars survive, CNG +40%, bikes don't → bike-driver protection comes from supply structure, not fares).
- Fuel basis (REV-4, fork closed): bikes petrol 140 · CNG 43 · cars octane 145 — admin config entry.
- Decline-chain leads are billed regardless of outcome — **instrument only**, no cap, no queue-discounting (rejected: same mechanism as the killed lead-debit multiplier).
- New drivers get priority dispatch placement for first 10 leads (REV-4 kickoff) / 7 days — protects first-week renewal.
- Off-platform completion (cancel-then-ride-off-app) is treated as the top revenue-integrity risk: cancellation cooldown + package-eligibility gating + GPS trace matching + rider survey + warning→surcharge→suspension→ban ladder.

## Rollout
**Stage 0** shadow (heat tags + dispatch live, no pricing change, subscriptions selling from day one — harvests pickup/recovery-time data) → **Stage 1** pricing live (gated on complaint rate, quote-to-final deviation, periphery accept-rate, backstop-binding rate, retention) → **Stage 2** tighten free allowances toward 25–30% charge incidence, add rider-side cancellation enforcement → **Stage 3** steady state, night multiplier, remote-zone fee only if data shows it's needed.

## Biggest Unresolved Calibration Items
Billed-minutes/day per tier · pickup distance/time distributions · %-of-fare backstop value · zone-fee schedule amounts · night multiplier · grace 1/1/2 (REV-4) monitored via waiting-complaint rate. *Car fuel basis closed by REV-4 owner ruling.*
