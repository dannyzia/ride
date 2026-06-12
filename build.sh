#!/bin/sh
# Render build script — installs deps then exports Expo web
set -e
npm install
npx expo export --platform web
