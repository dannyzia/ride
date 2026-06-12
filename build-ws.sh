#!/bin/sh
# Render build script for utils-server (WebSocket server).
# This service MUST build from the project root because utils-server/
# imports from ../lib/ and ../src/db/.
set -e
npm install
cd utils-server && npm install && cd ..
