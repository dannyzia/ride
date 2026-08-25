Here is my opinionated, concrete stance on the 5 open questions from Section 9, calibrated specifically for the realities of Dhaka and your strict "no-incentive, lead-based" architecture.

### 1. Pickup Rate: 60% vs. 100% of trip per-km rate
**Recommendation: Go with 80%, but let the CAP do the heavy lifting.**

*   **The "Why":** 60% feels like a penalty to the driver. In Dhaka traffic, an empty kilometer burns the same fuel and time as a loaded kilometer; drivers will simply reject any pickup beyond 1.5 km if the rate is 60%. Conversely, 100% feels like a scam to the rider ("I'm paying full fare for an empty car?"). 
*   **The Mechanics:** Set the rate at **80% of the active per-km rate**. This is the psychological sweet spot. It acknowledges the driver's cost without feeling punitive to the rider. 
*   **The Secret Weapon:** Because you have a strict absolute cap (e.g., max 40-50 BDT), the 80% rate only applies to the first few kilometers anyway. If a driver is 5 km away, the rider only pays for ~3 km at the 80% rate before hitting the cap. The cap protects the rider from catastrophic pricing, which allows you to keep the per-km rate high enough (80%) to keep drivers happy.

### 2. Destination Reveal Timing: Before vs. After Accept
**Recommendation: Show the *Heat Tag* before accept, hide the *Exact Pin* until accept.**

*   **The "Why":** In Dhaka, hiding the destination entirely is a failed strategy. Drivers *will* call the rider ("Bhaiya, kothay jaben?" / "Brother, where are you going?") to avoid dead zones. If the app hides it, you just shift the friction from the UI to a phone call, which wastes time and annoys riders. 
*   **The Mechanics:** Before the driver accepts, the lead card must display the drop-zone heat tag: **[Hot] / [Neutral] / [Cold]**. 
*   **Preventing Cherry-Picking:** You prevent cherry-picking not by hiding information, but by relying on the **Lead Cascading Broadcast** (from Pass 2). If a [Cold] lead isn't snapped up immediately by a driver who actually wants to go there (e.g., heading home), it simply ages and broadcasts wider. Transparency builds trust in a lead-purchase model; drivers are buying inventory, they should know the inventory's quality tier.

### 3. Exact Free-Radius / Cap Defaults per Vehicle Category
**Recommendation: Tier by vehicle physics and rider price-sensitivity.**

Dhaka traffic affects vehicles differently. A bike weaves; a car gets stuck. Riders in cars are also less price-sensitive than bike riders.

*   **Bikes (Fastest, most price-sensitive riders):**
    *   Free Radius: **1.0 km**
    *   Absolute Cap: **30 BDT**
*   **CNG / Autos (Medium speed, standard "coming charge" expectations):**
    *   Free Radius: **1.5 km** (Aligns with traditional auto-rickshaw "coming charge" norms in Dhaka).
    *   Absolute Cap: **40 BDT**
*   **Cars (Slowest in gridlock, premium riders, highest driver opportunity cost):**
    *   Free Radius: **2.0 km**
    *   Absolute Cap: **60 BDT**

### 4. The Lead-Debit Multiplier (Discounting leads for cold zones)
**Recommendation: Do not build it. Hard pass.**

*   **The "Why":** The framework deferred this because it's mathematically an incentive. You have a strict "no-incentive" policy. If you build a "cold zone lead discount" and call it an "inventory quality adjustment" or a "debit multiplier," you are engaging in semantic gymnastics to hide a subsidy. 
*   **The Business Reality:** Your only revenue line is lead sales. Discounting leads directly reduces your top-line revenue. If a zone is cold, the lead just takes longer to sell. The driver who accepts it is making a choice. If they don't want to go there, they ignore it. The dispatch algorithm (Lever 2 & 3 from Stage 1) handles the operational reality of dead zones without touching the ledger. 
*   **The Risk:** If you build this, drivers will immediately game it (e.g., colluding to drop off in a cold zone to get cheaper leads). Keep the ledger ruthlessly simple: **1 lead = 1 credit, always.**

### 5. Staged Rollout Plan with Quantitative Gates
**Recommendation: A strict 3-Phase Rollout. Do not skip the shadow phase.**

You cannot turn on a complex pricing engine in a chaotic market like Dhaka without testing the underlying data pipes first.

*   **Phase 1: Shadow Mode (Weeks 1-3)**
    *   *Action:* Run the pricing engine in the background. Calculate what the pickup fee *would* be. Log it. Do not show it to the rider. Do not charge it.
    *   *Quantitative Gate to Proceed:* **Quote-to-Final Deviation.** Compare the routing API's estimated pickup distance against the driver's actual GPS trace to the pickup. If the routing engine is off by >20% on average, **do not proceed**. Fix the routing weights for Dhaka's specific road network first.
*   **Phase 2: Information Only (Weeks 4-6)**
    *   *Action:* Show the rider the "Driver Arrival Fee: ৳0–X" range. Show the driver the [Hot/Neutral/Cold] heat tags. *Do not actually charge the fee yet.*
    *   *Quantitative Gate to Proceed:* **Driver Phone-Call Rate & Rider Complaint Rate.** If drivers are still calling riders to ask "where are you going?", the heat tags aren't satisfying their anxiety. If rider complaints about "hidden fees" spike, adjust the UX transparency.
*   **Phase 3: Hard Lock (Week 7+)**
    *   *Action:* Turn on the actual charge and the bounded asymmetric true-up (1.25x cap).
    *   *Quantitative Gate to Monitor:* **Upward True-up Hit Rate.** Track how often the final fee exceeds the accepted quote. If >15% of rides trigger the upward true-up, your routing engine is consistently underestimating Dhaka traffic, and you need to adjust the base routing multipliers or increase the free-radius.