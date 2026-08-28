# Render Deployment Checklist

## Prerequisites

1. GitHub repo `dannyzia/ride` connected to Render
2. Branch: `implementation`
3. Render service: `ride-api` (Web Service)

## Environment Variables

Set these in Render Dashboard → Environment. **All are required.**

### Build-Time (baked into web bundle during `expo export`)

| Key | Source | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env.local` | Same as `SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Supabase anon/public key |
| `EXPO_PUBLIC_SERVER_URL` | `.env.local` | `https://ride-api.onrender.com` (set after first deploy) |
| `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL` | `.env.local` | WebSocket server URL (utils-server) |
| `EXPO_PUBLIC_BARIKOI_API_KEY` | `.env.local` | Barikoi maps API key |
| `EXPO_PUBLIC_SUPPORT_PHONE` | `.env.local` | Support phone number |

### Runtime (server.js + API routes)

| Key | Source | Notes |
|---|---|---|
| `DATABASE_URL` | `.env.local` | Supabase PostgreSQL connection string (Transaction mode) |
| `SUPABASE_URL` | `.env.local` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Supabase service role key (secret!) |
| `PORTPOS_APP_KEY` | `.env.local` | PortPos payment gateway app key |
| `PORTPOS_SECRET_KEY` | `.env.local` | PortPos payment gateway secret key |
| `PORTPOS_BASE_URL` | `.env.local` | `https://api-sandbox.portpos.com` (prod: `https://api.portpos.com`) |
| `PORTPOS_CALLBACK_URL` | `.env.local` | `https://ride-api.onrender.com/api/payment/portpos/callback` |
| `BARIKOI_API_KEY` | `.env.local` | Barikoi API key (server-side) |
| `WEBSOCKET_INTERNAL_SECRET` | `.env.local` | Min 32 chars — shared with utils-server |

### Auto-Set by Render

| Key | Value |
|---|---|
| `NODE_ENV` | `production` (set in render.yaml) |
| `PORT` | Auto-assigned by Render |

## Deploy Steps

1. **Push to `implementation` branch**
   ```bash
   git push origin implementation
   ```

2. **Render auto-deploys** (`autoDeploy: true` in render.yaml)
   - Build: `bash build.sh` → `npm ci` → `npx expo export --platform web`
   - Start: `node server.js`

3. **Wait for deploy** (~5-10 min for build + start)

4. **Run verification**
   ```bash
   bash scripts/verify-render-deploy.sh https://ride-api.onrender.com
   ```

## Post-Deploy: Update URLs

After first successful deploy, update these env vars with the actual Render URL:

- `EXPO_PUBLIC_SERVER_URL` → `https://ride-api.onrender.com`
- `PORTPOS_CALLBACK_URL` → `https://ride-api.onrender.com/api/payment/portpos/callback`

Then trigger a **manual redeploy** (the EXPO_PUBLIC_* vars are baked at build time).

## Verification Output

```
=== Render Deploy Verification ===
Target: https://ride-api.onrender.com

1. Health endpoint (/api/ping)...
   ✅ HTTP 200 — {"ok":true,"now":...}
2. Static HTML (/admin/login)...
   ✅ HTTP 200 — 29496 bytes
3. API route dispatch (/api/auth/verify-token)...
   ✅ HTTP 400 (route exists, not 404)
4. Native module safety check...
   ✅ No native module errors in response

=== Results ===
✅ All checks passed — deploy is healthy.
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build OOM | Ensure `NODE_OPTIONS="--max-old-space-size=4096"` is in buildCommand |
| `MODULE_NOT_FOUND` for native package | Create `.web.ts` platform-split stub (see `utils/maplibreLoader.web.ts`) |
| `SyntaxError: Unexpected end of JSON input` | Check `PORTPOS_CALLBACK_URL` is set correctly |
| `500` on all API routes | Check `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` |
| `401` on `/api/auth/verify-token` | Expected locally (no live DB) — expected on Render too if Supabase JWT verification fails |
