#!/usr/bin/env pwsh
# dev-bring-up.ps1 — deterministic dev bring-up.
# Run after a code change or when the test chain has drifted.
# Idempotent: re-running re-asserts adb reverse and re-launches the app on both phones.

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot | Split-Path -Parent
Set-Location $projectRoot

function Step($n, $label) { Write-Host "`n[$n] $label" -ForegroundColor Cyan }

# 0. Kill any stale node/tsx that hold ports 8081 / 3001.
Step '0' "Killing stale server processes"
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match 'expo|metro|tsx' -or $_.Path -match 'utils-server'
} | ForEach-Object {
    Write-Host "  killing PID $($_.Id) ($($_.ProcessName))"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

# 1. utils-server
Step '1' "Starting utils-server (3001)"
$utils = Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','cd /d utils-server && npm run dev' `
    -WorkingDirectory $projectRoot -WindowStyle Normal -PassThru
Write-Host "  PID $($utils.Id) — waiting for :3001"
$ready = $false
for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if (-not $ready) { Write-Warning "  utils-server not responding after 20s — continuing anyway" }
else { Write-Host "  utils-server healthy" }

# 2. Metro
Step '2' "Starting Metro (8081)"
if (Test-Path 'C:\node20\node.exe') {
    $env:PATH = 'C:\node20;' + $env:PATH
    $nodeNote = '(Node 20 portable)'
} else {
    $nodeNote = '(system Node — Metro may fail with Node 24 watcher errors)'
}
Write-Host "  $nodeNote"
$metro = Start-Process -FilePath 'cmd.exe' -ArgumentList '/k',"set PATH=$env:PATH && node -v && npx expo start --dev-client" `
    -WorkingDirectory $projectRoot -WindowStyle Normal -PassThru
Write-Host "  PID $($metro.Id) — give Metro ~10s to print the QR"

# 3. adb reverse on every device that shows up
Step '3' "adb reverse on every authorized device"
adb kill-server | Out-Null
adb start-server | Out-Null
Start-Sleep -Seconds 2
$devices = adb devices | Select-String '^\S+\s+device$' | ForEach-Object { ($_ -split '\s+')[0] }
if (-not $devices) { Write-Warning "  no authorized devices — phones missing USB debugging or adb auth" }
foreach ($d in $devices) {
    Write-Host "  $d → :8081 and :3001"
    adb -s $d reverse tcp:8081 tcp:8081 | Out-Null
    adb -s $d reverse tcp:3001 tcp:3001 | Out-Null
}
Write-Host "  adb reverse list:"
adb reverse --list | Out-String | Write-Host

# 4. (optional) launch the dev build on the rider phone
$rider = '24261JEGR10296'
if ($devices -contains $rider) {
    Step '4' "Launching dev build on rider phone ($rider)"
    $null = adb -s $rider shell am start -W -a android.intent.action.VIEW `
        -d "exp+ride-bd://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.ride.bd
    Write-Host "  launched. Watch the phone for the dev-launcher → tap the Metro entry."
} else {
    Write-Host "  rider phone not connected — skip step 4 (run manually once plugged in)"
}

Write-Host "`n[done] bring-up sequence complete. Metro window is the source of truth for the next step." -ForegroundColor Green
