
### R-010 — Enable Location Permission Screen

| Field | Value |
|---|---|
| File | `app/(auth)/enable-location.tsx` |
| Route Group | `(auth)` |
| Purpose | Request foreground location permission after registration/onboarding so the app can determine pickup location and match nearby drivers. Explains why location is needed before triggering the OS permission dialog. |

**Behavior**
- Explain-then-ask pattern: a clear value proposition ("find rides near you") is shown BEFORE calling the OS permission prompt, maximizing grant rate.
- "Allow Location" CTA triggers `Location.requestForegroundPermissionsAsync()` (expo-location).
- On grant → persists permission-granted flag and navigates forward to R-011 (notifications permission).
- On deny → shows a soft-deny state with a "Not now" escape hatch; user can still proceed but map features degrade gracefully and re-prompt later when a location-dependent screen requires it.
- Secondary "Skip for now" / back affordance available so the flow is never dead-ended.

**Design notes**
- Illustration/hero area at top with location pin motif.
- Two-button stack: primary filled "Enable Location", secondary text/tinted "Maybe later".
- Standard auth header convention (back button, no drawer).

**Navigation**
- In: from register success or post-registration onboarding chain.
- Out: allow granted → `notifications-permission` (R-011); skipped → same destination.

---

### R-011 — Notifications Permission Screen

| Field | Value |
|---|---|
| File | `app/(auth)/notifications-permission.tsx` |
| Route Group | `(auth)` |
| Purpose | Final step of the post-auth permission chain: request notification permission so ride offers, driver arrival updates, and chat messages reach the user in background. |

**Behavior**
- Same explain-then-ask pattern as R-010: benefit copy first ("know when your driver arrives"), then OS prompt on CTA press.
- "Allow Notifications" triggers expo-notifications permission request.
- On grant or deny → flags stored, then navigate into the main app experience (`(main)` root), completing the auth funnel.
- Deny path mirrors R-010: soft decline allowed; chat and ride-status pushes degrade, polling fallback used.
- Idempotent re-entry: if permission already decided, OS returns cached status without re-prompting and the screen fast-forwards.

**Design notes**
- Bell illustration motif consistent with R-010 hero style.
- Primary "Turn on notifications" + secondary "Skip" buttons.
- This is the last blocker before first run of rider/driver home.

**Navigation**
- In: from enable-location (R-010) or directly in the onboarding chain order.
- Out: completion → main tab navigator entry (rider or customer based on role).
