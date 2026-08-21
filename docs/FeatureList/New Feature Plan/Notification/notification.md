# Notification Implementation Plan — v2 (Hardened)

**Scope:** Unified push + local notifications for ride calls, ride lifecycle updates, chats, urgent/SOS alerts, and alarms.
**Stack:** Expo Push (APNs/FCM via Expo server SDK), Expo API routes, existing WebSocket dispatch server, `expo-notifications`, Zustand, Drizzle/Supabase.
**Platforms:** Android/iOS · foreground/background/killed.
**Hard constraints (from AGENTS.md):** Expo Managed Workflow + Development Builds (non-negotiable) · Zod at every boundary · `parseJsonBody` for bodies · `verifySupabaseToken` on all user endpoints · snake_case Drizzle properties · `lib/logger.ts` only (never `console.log`, never log tokens) · integer/UTC conventions · Conventional Commits.

---

## 1. Codebase Integration (facts that shape this plan)

These files **already exist** — this plan extends/wires them rather than recreating them:

| Existing asset | Role in this plan |
|---|---|
| `lib/notify.ts` | Extend into the canonical push utility (single writer for `notifications`) |
| `app/api/user/device+api.ts` | Extend POST/DELETE device-token endpoints |
| `app/api/user/notification-prefs+api.ts` | Keep this path (do **not** introduce `/api/notification-preferences`) |
| `app/api/rider/notifications+api.ts` | Audit → supersede/alias into unified `/api/notifications` |
| `app/(auth)/notifications-permission.tsx`, `app/(auth)/driver-notifications-permission.tsx` | Permission rationale screens (already in both flows) |
| `app/(main)/(customer)/(tabs)/settings/notifications/index.tsx`, `app/(main)/(rider)/settings/notifications/index.tsx` | Preferences UI (wire to prefs API) |
| `app/(main)/(customer)/(tabs)/inbox/index.tsx` | Rider notification center |
| `components/plan03/NotificationCard.tsx`, `NotificationSkeleton.tsx` | Inbox list components (reuse) |
| `assets/notification_sound.wav`, `assets/notification_sound_other.wav`, `assets/images/notification_icon.png` | Reuse as channel sounds + notification icon (verify icon is white-on-transparent) |
| `utils-server/scheduler.ts`, `utils-server/dispatch.ts` | Server-side reminder job + ride-call push fallback |
| `app/api/admin/broadcast+api.ts`, `app/api/driver/sos-alert+api.ts`, `app/api/chat/message+api.ts` | Trigger points to instrument |

**New files to create:** `store/useNotificationStore.ts` (8th Zustand store — update AGENTS.md/CLAUDE.md store count), `app/api/internal/notify+api.ts`, `app/api/notifications+api.ts`, `app/api/notifications/[id]/read+api.ts`, `app/api/notifications/read-all+api.ts`, and Drizzle migration `0038_*` (latest existing is `0037`).

---

## 2. Notification Types & Channels

| type | channel_id | Android importance | sound | vibration | bypass DND | iOS category | iOS interruption | TTL | priority | user-disableable |
|---|---|---|---|---|---|---|---|---|---|---|
| `ride_call` | `ride-call` | HIGH | `notification_sound.wav` | `[0,500,500]` | no | `RIDE_CALL` | `time-sensitive` | 120s (offer expires anyway) | `high` | ✅ (but driver is only offered rides while available) |
| `ride_update` | `ride-update` | HIGH | `notification_sound_other.wav` | default | no | `RIDE_UPDATE` | `active` | 3600s | `high` | ✅ |
| `chat_message` | `chat` | DEFAULT | none (silent-ish) | default | no | `CHAT` | `passive` | 3600s | `default` | ✅ |
| `urgent_alert` | `urgent` | MAX | `notification_sound_other.wav` (loop client-side if needed) | `[0,1000,1000]` | **yes** | `URGENT` | `time-sensitive` | 43200s | `high` | ❌ **never** |
| `alarm` | `alarm` | MAX | alarm loop | continuous | **yes** | `ALARM` | `time-sensitive` | 3600s | `high` | ❌ |
| `system` | `system` | DEFAULT | none | none | no | `SYSTEM` | `passive` | 86400s | `default` | ✅ |

`system` (addition) covers admin broadcasts, document approval/rejection, support-ticket replies, payment results — so transactional messages never ride on the wrong channel.

**Channel rules:**
- Android channels are immutable after creation (sound/importance can't change). If a sound/importance ever changes, ship a **versioned channel id** (`ride-call-v2`) and delete the old one on app start.
- Sounds must be ≤ ~300 KB wav, bundled via the `expo-notifications` config plugin (see §8.2). No new native module needed — **drop `react-native-vibration`** from v1; `expo-notifications` channel `vibrationPattern` covers it and keeps us cleanly inside Managed Workflow.
- Don't rely on color alone anywhere (Bangladesh daylight + cheap LCDs): every in-app notification surface shows icon + text + badge, not just a tint.

---

## 3. Notification Payload Contract (new)

Every push/local notification `data` payload conforms to one schema (Zod, shared type):

```ts
export const notificationDataSchema = z.object({
  v: z.literal(1),
  type: z.enum(['ride_call','ride_update','chat_message','urgent_alert','alarm','system']),
  ride_id: z.string().uuid().optional(),
  chat_ride_id: z.string().uuid().optional(),   // chat is keyed by ride
  dedupe_id: z.string().optional(),              // server idempotency key, echoed to local backups
  sub: z.string().optional(),                    // alarm subtype: 'ride_reminder' | 'no_show' | 'break_overrun'
  deep_link: z.string().optional(),
});
```

- **Localization:** push is rendered by the OS, so the server localizes `title`/`body` using the recipient's language preference (bn/en, from profile) via the same keys as `i18n/locales/*/common.json`. Client in-app rendering re-localizes from `data` when possible.
- **Privacy:** title/body must never contain phone numbers, exact addresses, or fare amounts — generic text + deep link only (lockscreen visibility).

---

## 4. Data Model

Drizzle migration **`0038_notifications.sql`** (`npx drizzle-kit generate`). All properties snake_case per codebase rule. `notificationTypeEnum` becomes the 30th enum.

```ts
export const notificationTypeEnum = pgEnum('notification_type',
  ['ride_call','ride_update','chat_message','urgent_alert','alarm','system']);

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => profiles.id),
  expo_push_token: text('expo_push_token').notNull().unique(),
  device_type: text('device_type'),
  platform: text('platform', { enum: ['android','ios'] }).notNull(),
  last_seen_at: timestamptz('last_seen_at'),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [index('push_tokens_user_id_idx').on(t.user_id)]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => profiles.id),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data').$type<NotificationData>().notNull().default({}),
  is_read: boolean('is_read').notNull().default(false),
  read_at: timestamptz('read_at'),
  idempotency_key: text('idempotency_key').unique(),   // prevents duplicate inserts from retried triggers
  // NOTE: implementation uses varchar(128) nullable + partial unique index
  // (WHERE idempotency_key IS NOT NULL) because existing non-idempotent callers
  // (lifecycle events) insert rows without a key. A NOT NULL constraint would
  // require backfilling all existing rows. The partial index achieves the same
  // dedup guarantee for keyed rows while leaving legacy rows unaffected.
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  index('notifications_user_created_idx').on(t.user_id, t.created_at),
  index('notifications_unread_idx').on(t.user_id).where(sql`${t.is_read} = false`),
]);

export const notificationPreferences = pgTable('notification_preferences', {
  user_id: uuid('user_id').primaryKey().references(() => profiles.id),
  ride_call: boolean('ride_call').notNull().default(true),
  ride_update: boolean('ride_update').notNull().default(true),
  chat_message: boolean('chat_message').notNull().default(true),
  urgent_alert: boolean('urgent_alert').notNull().default(true),
  alarm: boolean('alarm').notNull().default(true),
  system: boolean('system').notNull().default(true),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});

export const pushTickets = pgTable('push_tickets', {   // operational token hygiene, not analytics
  id: uuid('id').primaryKey().defaultRandom(),
  push_token_id: uuid('push_token_id').notNull().references(() => pushTokens.id),
  ticket_id: text('ticket_id').notNull(),
  notification_id: uuid('notification_id').references(() => notifications.id),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  processed_at: timestamptz('processed_at'),
}); // append-only → exempt from updated_at per AGENTS.md
```

**Retention:** `notifications` purged after 90 days; `push_tickets` purged 7 days after `processed_at` — both as jobs in `utils-server/scheduler.ts` (safe: `INSTANCE_COUNT=1`).

**New env var:** `EXPO_ACCESS_TOKEN` (server-side only, never `EXPO_PUBLIC_*`) — required by `expo-server-sdk`. Add to `.env.local` and the AGENTS.md env reference.

---

## 5. Server Implementation

### 5.1 Write ownership (add to AGENTS.md Critical Rules)
- `notifications` row inserts → **ONLY** `lib/notify.ts`
- `push_tokens` writes → **ONLY** `app/api/user/device+api.ts` (+ receipt job invalidation)
- No API route, no admin screen, no utils-server file writes these tables directly.

### 5.2 `lib/notify.ts` (extend existing file)

```ts
export async function sendPush(opts: {
  user_id: string;
  type: NotificationType;
  title: string;              // already localized for recipient
  body: string;
  data?: NotificationData;
  idempotency_key?: string;   // e.g. `ride:{id}:accepted`, `chat:{msgId}`
}): Promise<void> {
  // 1. Preference gate: skip if type disabled — EXCEPT urgent_alert & alarm (always sent)
  // 2. INSERT notifications ... ON CONFLICT (idempotency_key) DO NOTHING → if no row inserted, return (dedupe)
  // 3. tokens = SELECT expo_push_token FROM push_tokens WHERE user_id = ? (multi-device)
  // 4. if (!tokens.length) return;
  // 5. Build messages: { to, sound, title, body, data, channelId, categoryId, ttl, priority, interruptionLevel }
  // 6. for (const chunk of expo.chunkPushNotifications(messages)) await expo.sendPushNotificationsAsync(chunk)
  // 7. Persist ticket ids → push_tickets (for receipt sweep)
  // 8. logger.info({ event: 'push.sent', user_id, type, count }) — NEVER log tokens
}
```

**Rate limits:** Expo allows ~600 msgs/min per project. Admin broadcasts (`app/api/admin/broadcast+api.ts`) must chunk + throttle (~500/min) — implemented in the broadcast handler, not in `sendPush`.

### 5.3 Receipt sweep (missing from v1 — required for token hygiene)
Job in `utils-server/scheduler.ts`, every 15 min:
1. Select `push_tickets` where `processed_at IS NULL AND created_at < now() - 5 min` (Expo needs time to produce receipts).
2. `expo.getPushNotificationReceiptsAsync(ticketIds)`.
3. For each receipt: `status === 'device-not-registered'` → delete the `push_tokens` row; `'error'` → `logger.error` with receipt `message` (details field may contain the token — strip it).
4. Set `processed_at`. Purge processed rows > 7 days old.

### 5.4 How utils-server triggers push (architectural fix)
`utils-server` must **not** write `notifications` directly (single-writer rule). Add:

`POST /api/internal/notify+api.ts` — no JWT; requires header `x-internal-secret` equal to `WEBSOCKET_INTERNAL_SECRET` (min 32 chars, already mandated). Zod body = the `sendPush` opts shape. Returns `{ success: true }` or `{ error: 'invalid_secret' | 'validation_error', message }`.

utils-server gets a thin client `utils-server/notifyClient.ts` that POSTs to `${EXPO_APP_URL}/api/internal/notify`. All dispatch/scheduler push goes through it.

---

## 6. Trigger Points (instrumentation map)

| Event | Type | Recipient | Where to instrument |
|---|---|---|---|
| Dispatch offer — **only if driver's WS is disconnected** (see §7) | `ride_call` | driver | `utils-server/dispatch.ts` via `notifyClient` |
| Ride accepted | `ride_update` | rider | accept/confirm handler (WS `fetch:confirm` path — verify exact location during impl) |
| Driver arrived | `ride_update` | rider | `app/api/ride/[id]/arrive+api.ts` |
| Ride started | `ride_update` | rider | `app/api/ride/[id]/start+api.ts` |
| Ride completed | `ride_update` | rider | `app/api/ride/[id]/complete+api.ts` |
| Ride cancelled (either party) | `ride_update` | the **other** party | `app/api/ride/[id]/cancel+api.ts` |
| No-show declared | `ride_update` | rider | `app/api/ride/[id]/no-show+api.ts` |
| Extra charge requested / approved | `ride_update` | rider / driver | `extra-charge+api.ts`, `extra-charge/approve+api.ts` |
| Tip added | `system` | driver | `app/api/ride/[id]/tip+api.ts` |
| Chat message — debounced (see §7) | `chat_message` | counterparty | `app/api/chat/message+api.ts`, `app/api/ride/[id]/message+api.ts` |
| SOS triggered | `urgent_alert` | admin + emergency contacts | `app/api/driver/sos-alert+api.ts`, rider SOS flow, `app/api/admin/sos-alerts/[id]/ack+api.ts` (ack → notify reporter) |
| Scheduled ride reminder (T-60m) | `alarm` (server) | rider | `utils-server/scheduler.ts` job 21a — idempotency key `ride:{id}:reminder_60`, gate: `rides.reminder_60_sent` |
| Scheduled ride reminder (T-15m) | `alarm` (server) | rider | `utils-server/scheduler.ts` job 21b — idempotency key `ride:{id}:reminder_15`, gate: `rides.reminder_sent` |
| Scheduled ride → assigned driver notified | `ride_call` | driver | same scheduler job |
| Driver no-show wait timer expiry | `alarm` (local, active session) | driver | client timer (§8.8) |
| Break time exceeded | `alarm` | driver | `app/api/driver/break/start+api.ts` context + scheduler |
| Document approved/rejected | `system` | driver | `app/api/admin/documents/approve|reject+api.ts` |
| Support ticket reply | `system` | ticket owner | `app/api/admin/tickets/[id]/reply+api.ts` |
| Wallet top-up / package purchase result | `system` | user | `lib/activateSubscription.ts` success/fail paths |
| Admin broadcast | `system` | targeted segment | `app/api/admin/broadcast+api.ts` (throttled) |

Every trigger passes a deterministic `idempotency_key` so retries/restarts never double-notify.

---

## 7. Delivery Policy — WebSocket vs Push (new; prevents double notifications)

The app is **WS-first** (dispatch already delivers `ride:offer` over WS). Policy per type:

| Type | WS connected | WS disconnected |
|---|---|---|
| `ride_call` | WS only (client renders full-screen offer UI) | Push immediately via `/api/internal/notify` |
| `urgent_alert` | **Both** WS and push, always | Push |
| `ride_update`, `system` | WS `notification:new` only | Push |
| `chat_message` | WS only | Push after **20s debounce**; cancelled if `notification:read` ack arrives or a newer message from same ride lands (one push per conversation burst) |
| `alarm` (server-scheduled) | Push always (app likely killed) + local backup | Push |

- On WS reconnect, client calls `GET /api/notifications?since_last_seen` (or standard first page) to backfill anything missed while disconnected.
- Driver socket connectivity state is already known in `utils-server` (in-memory maps; recovery on startup per TD-15) — dispatch checks it before calling `notifyClient`.

---

## 8. Client Implementation

### 8.1 Dependencies
`expo-notifications`, `expo-device`, `expo-constants` — install via `npx expo install` (SDK 53-matched versions). **Removed vs v1:** `react-native-vibration` (channel vibration suffices), `expo-av` (no in-app playback needed).

### 8.2 `app.config.js` plugin + rebuild (native change → dev build)

```js
plugins: [
  // ...existing plugins
  ['expo-notifications', {
    icon: './assets/images/notification_icon.png', // verify: white silhouette, transparent bg
    color: '#0891B2',                              // pull exact cyan from theme/goRide.ts at impl time
    sounds: ['./assets/notification_sound.wav', './assets/notification_sound_other.wav'],
  }],
],
```
Also verify `extra.eas.projectId` exists (required for `getExpoPushTokenAsync`). Any change here ⇒ `npx expo run:android` / new EAS dev build — **state this as a build gate in the phase plan.**

### 8.3 Permission flow (role-aware)
- **Driver:** requested during onboarding at existing `driver-notifications-permission.tsx` — notifications are core to earning, so the rationale screen explains this. Denied → persistent banner on driver home + `Linking.openSettings()` shortcut.
- **Rider:** requested at existing `(auth)/notifications-permission.tsx` step, or lazily at first ride request — whichever the current flow already does (audit, don't fork).
- Android 13+: `POST_NOTIFICATIONS` runtime permission is covered by `requestPermissionsAsync()`. iOS: request alert+badge+sound.
- Denied ⇒ in-app-only fallback (WS `notification:new` banners + inbox), never block the user.

### 8.4 Token registration lifecycle
```ts
const { status } = await Notifications.requestPermissionsAsync();
if (status === 'granted') {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await fetch('/api/user/device', { method: 'POST', body: JSON.stringify({
    expo_push_token: token,
    device_type: Device.modelName ?? 'unknown',
    platform: Platform.OS,                       // NEW field vs v1
  })});
}
```
- Register on **login success** and on permission grant; retry with backoff if the call fails (transient network on Bangladeshi mobile data is common).
- `Notifications.addPushTokenListener` → re-register on rotation.
- **Sign-out / delete-account:** `DELETE /api/user/device` + `Notifications.cancelAllScheduledNotificationsAsync()` + clear `useNotificationStore`.
- Token moving between accounts is handled server-side by upsert on the unique token.

### 8.5 Notification handler — smart foreground suppression (in root `_layout.tsx`)
```ts
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as NotificationData;
    const route = navigationRef.current?.getCurrentRoute();
    // User already looking at this ride's chat → no banner, mark read silently
    if (data.type === 'chat_message' && route?.name?.includes('chat') &&
        route.params?.rideId === data.chat_ride_id) {
      useChatStore.getState().markRead(data.chat_ride_id);
      return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});
```

### 8.6 Listeners — including killed-state launch (v1 gap)
```ts
// Foreground receive
const sub = Notifications.addNotificationReceivedListener(n => {
  useNotificationStore.getState().addRealtime(n.request.content.data);
});
// Tap while app alive
const respSub = Notifications.addNotificationResponseReceivedListener(r => {
  handleDeepLink(r.notification.request.content.data);
});
// Cold start from killed — v1 missed this
useEffect(() => {
  Notifications.getLastNotificationResponseAsync().then(last => {
    if (last) handleDeepLink(last.notification.request.content.data);
  });
}, []);
// Cleanup both subscriptions on unmount
```
Badge: `Notifications.setBadgeCountAsync(unreadCount)` on iOS; Android launcher badges are unreliable — use the in-app unread dot (inbox tab + bell). Recompute from server on every app resume (fixes drift).

### 8.7 Android channels (app start, `Platform.OS === 'android'`)
Create all 6 channels per §2 table, e.g.:
```ts
await Notifications.setNotificationChannelAsync('ride-call', {
  name: 'Ride Calls',
  importance: Notifications.AndroidImportance.HIGH,
  sound: 'notification_sound.wav',
  vibrationPattern: [0, 500, 500],
  enableVibrate: true,
  lightColor: '#22D3EE',
});
// 'urgent' and 'alarm': importance MAX + bypassDnd: true
```

### 8.8 Alarms — two distinct classes (v1 conflated them)
1. **Active-session timers** (driver no-show wait, break overrun): app is alive by definition → local notifications only.
   ```ts
   const id = await Notifications.scheduleNotificationAsync({
     content: { title, body, data: { v: 1, type: 'alarm', sub: 'no_show', ride_id, dedupe_id }, sound: 'notification_sound_other.wav', channelId: 'alarm' },
     trigger: { seconds: secondsUntilExpiry },
   });
   // identifier = `${ride_id}:no-show` pattern → cancel deterministically when state changes (wait-end, ride start)
   ```
2. **Future-event reminders** (scheduled ride T-15m): app may be killed → **server push is authoritative** (`scheduler.ts` job); the client additionally schedules a local backup on booking confirmation with the same `dedupe_id`, and cancels it if the server push arrives while the app is alive. Reconcile on app start: list pending locals, cancel orphans whose ride is already completed/cancelled.
   - Do **not** request `SCHEDULE_EXACT_ALARM` (Android 12+); minute-granularity inexact triggers are acceptable and friendlier to low-end devices. Note OEM battery optimization (known issue TD-01) as the reason server push, not local scheduling, owns future reminders.

### 8.9 Deep link routing (corrected to real routes)

| type | Target |
|---|---|
| `ride_call` | `/(main)/(rider)/index.tsx` (driver home — `(rider)` folder = driver flows) |
| `ride_update` | active ride → `/(main)/(customer)/ride-tracking/[ride_id].tsx`; completed/cancelled → `/(main)/(customer)/(tabs)/history-detail` (branch on `data.sub`/status) |
| `chat_message` | role-based: `/(main)/(customer)/chat/[rideId].tsx` or `/(main)/(rider)/chat/[rideId].tsx` (v1 pointed at an index screen — go direct to the ride chat) |
| `urgent_alert` | rider → `/(main)/(customer)/emergency-sos/index.tsx`; admin → `app/admin/sos-alerts.tsx` |
| `alarm` | `sub: 'ride_reminder'` → `/(main)/(customer)/ride-details-scheduled/[id]`; `sub: 'no_show'` → `/(main)/(rider)/rider-no-show` |

Guard: validate `ride_id` UUIDs before navigating; if the ride no longer exists (404), land on the relevant tab, never a crash.

### 8.10 Store — `store/useNotificationStore.ts` (new, 8th store)
State: `items` (one page + append-on-scroll), `unread_count`, `loading`, `has_more`. Actions: `fetchPage`, `markRead`, `markAllRead`, `addRealtime`, `syncBadge`. Keep selectors narrow (no map-screen re-renders on badge change). Inbox list uses existing `plan03/NotificationCard` + `NotificationSkeleton`.

---

## 9. API Endpoints

All protected by `verifySupabaseToken` except the internal endpoint (secret-gated). Bodies via `parseJsonBody`; dynamic segments validated with `z.string().uuid()` **Expo-style** (`{ id }: { id: string }`, never `{ params }`). Errors: `{ error: 'machine_code', message: 'Human description' }`.

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/user/device` | `{ expo_push_token, device_type, platform }` | `{ success }` | Upsert on unique token; bumps `last_seen_at`. Extend existing file |
| DELETE | `/api/user/device` | `{ expo_push_token }` | `{ success }` | Delete only tokens owned by the caller |
| GET | `/api/notifications?limit≤50&before=<iso>` | — | `{ notifications[], unread_count, has_more }` | Cursor pagination; both roles; supersedes `rider/notifications` (audit + redirect) |
| PATCH | `/api/notifications/[id]/read` | — | `{ success }` | Idempotent; sets `read_at` once |
| PATCH | `/api/notifications/read-all` | — | `{ success }` | |
| GET | `/api/user/notification-prefs` | — | `{ preferences }` | **Keep existing path** |
| PATCH | `/api/user/notification-prefs` | partial booleans | `{ preferences }` | `urgent_alert: false` → `400 { error: 'urgent_not_disableable' }`; `alarm: false` → same |
| POST | `/api/internal/notify` | sendPush opts | `{ success }` | `x-internal-secret` check; Zod; no JWT |

Error codes to implement: `invalid_uuid`, `not_found`, `unauthorized`, `invalid_secret`, `validation_error`, `urgent_not_disableable`.

---

## 10. WebSocket Extensions

Add to `utils-server/types.ts` (kebab-case event names per convention):

```ts
// Outbound
{ event: 'notification:new',          payload: { notification: NotificationDTO } }
{ event: 'notification:badge_update', payload: { count: number } }
// Inbound
{ event: 'notification:read',         payload: { notification_id: string } }
```
`notification:read` (inbound) marks the row read server-side **and** cancels any pending debounced chat push for that conversation (§7). WS delivery itself goes through the same `sendPush` insert path — i.e., `lib/notify.ts` decides WS-vs-push and emits both; the WS server only transports.

---

## 11. Security & Privacy

1. Tokens and receipts **never** logged — `logger` calls pass `user_id`/`type`/counts only; strip `details` from Expo error receipts before logging.
2. Push payloads carry no PII beyond names/labels (§3 privacy rule).
3. `/api/internal/notify` is secret-gated with constant-time compare; rejects with generic `invalid_secret`.
4. `EXPO_ACCESS_TOKEN`, `WEBSOCKET_INTERNAL_SECRET` server-side only; never `EXPO_PUBLIC_*`.
5. Preferences cannot disable safety-critical types server-side (UI also hides those toggles).
6. Device-token endpoints are token-scoped: users can only register/delete their own tokens.

---

## 12. Edge Cases

| Case | Handling |
|---|---|
| App killed | OS push lands; tap → cold-start deep link via `getLastNotificationResponseAsync` |
| App foreground | Handler suppresses contextually (§8.5); banner otherwise |
| Token rotation | `addPushTokenListener` → re-register |
| Token moves between users | Upsert reassigns `user_id` |
| Multiple devices | Fan out to all valid tokens |
| No network | Local active-session alarms still fire; push queued by APNs/FCM; WS reconnect backfill |
| Permission denied | In-app-only mode + settings prompt; nothing blocked |
| DND / Focus | `urgent`/`alarm` bypass; others land silently in inbox |
| OEM battery optimization (TD-01) | Server-authoritative reminders; local alarms only for active sessions |
| Android 13+ no POST_NOTIFICATIONS | Treated as denied; in-app-only |
| iOS time-sensitive Focus | `interruptionLevel: 'time-sensitive'` on ride_call/urgent/alarm |
| Duplicate triggers (retries, scheduler overlap) | `idempotency_key` unique insert |
| Badge drift | Recompute from server on resume |
| Broadcast storm | Chunk + throttle ≤ 500/min in broadcast handler |
| Logout with pending locals | `cancelAllScheduledNotificationsAsync()` |
| Deep link to deleted/cancelled ride | Graceful fallback to parent tab |

---

## 13. Implementation Order (phased, each phase gated)

**Gate for every phase:** `npx tsc --noEmit` ✓ · `npm run lint` ✓ · `grep -r "console.log" app/ lib/ utils-server/ src/` returns nothing ✓ · Conventional Commit (`feat(notification): ...` or `fix(notification): ...`).

| Phase | Work | Exit gate |
|---|---|---|
| **0 — Pre-flight** | Verify Expo `projectId`, APNs/FCM config in Expo dashboard, `EXPO_ACCESS_TOKEN` creation; audit current `lib/notify.ts`, `user/device+api.ts`, `rider/notifications+api.ts` contents; verify icon/sound assets | Credentials exist (UNKNOWN until checked) |
| **1 — Schema** | Migration `0038` (4 tables + enum + indexes), `drizzle-kit generate` → review SQL → push | Migration applies cleanly |
| **2 — Server core** | `lib/notify.ts`, prefs gate, idempotency, chunking, `push_tickets`; `/api/internal/notify`; receipt sweep job; retention jobs | Unit-testable; secret rejection tested |
| **3 — Device tokens** | Extend device endpoints; client permission flows (both roles), registration w/ retry, rotation listener, logout cleanup | Token appears in DB on login, gone on logout |
| **4 — Client plumbing** | app.config plugin (**EAS rebuild gate**), channels, handler, both listeners + cold-start, deep-link router, badge sync | Deep links work from killed state |
| **5 — Triggers** | ride_call fallback in dispatch first; then lifecycle, cancel, chat debounce, SOS, tip/extra-charge | Each event produces exactly one notification |
| **6 — WS integration** | types.ts events, delivery policy (§7), `notification:read`, reconnect backfill | No double notification when WS connected |
| **7 — UI** | Inbox wired to `/api/notifications` (reuse plan03 components), prefs screens wired (urgent/alarm toggles disabled with rationale) | Unread badge consistent |
| **8 — Alarms** | Active-session local timers; scheduler reminder job + local backup dedupe | Reminder fires with app killed |
| **9 — Localization & hardening** | bn/en server-side templates, payload privacy audit, low-end device pass (no map re-render on badge update) | bn push renders correctly |
| **10 — Docs sync** | Update AGENTS.md + CLAUDE.md together: write-ownership entries, store count 7→8, `EXPO_ACCESS_TOKEN` env var, known-issues note | Both files consistent |

**Deploy order** (per AGENTS.md): `drizzle-kit push` → utils-server → EAS build/submit.

---

## 14. Verification Checklist

- [ ] Token registered on login, removed on logout and delete-account
- [ ] Driver receives `ride_call` push when WS disconnected — background **and** killed
- [ ] Driver receives **no** push for offers when WS connected (offer UI via WS)
- [ ] Rider receives `ride_update` for accepted/arrived/started/completed/cancelled
- [ ] Cancelling a ride notifies the *other* party exactly once
- [ ] Chat push debounced: one push per burst; none while chat screen open; none over connected WS
- [ ] SOS push reaches admin + emergency contacts even with prefs "off"
- [ ] `urgent_alert`/`alarm` cannot be disabled via API (400) or UI
- [ ] Scheduled-ride reminders fire at T-60m and T-15m with app killed (server push) and don't double when app alive or on scheduler restart
- [ ] No-show/break local alarms fire and cancel deterministically
- [ ] Inbox: pagination, unread badge, mark-one/mark-all read; badge identical on iOS after resume
- [ ] Deep links resolve correctly from killed state for all 5 types; invalid ride id degrades gracefully
- [ ] Disabled preference types produce no push (except urgent/alarm)
- [ ] Duplicate trigger (same idempotency key) inserts exactly one notification
- [ ] Invalid/stale tokens removed by receipt sweep within one job cycle
- [ ] Multi-device user receives on all devices
- [ ] bn and en users get localized push text; no PII in title/body
- [ ] Android channels exist with correct importance/vibration; urgent+alarm bypass DND
- [ ] Broadcast of 1,000 users stays under Expo rate limit without drops
- [ ] Test on one low-end Android (Android 13 and 14) + one iOS device
- [ ] `npx tsc --noEmit` · `npm run lint` · no `console.log` · no secrets in client bundle

---

## 15. Risks / Unknowns

| Item | Status |
|---|---|
| Expo push credentials (`projectId`, APNs/FCM wiring, `EXPO_ACCESS_TOKEN`) | **UNKNOWN** — Phase 0 gate |
| Current contents/behavior of existing `lib/notify.ts`, `user/device+api.ts`, `rider/notifications+api.ts` | **UNKNOWN** until audited (Phase 0) — plan assumes extend-not-replace |
| Exact accept-handler location for the "accepted" trigger (WS confirm path) | **UNKNOWN** — trace during Phase 5 |
| OEM push delivery variance (Xiaomi/Realme heavy in BD) | FCM is the delivery path; mitigated by server-authoritative reminders |
| iOS critical-alert entitlement | Not assumed; `time-sensitive` is the ceiling |
| Sound file compatibility | Verify wav specs on both platforms during Phase 4 rebuild |

---

## 16. Out of Scope

- SMS fallback via dpRelay (separate service, untouched)
- In-app chat UI changes beyond notification triggers
- Push analytics/delivery dashboards (receipts are operational hygiene only)
- Push A/B testing
- Rich media (image) notifications — candidate for a future phase
- Driver-side inbox screen (driver is WS-first; rider gets the inbox)

---

### Appendix — v1 → v2 delta (what changed and why)

1. **Receipt sweep + `push_tickets`** — v1 never cleaned dead tokens; sends would rot silently.
2. **WS-vs-push delivery policy with chat debounce** — v1 would double-notify every connected user.
3. **Killed-state deep links** (`getLastNotificationResponseAsync`) — v1 only handled live-app taps.
4. **Server-authoritative scheduled reminders** — v1's local-only alarms die with OEM battery optimization (TD-01); server push now owns them, local is backup.
5. **Single-writer architecture** via `/api/internal/notify` + `WEBSOCKET_INTERNAL_SECRET` — utils-server no longer bypasses ownership rules.
6. **Idempotency keys end-to-end** (`notifications.idempotency_key` + `dedupe_id` in payload) — retries can't double-notify.
7. **Aligned to codebase reality** — real route paths, existing files reused, snake_case Drizzle, Expo param style, `parseJsonBody`, existing prefs path kept, migration numbered `0038`, `system` type added for broadcast/docs/support/payment messages.
8. **Dropped `react-native-vibration`** — channel vibration covers it; keeps Managed Workflow clean.
9. **Safety policy enforced server-side** — urgent/alarm non-disableable (API returns 400, UI hides toggles).
10. **Operational hardening** — TTL/priority/interruption per type, channel immutability/versioning, rate-limit-safe broadcasts, token privacy in logs, bn/en localization, pagination + badge-drift sync, logout cleanup, EXPO_ACCESS_TOKEN env governance, AGENTS/CLAUDE doc-sync step.