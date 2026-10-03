#!/usr/bin/env bash
# Host-side GPS seed — Gulshan-2 (destination side), per §3.2. Emulator only.
#
# adb comes from the shared resolver (adb-env.sh) so this script cannot end up
# driving a different build than bootstrap/run-device-day — two builds on this
# box both bind tcp:5037, and mixing them makes the resulting state describe the
# wrong binary. Override with ADB=/path/to/adb.
. "$(dirname "$0")/adb-env.sh"

"$ADB" shell emu geo fix 90.4152 23.7956
echo "gps seeded: gulshan 90.4152 23.7956"