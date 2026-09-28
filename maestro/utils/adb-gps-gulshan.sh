#!/usr/bin/env bash
# Host-side GPS seed — Gulshan-2 (destination side), per §3.2. Emulator only.
adb shell emu geo fix 90.4152 23.7956
echo "gps seeded: gulshan 90.4152 23.7956"
