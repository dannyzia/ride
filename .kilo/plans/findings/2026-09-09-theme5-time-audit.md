**Purpose:**     Theme 5 (T5) deferred-depth audit — UTC vs Asia/Dhaka boundary bugs in scheduler jobs and all daily-reset / expiry-writeoff / midnight-rollover / period-window sites. Read-only; feeds ISSUE-40's sweep. Companion to the T6 unit audit.
**Owner:**       Orchestrator (audit); fix lane consumes F-5.1..F-5.4
**Status:**      COMPLETE — 2026-09-09, verified on live tree (HEAD 04ca580)
**Source of truth:** this file for T5 findings; conventions in lib/time.ts
**Related (concrete paths):**
  - lib/time.ts — the house convention (BDT_OFFSET_MS fixed UTC+6; nextBdtMidnightUtc/prevBdtMidnightUtc/bdtDayBoundariesUtc/bdtMonthStartUtc/dhakaTodayKey/todayDhaka)
  - lib/__tests__/time.test.ts — helper coverage
  - utils-server/scheduler.ts — the two local-time-gated weekly jobs
  - .kilo/plans/findings/2026-09-09-theme6-unit-audit.md — sibling audit
**Last verified:** 2026-09-09 by orchestrator (live greps + deep reads at HEAD)
**How to update:** re-run the §Method greps after adding any time-boundary code; append dated findings, never edit old ones.

## Method

1. Enumerated every consumer of the lib/time helpers (15 files across app/, lib/, utils-server/, scripts/).
2. Repo-wide grep for raw local-time boundary math OUTSIDE lib/time: `setHours(`, `.getHours()`, `.getDay()`, `toLocaleDateString` in non-display code.
3. Deep-read every hit + every daily-reset / expiry-writeoff / month-window site.
4. Checked for TZ pinning (Dockerfile TZ, env TZ): none exists — the deploy host TZ is whatever the PaaS defaults to (typically UTC), so any server-local math drifts from Dhaka by the host offset.

## Clean — all money/limit boundaries use the convention

| Site | Boundary | Helper |
|---|---|---|
| Daily cap reset (scheduler.ts:925) | daily_calls_used reset | nextBdtMidnightUtc() |
| call_ledger expiry writeoff (activateSubscription.ts:44) | daily_reset_at | nextBdtMidnightUtc() |
| Gamification daily stats (gamification.ts:11) | day start | prevBdtMidnightUtc() |
| Intro incentive day window (introIncentive.ts:52–53) | [dayStart, dayEnd) | nextBdtMidnightUtc() ± 24h |
| Zone budget reset (zoneBudget.ts:89,148) / zone lifecycle (zoneLifecycle.ts:170) | reset_at | nextBdtMidnightUtc() |
| Driver daily-stats API (:87) | arbitrary Dhaka day window | bdtDayBoundariesUtc(dateParam) |
| Earnings weekly (:29) / breakdown (:46–48) | week/month windows | prevBdtMidnightUtc() − 6d / bdtMonthStartUtc() |

Helper sanity re-verified: nextBdtMidnightUtc() is correct at 23:30 Dhaka (→ +30 min), at 00:30 Dhaka (→ +23.5 h), and at exactly 00:00 Dhaka (→ +24 h — correct "next midnight" semantics for a reset stamped at the boundary). The client-side todayDhaka() uses Intl with explicit timeZone — no device-tz drift. No midnight-rollover or DST hazards (Bangladesh has no DST; the fixed +6 offset in lib/time is exact).

## Findings

**F-5.1 (LOW — display-only): admin dashboard "today" uses server-local midnight.**
`app/api/admin/dashboard+api.ts:13` — `today.setHours(0,0,0,0)` gates todayRides / todayCommission. On a UTC host the day boundary lands at 06:00 Dhaka, so between 00:00–06:00 Dhaka the admin sees yesterday's Dhaka rides as "today" (and the counts straddle wrong days all morning). No money math — display counters only. Fix: `prevBdtMidnightUtc()` (3-line change + no schema impact).

**F-5.2 (LOW — display-only): fleet dashboard "today" — same pattern.**
`app/api/fleet/dashboard+api.ts:50` — `todayStart.setHours(0,0,0,0)`. Same boundary drift for the fleet staff dashboard's today-gated metrics. Same fix: `prevBdtMidnightUtc()`.

**F-5.3 (MEDIUM — monitor/gate metric): job 37 heat backtest fires on SERVER-LOCAL "Sunday 03:00".**
`scheduler.ts:2155` — `if (now.getDay() !== 0 || now.getHours() !== 3) return;`. The week anchor is the host's local zone, not Asia/Dhaka (on UTC: fires 09:00 Dhaka). Two consequences: (a) the computed week boundaries silently shift if the host TZ ever changes (host migration); (b) the correlation input window for the Stage 0 exit gate (heat_backtest_correlation in platform_config) is anchored to the wrong civil day. Monitor/gate metric only — no rider-facing effect. Fix: add `bdtDayOfWeek(now)` + `bdtHourOfDay(now)` helpers to lib/time.ts (Intl timeZone:'Asia/Dhaka', mirroring todayDhaka) and gate on those; ~10 lines + tests.

**F-5.4 (MEDIUM — monitor-only): job 41 decline monitoring fires on SERVER-LOCAL "Saturday 04:00".**
`scheduler.ts:2268` — same pattern (the code comment even says "local"). Cold-tag decline-rate monitoring windows drift with host TZ. Same fix as F-5.3.

## Verdict

**Zero money-path or limit-path boundary bugs.** Every daily reset, expiry writeoff, and earnings window rides the lib/time helpers correctly — the X-1/T6 discipline extends to time. Four findings, all in telemetry/display surfaces: two dashboard "today" boundaries (LOW) and two weekly jobs anchored to host-local instead of Dhaka time (MEDIUM, monitor-only). Recommended fix shape: one small lib/time.ts addition (bdtDayOfWeek/bdtHourOfDay) + 4 call-site changes — routed to the fix lane; T5 is CLOSED for ISSUE-40's sweep.

## RESOLUTION — 2026-09-09 fix batch

All four findings fixed and gated:
- F-5.1: app/api/admin/dashboard+api.ts today-boundary → prevBdtMidnightUtc()
- F-5.2: app/api/fleet/dashboard+api.ts todayStart → prevBdtMidnightUtc()
- F-5.3: scheduler job 37 gates on bdtDayOfWeek/bdtHourOfDay (new lib/time.ts helpers, Intl-free fixed +6)
- F-5.4: scheduler job 41 same fix
Helper coverage: lib/__tests__/bdtClockHelpers.test.ts (6 tests, incl. the 18:00 UTC Dhaka-midnight rollover).
