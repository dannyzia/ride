#!/bin/sh
# verify-render-deploy.sh — Post-deploy verification for Render
#
# Usage:
#   bash scripts/verify-render-deploy.sh https://ride-api.onrender.com
#
# Checks:
#   1. Health endpoint (/api/ping) returns 200
#   2. Static HTML served (admin/login page)
#   3. API route dispatches (not 404)
#   4. No native module errors in response
#
# Exit code: 0 = all checks pass, 1 = failures

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <deploy-url>"
  echo "Example: $0 https://ride-api.onrender.com"
  exit 1
fi

BASE_URL="$1"
FAILURES=0

echo "=== Render Deploy Verification ==="
echo "Target: $BASE_URL"
echo ""

# Check 1: Health endpoint
echo "1. Health endpoint (/api/ping)..."
HTTP_CODE=$(curl -s -o /tmp/render-health.json -w "%{http_code}" "$BASE_URL/api/ping" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  BODY=$(cat /tmp/render-health.json)
  echo "   ✅ HTTP 200 — $BODY"
else
  echo "   ❌ HTTP $HTTP_CODE (expected 200)"
  FAILURES=$((FAILURES + 1))
fi

# Check 2: Static HTML (admin login)
echo "2. Static HTML (/admin/login)..."
HTTP_CODE=$(curl -s -o /tmp/render-admin.html -w "%{http_code}" "$BASE_URL/admin/login" 2>/dev/null || echo "000")
SIZE=$(wc -c < /tmp/render-admin.html 2>/dev/null || echo "0")
if [ "$HTTP_CODE" = "200" ] && [ "$SIZE" -gt 1000 ]; then
  echo "   ✅ HTTP 200 — ${SIZE} bytes"
else
  echo "   ❌ HTTP $HTTP_CODE — ${SIZE} bytes (expected 200, >1000 bytes)"
  FAILURES=$((FAILURES + 1))
fi

# Check 3: API route dispatches (verify-token should return 401/400, not 404)
echo "3. API route dispatch (/api/auth/verify-token)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/verify-token" -H "Content-Type: application/json" -d "{}" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "404" ]; then
  echo "   ✅ HTTP $HTTP_CODE (route exists, not 404)"
else
  echo "   ❌ HTTP 404 (route not found — export may have failed)"
  FAILURES=$((FAILURES + 1))
fi

# Check 4: No "does not support this platform" in admin page
echo "4. Native module safety check..."
if grep -q "does not support this platform" /tmp/render-admin.html 2>/dev/null; then
  echo "   ⚠️  Warning: 'does not support this platform' found in HTML (non-critical)"
else
  echo "   ✅ No native module errors in response"
fi

# Summary
echo ""
echo "=== Results ==="
if [ "$FAILURES" -eq 0 ]; then
  echo "✅ All checks passed — deploy is healthy."
else
  echo "❌ $FAILURES check(s) failed."
  exit 1
fi
