# P5 Growth Features — Kimi-K2.6 Code Reference
# =============================================================================
# DO NOT IMPLEMENT NOW. These are post-launch growth features.
# Save for after: app is live, has 500+ drivers, 3+ months of ride data.
#
# Source: Kimi-K2.6 (2026-07-29)
# 6 feature areas: Gamification, Safety, AI Demand, Multi-Stop, Tip, Weather
#
# CRITICAL FIXES NEEDED when implementing (same as all Kimi outputs):
# 1. ALL money columns → integer paisa (Kimi uses decimal)
# 2. Drizzle property names → snake_case (codebase convention)
# 3. verifySupabaseToken(request) — NOT (req)
# 4. { id }: { id: string } — flat params (NOT { params })
# 5. NativeWind className + dark: — NOT inline styles
# 6. Migration number: 0027+ (0026 is taken by tax engine)
# 7. parseJsonBody + Zod for all POST/PATCH bodies
# 8. No console.log — use logger
# =============================================================================

## Priority for Post-Launch (when to build each)

| Priority | Feature | Prerequisite | Effort |
|----------|---------|-------------|--------|
| P5.1 | Driver Gamification (tiers/streaks) | 100+ active drivers | 3-5 days |
| P5.2 | Upfront Tip + Counter-offer | Driver earnings feedback | 2-3 days |
| P5.3 | Multi-Stop + Delivery | Stable core loop | 5-7 days |
| P5.4 | Weather-Adaptive Surge | OpenWeather API key + monsoon data | 3-5 days |
| P5.5 | Safety Stack (audio/blocklist/anomaly) | Legal review + BRTA compliance | 7-14 days |
| P5.6 | AI Demand Intelligence | 3+ months historical data | 5-10 days |

## Feature 1: Driver Gamification
- driverTiers (Bronze/Silver/Gold/Platinum — commission discount + priority boost)
- driverStreaks (daily rides, weekly hours, perfect rating)
- driverAchievements (first 100 rides, 7-day streak, etc.)
- driverMysteryBonuses (dynamic targets based on driver weak spots)
- driverLeaderboardEntries (daily/weekly/monthly by zone)
- lib/gamification.ts: evaluateStreaks(), grantAchievement(), getCurrentTier(), generateMysteryBonus()
- 3 API routes: /driver/streaks, /driver/tier, /driver/achievements
- UI: gamification screen with tier card, streaks, achievements grid, mystery bonus

## Feature 2: Safety Stack
- rideAudioRecordings (7-day retention, dual consent, Supabase Storage)
- safetyAnomalies (route deviation, stationary, SOS, night ride)
- driverBlocklists (rider blocks specific driver)
- lib/safety.ts: startAudioRecording(), detectRouteDeviation(), detectStationaryAnomaly(), checkNightRideProtocol()
- Requires: expo-av, legal review, BRTA compliance, consent UI

## Feature 3: AI Demand Intelligence
- demandForecasts (hourly per-zone prediction with confidence score)
- driverRepositioningNudges (push "drive to Gulshan for 85% chance of ride")
- priceElasticityTests (A/B fare testing — REGULATORY RISK in Bangladesh)
- Scheduler jobs: hourly forecast generation, 30-min nudge dispatch
- API: /driver/heatmap (demand heatmap for driver app)
- Requires: 3+ months of historical ride data for accuracy

## Feature 4: Multi-Stop + Delivery
- rideStops (up to 3 intermediate stops with wait fees)
- rides additions: is_delivery, delivery_instructions, delivery_photo_url
- confirm-ride: add stop inputs + delivery toggle
- Driver: navigate to each stop in sequence + photo proof for delivery
- API: /ride/[id]/stops (GET list, POST complete stop)

## Feature 5: Upfront Tip + Fare Negotiation
- rides additions: upfront_tip_bdt, driver_counter_offer_bdt, counter_offer_status, guaranteed_pickup
- riderTipHistory (track upfront vs post-ride tips)
- UpfrontTipSlider component (slider + quick presets)
- Counter-offer flow: driver requests extra for long trips → rider accepts/rejects
- API: /ride/[id]/counter-offer (POST driver request, PATCH rider response)

## Feature 6: Weather-Adaptive Operations
- weatherConditions (per-zone, auto-fetched from OpenWeather)
- floodZones (polygon geo-fencing for flood-prone areas — needs PostGIS)
- eventCalendar (sports/concert/strike → predicted demand multiplier)
- lib/weather.ts: fetchWeatherForZone(), evaluateWeatherSurge()
- Scheduler job: 15-min weather check → override surge for rain/heat
- Admin: event calendar CRUD
- Requires: OPENWEATHER_API_KEY, PostGIS extension for flood zones

## Schema Summary (18 new tables + 7 column additions)

New tables:
1. driverTiers (4 seeded tiers)
2. driverStreaks
3. driverAchievements
4. driverMysteryBonuses
5. driverLeaderboardEntries
6. rideAudioRecordings
7. safetyAnomalies
8. driverBlocklists
9. demandForecasts
10. driverRepositioningNudges
11. priceElasticityTests
12. rideStops
13. riderTipHistory
14. weatherConditions
15. floodZones (needs PostGIS)
16. eventCalendar

Column additions to rides:
17. upfront_tip_bdt (integer paisa)
18. driver_counter_offer_bdt (integer paisa)
19. counter_offer_status (enum)
20. guaranteed_pickup (boolean)
21. is_delivery (boolean)
22. delivery_instructions (text)
23. delivery_photo_url (text)

Total: 16 new tables + 7 columns = 62 + 16 = 78 tables when implemented.

---

## Feature 7: Ride Bidding (Upward Negotiation)

### What it does
Instead of auto-dispatch (current), rides enter a "bidding" state where multiple
drivers place bids above the estimated fare. Rider selects from a list of bids.
Fallback to auto-dispatch if no selection within timeout.

### Status: SAVED — NOT RECOMMENDED FOR NOW
This is a **fundamental change to the core dispatch architecture**:
- Current: auto-match to nearest driver (H3 indexing, batch offers, 15s countdown)
- Bidding: rider manually selects from multiple simultaneous driver bids
- Requires new ride status ('bidding') in the state machine
- Requires new rider UI (bid list instead of "Finding driver...")
- Conflicts with existing heartbeat-gated call deduction flow
- BRTA regulatory risk: upward bidding (paying more than estimate) may face pushback

### Code saved (with fixes needed):
- Migration: ride_bids table (estimated_fare + bid_amount both integer paisa)
- Drizzle schema: rideBids table (FIX: snake_case property names — ride_id not rideId)
- API: POST /api/ride/[id]/bid (driver places bid, capped at 130% of estimate)
- API: POST /api/ride/[id]/select-bid (rider selects bid, others rejected)
- Scheduler: expireStaleBids (90s timeout → fallback to auto-dispatch)
- Admin config: negotiation_enabled toggle per zone

### Fixes needed if implemented:
- [FIX:case] ALL camelCase → snake_case (rideId → ride_id, etc.)
- [FIX:import] @/db → @/src/db, @/lib/parse-body → @/lib/parseBody
- [FIX:ws] getWebSocketServer() doesn't exist in Expo API routes — WS is separate process
- [FIX:query] db.query.* → db.select().from().where() pattern
- [FIX:migration] Number would be 0029+ (0027-0028 already used)
- [FIX:status] Add 'bidding' to rideStatusEnum in schema.ts
