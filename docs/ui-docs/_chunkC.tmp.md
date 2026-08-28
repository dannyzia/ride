
### R-010 — Enable Location

**File:** `app/(auth)/enable-location.tsx`

| Field | Value |
|---|---|
| Flow | Auth onboarding (permission step) |
| Entry | Pushed from register completion / walkthrough chain |
| Exit | Continue → grants location permission → proceeds into main app entry |

**Layout**
- Standard header with back affordance.
- Centered illustration/icon area (location pin motif).
- Headline + supporting body copy explaining why location access is needed (pickup/dropoff accuracy, nearby driver matching).
- Primary CTA button ("Enable Location") pinned near bottom in safe area.

**Behavior**
- CTA requests foreground location permission (`expo-location`) at runtime rather than pre-emptively.
- If permission granted → navigates forward immediately.
- If denied → remains on screen; secondary/skip path continues without location (app can re-prompt later where needed).
- No network calls; purely local permission orchestration.

**State/Props**
- Local boolean for button activity while the native permission dialog is open; no Zustand store dependency.

**Design tokens**
- Uses standard GoRide screen padding, primary button style, heading/body typography hierarchy from `theme/goRide.ts`.

---

### R-011 — Notifications Permission

**File:** `app/(auth)/notifications-permission.tsx`

| Field | Value |
|---|---|
| Flow | Auth onboarding (final permission step) |
| Entry | Follows Enable Location in the onboarding chain |
| Exit | Continue (or skip) → enters main app (rider home) |

**Layout**
- Standard header/back convention consistent with other auth screens.
- Centered illustration area (bell/notification motif).
- Headline + body copy explaining notification value: ride status updates, driver arrival alerts, offers/chat messages.
- Primary CTA ("Allow Notifications"); secondary text/tap-to-skip option.

**Behavior**
- CTA triggers OS notification permission request.
- Grant or deny both advance forward (permissions can be changed later from device settings); skip path advances directly without prompting.
- No API calls on this screen itself.

**State/Props**
- Stateless beyond the pending-permission flag; no store dependency.

**Design tokens**
- Standard GoRide auth-stack tokens: spacing, radii, primary button, heading/body text roles per `theme/goRide.ts`.
