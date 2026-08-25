Opinions on the five §9 items, in order. One general note first: the list is well-chosen — four of the five are genuinely Stage-2 material. But two of them are framed with the wrong deciding evidence, and one (the debit multiplier) I'm going to reverse my own earlier position on, for a reason the Stage 1 document itself supplies.

---

## 1. Pickup rate: 60% or 100%? → **100%. And the framing is wrong.**

The document says "send both positions back with real Dhaka fuel-cost data." Fuel data cannot decide this, because the 60% rationale — "driver isn't carrying a passenger yet" — is arithmetically hollow. Empty km cost the driver almost exactly what loaded km cost: same fuel (passenger weight is noise, especially on bikes), same time per km, same wear. The driver's deadhead cost per km ≈ loaded cost per km. There is no cost basis for a discount; the only real argument for 60% is rider optics — and you already have a cap for that. Discounted rate *plus* cap is double rider-protection, paid for entirely by the driver, on the exact km the mechanism exists to compensate.

Three further points:

- **The cap interaction makes the debate smaller than it looks.** With a ৳25 cap at ৳13/km, 100% reaches the cap at ~3.4 km of pickup; 60% reaches it at ~4.7 km. The rate only shapes a short band — and in that band, 100% pays strictly more to the party the fee exists to protect. Flat-capped fees are also *more* predictable to riders than mid-range slopes.
- **One rate is one story.** "Distance is distance, ৳13/km" is auditable by any rider with the app open. A 60% coefficient is an invisible number that produces "identical trip, different fee" questions — the exact failure mode §2 of your own document dies on the hill about.
- **The deciding dataset is accept-rate elasticity, not fuel.** The question is whether far drivers accept at meaningfully higher rates at 100% vs 60%. You won't have that until Stage 0/1. Default to 100% because the fee's primary job is moving far drivers in thin supply, and let Stage 1 gates tell you if rider-side pain demands the cap come down instead — the cap is the correct knob for that, not the slope.

## 2. Heat tag before or after accept? → **Before accept, zone granularity, bundled with number masking.**

The framing — driver-friendly vs. cherry-picking — is a false dichotomy, and the document half-knows it ("drivers already ask by phone anyway"). Three arguments:

- **The information already exists; the only question is which channel carries it.** Dhaka drivers know from lived experience that a Mirpur→Gulshan lead is good and Mirpur→Savar is bad. The tag adds marginal information exactly where lived experience is weakest — unfamiliar zones, odd hours, new drivers — which is where it's most valuable. If the app hides what the phone reveals, you're not preventing the knowledge transfer; you're routing it through a channel that harasses the rider ("apni jaben kothay… na bhaisse") and trains drivers that the app is adversarial. Pair this with **pre-accept number masking** and the tag becomes the *only* channel — coherent bundle, phone-screening culture starved at the root.
- **The tag is a matching signal, not just a disclosure.** "Cold" is driver-relative: a Gulshan→Savar lead is cold for a Gulshan driver and a homing beacon for a Savar-resident driver ending their shift. Showing the tag pre-accept lets each lead find the driver for whom it is *least* cold. That's a matching efficiency gain — the cherry-picking framing counts the declines and misses the better matches.
- **Cherry-picking is priced and budgeted, not hidden from.** Decline budget (with a min-leads-seen floor so quiet-hour drivers aren't punished), cooldowns, and a monitor: expect cold-tag decline rate to run some multiple of hot-tag; alarm only if that multiple explodes (say >2.5×) — a gap is information working, not leakage.

Show on the lead card: pickup km, ETA, pickup fee, drop **zone** + heat tag, trip km, estimated fare, credit cost. Exact address only after accept. Never hide trip length from someone buying the lead — the lead *is* the product; you don't sell a product and conceal its size.

## 3. Free-radius and cap defaults → **Don't ship synthetic numbers. Sequence this decision after Stage 0, which exists partly to answer it.**

You're pre-launch; there is no real Dhaka pickup-distance dataset yet — so make the rollout sequence produce one. **Stage 0 (dispatch-only, no pricing change) harvests realized pickup-distance distributions per vehicle category per zone class.** Then set the radius at **p70–p75 of that distribution per category**, targeting 25–30% charge incidence, with hysteresis (±0.25 km max per adjustment, two consecutive monthly reviews before moving).

Provisional seeds to carry into Stage 1, explicitly labeled placeholders:

| Category | Trip rate (illustr.) | Free radius | Cap | Fee reaches cap at |
|---|---|---|---|---|
| Bike | ৳13/km | 1.5 km | ৳25 | ~3.4 km pickup |
| CNG | ৳16/km | 1.5 km | ৳30 | ~3.4 km pickup |
| Car | ৳22/km | 2.0 km | ৳45 | ~4.0 km pickup |

Cars get the larger radius not because car riders deserve more generosity but because car supply density is lower — p70 of car matched pickups will sit higher, and a bike-calibrated radius would put nearly every car ride under charge.

Two sub-forks to close while you're here:

- **Express the cap in km, not BDT.** `cap_billable_km: 2.0` per category; fee = rate × min(billable, 2.0). "The rider never pays for more than 2 km of pickup" is a sentence a rider, a driver, and a BRTA official can all hold in their heads, and the BDT maximum auto-tracks any rate change instead of silently decaying into irrelevance.
- **The %-of-fare cap (locked in §3) should be tuned to be a backstop, not a second active cap.** Set it at 40% so it binds only on short trips where fee-exceeds-a-third-of-fare screenshots would otherwise circulate. If it binds on more than ~3% of charged rides, that's telling you something about *dispatch quality* (why is the nearest driver 4 km away for a 1.5 km trip?) — fix the match, don't compress the driver's pay.

## 4. The debit multiplier → **Don't build it. The heat tag is a substitute, and I'm reversing my earlier position.**

I previously argued "keep it as SKU-fairness pricing." The Stage 1 document's own Lever 1 kills that argument, and Kimi/Qwen's "it's an incentive in costume" charge deserves a more honest answer than my old label-defense.

Here's the cleaner reasoning: the multiplier's entire function was compensating drivers for cold leads they took *unknowingly* — an **ex-post rebate for ignorance**. But the pre-accept heat tag (Decision 2) is **ex-ante information**: the driver chooses the 🔴 lead with eyes open and prices the risk into the accept decision. Ex-ante information strictly dominates ex-post rebating — it enables choice, costs nothing, and carries zero policy ambiguity. Once the tag exists, the multiplier's residual job is rebating drivers for *informed choices*, which is textbook incentive design, whatever you label it. The tag eats the multiplier's lunch.

On the label question itself, for the record: Kimi/Qwen overstate. Conditional pricing of your own SKU is foregone revenue, budgetable and bounded — behaviorally incentive-like, financially nothing like an open transfer program. But "not technically an incentive" is a lawyer's answer to a product question, and the product answer is: the benefit (~৳2.50 on a ৳5 credit against ৳40–80 of real idle cost) never justified being the platform's first exception to "one price per lead."

**Keep a written revisit trigger** so deferral isn't silent death: revisit if cold-tag median accept latency exceeds 2× hot-tag, or cold-corridor cohort 90-day package repurchase lags hot-corridor by >15pp, sustained 8 weeks. If it ever gets built: label it *conditional lead pricing*, hard budget cap, never "rebate," never "incentive."

## 5. Staged rollout → **Yes, and here are the exact gates — including one the document is missing.**

- **Stage 0 (4 wks, dispatch-only):** ETA gates, heat tags, arrival radius, masking. No pricing change. This stage has an **exit gate nobody has specified: heat-model validation.** Backtest the blended score against realized post-drop 60-min earnings on held-out weeks; ship tags only if rank correlation is meaningfully positive (ρ ≥ 0.5 as a working bar). A wrong 🔴 on a good zone spends your one-shot trust budget — a driver burned by a bad tag never trusts tags again. Also harvests the Decision-3 distributions.
- **Stage 1 (pickup fee live, radius at p75):** Proceed to Stage 2 only if: pickup-line complaints <5 per 1,000 charged rides; p95 |final − accept quote| / quote <10%; periphery accept-rate within 3pp of Stage 0 baseline; cap-binding rate <15%; weekly-active driver retention ≥ Stage 0. **Auto-rollback triggers:** complaints >20/1,000 charged rides, or ride completion rate down >2pp.
- **Stage 2:** tighten radius toward p70; rider-cancel enforcement (strikes, priority decay, instrument requirement — reputational only, since you have no rider rail); reassignment boost.
- **Stage 3:** nothing new ships. Steady-state ops, monitoring, and — only if §5's edge cases prove real in the data — the out-of-coverage return allowance and remote-zone fee, which are operational products, not demand pricing, and are correctly Phase-2.

---

## Three dangling forks Stage 2 should close that §9 doesn't list

1. **GPS snapshot basis (§3c's "at accept, or at dispatch offer, per city calibration").** Close it: **at accept, always.** That's when commitment forms, and the billing basis must equal the firm-quote basis. A per-city fork here is a disputes factory.
2. **Pool-quantile reference distance (§3a).** It's overweighted in the document. It can shape the request-time *display* (a midpoint inside the ৳0–cap range) but must never set anything binding — the firm quote is the accepting driver's routed path. If it ever binds, a driver declining re-prices the rider, which is the exact UX failure DeepSeek introduced the quantile to avoid.
3. **Arrival confirmation radius.** Waiting-clock gaming (early "Arrived" tap) needs GPS-within-75m-of-pin to register arrival. It's in the gaming list by implication; make it explicit config now, because it ships in Stage 0 with the waiting clock, not later.

One meta-observation to send back with the panel: §9's five questions are mostly *not* questions more model opinions can settle. #1 and #3 are settled by Stage 0 data; #2, #4, and #5 are product/policy calls where the marginal value of a tenth model is near zero. The nitty-gritty round should be spent on the fork-closing and gate-setting work above — that's where the remaining risk actually lives.