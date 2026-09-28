#!/usr/bin/env bash
# Host-side GPS seed — Banani (pickup origin), per plans/maestro-architecture.md §3.2.
# Run BEFORE the Maestro suite (GPS must precede app launch). Emulator only.
adb shell emu geo fix 90.4066 23.7937
echo "gps seeded: banani 90.4066 23.7937"
