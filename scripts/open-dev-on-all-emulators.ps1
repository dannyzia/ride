# Open the Ride development build on every booted Android emulator,
# each connected to the single Metro instance running on the host.
#
# Prereqs:
#   - Metro running:  npx expo start --dev-client   (do NOT press 'a' when 2+ devices)
#   - Dev build installed on each emulator (com.ride.bd)
#
# Usage:
#   pwsh scripts/open-dev-on-all-emulators.ps1
#   pwsh scripts/open-dev-on-all-emulators.ps1 -Port 8082
#   pwsh scripts/open-dev-on-all-emulators.ps1 -MinDevices 2

[CmdletBinding()]
param(
    [int]$Port = 8081,
    [int]$MinDevices = 1,
    [int]$DeviceWaitTimeoutSec = 120,
    [int]$BootTimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
$Package = 'com.ride.bd'
# Use 10.0.2.2 (Android emulator's built-in host alias) instead of 127.0.0.1.
# adb reverse broke after a platform-tools update (~July 2026); 10.0.2.2 routes
# through QEMU's NAT directly to the host's 127.0.0.1 and doesn't depend on adb.
$DeepLink = "exp+ride-bd://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A$Port"

function Get-EmulatorSerials {
    @(adb devices |
        Select-String 'emulator-\d+\s+device' |
        ForEach-Object { ($_.Line -split '\s+')[0] })
}

# 1) Wait for at least $MinDevices emulators to appear in `adb devices`.
Write-Host "Waiting for >= $MinDevices emulator(s) to be detected..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds($DeviceWaitTimeoutSec)
$serials = Get-EmulatorSerials
while ($serials.Count -lt $MinDevices -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $serials = Get-EmulatorSerials
}
if ($serials.Count -eq 0) {
    Write-Error "No emulators detected within $DeviceWaitTimeoutSec s. Start emulators first."
    return
}
# Settle window: a sibling emulator launched moments ago may still be registering.
Start-Sleep -Seconds 5
$serials = Get-EmulatorSerials

Write-Host "Found $($serials.Count) emulator(s): $($serials -join ', ')" -ForegroundColor Cyan
Write-Host "Metro port: $Port" -ForegroundColor Cyan

# 2) Wait until each emulator reports a completed boot before touching it.
foreach ($serial in $serials) {
    Write-Host "Waiting for $serial to finish booting..." -ForegroundColor DarkCyan
    adb -s $serial wait-for-device | Out-Null
    $bootDeadline = (Get-Date).AddSeconds($BootTimeoutSec)
    $ready = ''
    while ((Get-Date) -lt $bootDeadline) {
        $ready = (adb -s $serial shell getprop sys.boot_completed 2>$null)
        if ($ready -match '1') { break }
        Start-Sleep -Seconds 2
    }
    if ($ready -notmatch '1') {
        Write-Warning "$serial did not report boot_completed within $BootTimeoutSec s; continuing anyway."
    } else {
        Write-Host "  $serial booted." -ForegroundColor DarkGreen
    }
}

# 3) Reverse the Metro port and launch the app on each emulator.
foreach ($serial in $serials) {
    Write-Host "`n=== $serial ===" -ForegroundColor Yellow

    $installed = adb -s $serial shell pm list packages $Package 2>$null
    if (-not ($installed -match [regex]::Escape($Package))) {
        Write-Warning "${serial}: $Package not installed. Build it once: npx expo run:android --device $serial"
        continue
    }

    # adb reverse is kept as a fallback but the primary path is 10.0.2.2 (see
    # $DeepLink above). On some platform-tools versions reverse forwarding is
    # broken on Windows; 10.0.2.2 does not depend on it.
    adb -s $serial reverse tcp:$Port tcp:$Port | Out-Null
    Write-Host "  reverse tcp:$Port -> host tcp:$Port (fallback)"
    # Restart the app fresh, pointing at Metro.
    adb -s $serial shell am force-stop $Package | Out-Null
    adb -s $serial shell am start -a android.intent.action.VIEW -d $DeepLink | Out-Null
    Write-Host "  launched $Package -> $DeepLink"
}

Write-Host "`nDone. All apps share the same Metro bundle." -ForegroundColor Green
Write-Host "Tip: sign in as rider on one emulator and driver on the other." -ForegroundColor DarkGray
