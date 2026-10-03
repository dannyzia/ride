#!/usr/bin/env bash
# Host-side GPS seed — Banani (pickup origin), per plans/maestro-architecture.md §3.2.
# Run BEFORE the Maestro suite (GPS must precede app launch). Emulator only.
#
# adb comes from the shared resolver (adb-env.sh) so this script cannot end up
# driving a different build than bootstrap/run-device-day — two builds on this
# box both bind tcp:5037, and mixing them makes the resulting state describe the
# wrong binary. Override with ADB=/path/to/adb.
# shellcheck source=maestro/utils/adb-env.sh
. "$(dirname "$0")/adb-env.sh"

"$ADB" shell emu geo fix 90.4066 23.7937
echo "gps seeded: banani 90.4066 23.7937"