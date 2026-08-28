#!/bin/sh
# Render build script — installs deps then exports Expo web
# Heap raised because `expo export` bundles 184 API routes in ONE Metro
# process; measured peak heap ~3.5 GB (2026-08-28). Node's default ~2 GB
# cap OOMs mid-build on Render.
set -e
npm ci --prefer-offline
NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096" npx expo export --platform web
