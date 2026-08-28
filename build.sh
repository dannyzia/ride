#!/bin/sh
# Render build script — installs deps then exports Expo web
set -e
npm ci --prefer-offline
npx expo export --platform web
