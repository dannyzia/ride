#Requires -Version 5.1
<#
bootstrap-ride-avd-runner.ps1 — one-time bootstrap of the self-hosted Windows
runner behind the real-AVD lane (`device-day` job) of
.github/workflows/device-preflight.yml.

**Purpose:**     Installs the GitHub Actions runner as a Windows service under the
                AVD-owning user, registers it to dannyzia/ride with the `ride-avd`
                label the lane pins on, then runs the lane's own three commands
                and only then declares success. Run once per host; re-run with
                -Force to re-register, or -VerifyOnly to re-check without changes.
**Owner:**       Zia (device-day host mechanics)
**Status:**      ACTIVE
**Source of truth:** maestro/DEVICE-DAY-RUNBOOK.md §"The same preflight in CI"
                (the three runner requirements encoded here);
                .github/workflows/device-preflight.yml (the lane's commands —
                the VERIFY block below mirrors the `device-day` job step for step).
**Related (concrete paths):**
  - .github/workflows/device-preflight.yml — the `device-day` job this runner serves
  - maestro/DEVICE-DAY-RUNBOOK.md §"The same preflight in CI" — prose authority for
    the runner requirements (AVD-owning user, label, PATH)
  - maestro/utils/run-device-day.sh — `--check` + PREFLIGHT_DEVICE=required (verified here)
  - maestro/utils/adb-env-selftest.sh — single-adb pinning guard (verified here)
  - maestro/utils/section7-preflight-gate.sh — §7 preflight gate guard (verified here)
  - maestro/utils/bootstrap-device-day.sh — sibling bootstrap for the app/services
    half of a device day (Metro, utils-server, emulator); this script is the
    RUNNER half
**Last verified:** 2026-10-05, coding model — PowerShell 5.1 parse clean; the
                three VERIFY invocations cross-checked line-for-line against
                the `device-day` job; -VerifyOnly EXECUTED on the AVD-owning
                host itself: preconditions ✓ (bash/adb/maestro resolve), all
                three lane commands exit 0 (required-mode `--check` with
                emulator ✓ and AVD Medium_Phone ✓, adb-env-selftest PASS,
                section7-preflight-gate PASS). The INSTALL path (service
                registration) is not yet exercised — it needs an elevated
                shell and a live registration token.
**How to update:** If the `device-day` job's commands change in
                device-preflight.yml, change the VERIFY block to match — this
                script must never drift from the workflow it verifies. Update
                the runbook's runner-setup section in the same change. KEEP THE
                UTF-8 BOM: Windows PowerShell 5.1 reads a BOM-less UTF-8 file
                as ANSI, and the em-dash bytes (E2 80 94) then decode into a
                curly quote (U+201D) that PowerShell treats as a STRING
                TERMINATOR — the file stops parsing at the first em-dash in a
                string (measured 2026-10-05: `MissingEndCurlyBrace` at every
                open block past the string). Do not let an editor strip it.

Usage — run from an ELEVATED PowerShell, AS the AVD-owning user (the account
whose %USERPROFILE%\.android\avd holds the AVD; a LocalSystem service cannot
see it — that constraint is why the service logon account is this user):

  .\maestro\utils\bootstrap-ride-avd-runner.ps1 -RegistrationToken <token>
  .\maestro\utils\bootstrap-ride-avd-runner.ps1 -Pat <github-pat-with-repo-scope>
  .\maestro\utils\bootstrap-ride-avd-runner.ps1 -VerifyOnly
  .\maestro\utils\bootstrap-ride-avd-runner.ps1 -Force   # re-register from scratch

The registration token comes from Settings → Actions → Runners → New self-hosted
runner (expires in ~1 h), or is minted via the API when -Pat is supplied. It and
the service password are used in-memory only, never written or echoed.

Exit codes (the same family as run-device-day.sh):
  0 = runner registered AND service verified AND all three lane commands pass
  1 = precondition, install, or verification failure (see the ❌ BLOCKED banner)
  2 = usage error
#>

[CmdletBinding()]
param(
  # Target repo. Pinned to the lane's home; change only if the lane moves.
  [string]$Repo = 'dannyzia/ride',
  # Runner display name on the Actions UI. Defaults to <host>-ride-avd.
  [string]$RunnerName = "$env:COMPUTERNAME-ride-avd",
  # Dedicated directory, NOT inside the checkout (GitHub's own guidance).
  [string]$InstallDir = (Join-Path $env:USERPROFILE 'actions-runner-ride'),
  # actions/runner release to install; 'latest' resolves via the GitHub API.
  [string]$RunnerVersion = 'latest',
  # Runner registration token (Settings → Actions → Runners → New runner).
  [string]$RegistrationToken,
  # Or a PAT with repo scope; the script mints the registration token itself.
  [string]$Pat,
  # Windows password for the AVD-owning user (service logon). Prompted if absent.
  [SecureString]$ServicePassword,
  # Re-verify without installing anything (no elevation required).
  [switch]$VerifyOnly,
  # Re-register even if the install dir already holds a configured runner.
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── small UX helpers: the runbook's `die BLOCKER "cause" "remedy"` family ──────
function Die {
  param([string]$Blocker, [string]$Cause, [string]$Remedy, [int]$Code = 1)
  Write-Host ''
  Write-Host "BLOCKED: $Blocker" -ForegroundColor Red
  Write-Host "   cause : $Cause"
  Write-Host "   remedy: $Remedy"
  exit $Code
}
function Step([string]$Msg) { Write-Host ''; Write-Host "== $Msg ==" -ForegroundColor Cyan }
function Ok([string]$Msg)   { Write-Host "   ok  $Msg" -ForegroundColor Green }
function SecureToPlain {
  param([SecureString]$Secret)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# The lane's three commands, exactly as the `device-day` job runs them. If
# device-preflight.yml changes them, change these lines in the same commit —
# a drift here would make this script verify a lane that no longer exists.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LaneChecks = @(
  @{ Name = 'device-day preflight (PREFLIGHT_DEVICE=required)'; File = 'maestro/utils/run-device-day.sh'; Args = @('--check'); PreflightDevice = 'required'
     Remedy = 'Read the transcript: exit 1 means adb resolution, the Maestro CLI, or a section 7 key-flow file drifted (maestro/DEVICE-DAY-RUNBOOK.md).' },
  @{ Name = 'single-adb pinning self-test'; File = 'maestro/utils/adb-env-selftest.sh'; Args = @(); PreflightDevice = ''
     Remedy = 'A script under maestro/utils/ calls bare `adb` or stopped sourcing adb-env.sh — see the case names in the transcript.' },
  @{ Name = 'section 7 preflight gate self-test'; File = 'maestro/utils/section7-preflight-gate.sh'; Args = @(); PreflightDevice = ''
     Remedy = 'The section 7 gate or its extraction from DEVICE-DAY-RUNBOOK.md drifted — see the transcript.' }
)

# ── 1) preconditions (all also re-checked by -VerifyOnly) ─────────────────────
Step 'preconditions'

if ($env:OS -ne 'Windows_NT') {
  Die 'not a Windows host' 'this bootstrap installs a Windows runner service' 'run it on the AVD-owning Windows device-day host'
}
Ok "Windows $([Environment]::OSVersion.Version)"

if (-not (Test-Path (Join-Path $RepoRoot 'maestro/utils/run-device-day.sh'))) {
  Die 'repo checkout not found' "no maestro/utils/run-device-day.sh under $RepoRoot" 'run this script from inside a checkout of the repo (it locates the root via its own path)'
}
Ok "repo root $RepoRoot"

# The whole point of this runner: it executes AS the user who owns the AVD.
# %USERPROFILE%\.android\avd is exactly what a LocalSystem/NETWORK SERVICE
# logon cannot see (runbook §"The same preflight in CI"), so the script refuses
# to install under any other identity than the one it is running as.
$AvdDir = Join-Path $env:USERPROFILE '.android\avd'
if (-not (Test-Path $AvdDir)) {
  Die 'no AVD under this user profile' "expected $AvdDir" 'run this script as the AVD-owning user (the account you use for an interactive device day) — a service under any other account cannot see the AVD'
}
Ok "AVD directory $AvdDir"
$LogonAccount = "$env:USERDOMAIN\$env:USERNAME"
Ok "service will run as $LogonAccount (the AVD-owning user)"

# The lane installs NOTHING on purpose (the host toolchain is the thing under
# test), so every tool it needs must already resolve on THIS PATH.
foreach ($tool in 'bash', 'adb', 'maestro') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Die "'$tool' does not resolve on PATH" "the device-day job installs nothing; '$tool' must already be here" "install '$tool' for the AVD-owning user and match an interactive device day (Git Bash, Android platform-tools, Maestro CLI) — runbook §`"The same preflight in CI`" step 3"
  }
  Ok "$tool -> $((Get-Command $tool).Source)"
}

# ── 2) verify the lane's commands BEFORE touching anything (and always) ───────
# Run as the current user = the service logon account, so this is exactly the
# resolution environment the job will see. Side-effect free by construction:
# `--check` boots nothing, and the two self-tests only read.
function Invoke-LaneChecks {
  Step 'verify the device-day lane commands'
  Push-Location $RepoRoot
  try {
    foreach ($check in $LaneChecks) {
      if (-not (Test-Path $check.File)) {
        Die 'lane script missing' "$($check.File) does not exist in this checkout" 'restore the script — the workflow calls it, so the lane cannot pass without it'
      }
      if ($check.PreflightDevice) { $env:PREFLIGHT_DEVICE = $check.PreflightDevice } else { Remove-Item Env:PREFLIGHT_DEVICE -ErrorAction SilentlyContinue }
      Write-Host "   -> $($check.Name)"
      & bash $check.File @($check.Args)
      $code = $LASTEXITCODE
      if ($code -ne 0) {
        Die $check.Name "exit $code from 'bash $($check.File) $($check.Args -join ' ')'" $check.Remedy
      }
      Ok "$($check.Name) exit 0"
    }
  } finally {
    Pop-Location
    Remove-Item Env:PREFLIGHT_DEVICE -ErrorAction SilentlyContinue
  }
}

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($VerifyOnly) {
  Invoke-LaneChecks
  $existing = Get-CimInstance Win32_Service -Filter "Name LIKE 'actions.runner.%'" -ErrorAction SilentlyContinue |
    Where-Object { $_.PathName -like "*$InstallDir*" } | Select-Object -First 1
  if ($existing) {
    Ok "service $($existing.Name) present, $($existing.State), logon $($existing.StartName)"
  } else {
    Write-Host '   note: no runner service found in this install dir (run without -VerifyOnly to install)' -ForegroundColor Yellow
  }
  Write-Host ''
  Write-Host 'VERIFY ONLY — no changes made. All lane commands pass on this host.' -ForegroundColor Green
  exit 0
}

if (-not $IsAdmin) {
  Die 'not elevated' 'installing the runner service creates a Windows service' 're-run from a PowerShell started "as Administrator" (still as the AVD-owning user) — or use -VerifyOnly, which needs no elevation'
}

# ── 3) fetch the runner ───────────────────────────────────────────────────────
Step "fetch actions/runner $RunnerVersion (win-x64)"
$ver = $RunnerVersion
if ($ver -eq 'latest') {
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/actions/runner/releases/latest' -Headers @{ Accept = 'application/vnd.github+json' }
  $ver = $release.tag_name.TrimStart('v')
}
Ok "version $ver"

if (Test-Path (Join-Path $InstallDir '.runner')) {
  if (-not $Force) {
    Die 'runner already configured' "$InstallDir already contains a registered runner" 'pass -Force to remove and re-register it (or run config.cmd remove there by hand)'
  }
  Write-Host '   -Force: removing the existing registration first'
  Push-Location $InstallDir
  try {
    & .\config.cmd remove --unattended
    if ($LASTEXITCODE -ne 0) {
      Die 'could not remove the existing registration' "config.cmd remove exited $LASTEXITCODE" 'remove the runner in the Actions UI (Settings → Actions → Runners → the runner → Remove), delete the install dir, then re-run'
    }
  } finally { Pop-Location }
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$zip = Join-Path $env:TEMP "actions-runner-win-x64-$ver.zip"
Invoke-WebRequest -Uri "https://github.com/actions/runner/releases/download/v$ver/actions-runner-win-x64-$ver.zip" -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $InstallDir -Force
Ok "installed under $InstallDir"

# ── 4) register to dannyzia/ride with the ride-avd label, as a service ────────
Step "register to $Repo with label ride-avd (service logon $LogonAccount)"

$token = $RegistrationToken
if (-not $token -and $Pat) {
  $tok = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/actions/runners/registration-token" `
    -Headers @{ Authorization = "Bearer $Pat"; Accept = 'application/vnd.github+json' }
  $token = $tok.token
  Ok 'registration token minted from -Pat'
}
if (-not $token) {
  $token = Read-Host 'Registration token (Settings -> Actions -> Runners -> New self-hosted runner; expires in ~1h)'
}
if (-not $token) { Die 'no registration token' 'neither -RegistrationToken, -Pat, nor a prompt response supplied one' 'open Settings -> Actions -> Runners -> New self-hosted runner, copy the token, re-run' -Code 2 }

if (-not $ServicePassword) {
  $ServicePassword = Read-Host "Windows password for $LogonAccount (runner service logon; used in memory only)" -AsSecureString
}
$passwordPlain = SecureToPlain $ServicePassword
if (-not $passwordPlain) { Die 'no service password' 'the runner service cannot log on without the account password' 're-run and supply the AVD-owning user password' -Code 2 }

# --replace: a renamed/rebuilt host must not collide with a stale registration.
# --labels ride-avd is the lane's pin; --runasservice under THIS user is the
# runbook requirement that keeps %USERPROFILE%\.android\avd and %LOCALAPPDATA%
# visible to the job.
Push-Location $InstallDir
try {
  & .\config.cmd --url "https://github.com/$Repo" --token $token --name $RunnerName `
    --labels ride-avd --unattended --runasservice --replace `
    --windowslogonaccount $LogonAccount --windowslogonpassword $passwordPlain
  $configCode = $LASTEXITCODE
} finally {
  Pop-Location
  $passwordPlain = $null
}
if ($configCode -ne 0) {
  Die 'runner registration failed' "config.cmd exited $configCode" 'the token expires in ~1h and is single-use — mint a fresh one; if the error is about the service logon, grant "Log on as a service" to the account (secpol.msc -> Local Policies -> User Rights Assignment)'
}
Ok "registered $RunnerName -> $Repo (labels: ride-avd)"

# ── 5) verify the service identity and state ─────────────────────────────────
Step 'verify the runner service runs under the AVD-owning user'
$svc = Get-CimInstance Win32_Service -Filter "Name LIKE 'actions.runner.%'" |
  Where-Object { $_.PathName -like "*$InstallDir*" } | Select-Object -First 1
if (-not $svc) {
  Die 'runner service not registered' "no actions.runner.* service points at $InstallDir" 'check the config.cmd transcript above; re-run with -Force'
}
if ($svc.StartName -notin @($LogonAccount, ".\$env:USERNAME")) {
  Die 'service runs under the wrong account' "service logon is '$($svc.StartName)', not the AVD-owning user '$LogonAccount'" 'a LocalSystem/NETWORK SERVICE logon cannot see the AVD — remove this runner and re-run the bootstrap as the AVD-owning user'
}
Ok "service $($svc.Name) logon $($svc.StartName)"
if ($svc.State -ne 'Running') {
  Start-Service $svc.Name
  Start-Sleep -Seconds 3
  $svc = Get-CimInstance Win32_Service -Filter "Name = '$($svc.Name)'"
  if ($svc.State -ne 'Running') {
    Die 'runner service will not start' "state is $($svc.State) after Start-Service" 'grant "Log on as a service" to the AVD-owning user (secpol.msc -> Local Policies -> User Rights Assignment), then Start-Service'
  }
}
Ok "service $($svc.Name) running"

# ── 6) the lane's commands — the gate before success ─────────────────────────
# Same three invocations as the `device-day` job, run as the same account the
# service will use. If any fails, this host cannot serve the lane and the
# script exits non-zero WITHOUT declaring success.
Invoke-LaneChecks

Write-Host ''
Write-Host 'SUCCESS — self-hosted runner is ready for the real-AVD lane.' -ForegroundColor Green
Write-Host "  repo        : $Repo"
Write-Host "  runner      : $RunnerName (labels: ride-avd)"
Write-Host "  service     : $($svc.Name) as $LogonAccount ($($svc.State))"
Write-Host '  lane checks : run-device-day.sh --check (required) exit 0, adb-env-selftest exit 0, section7-preflight-gate exit 0'
Write-Host ''
Write-Host 'The first queued device-day run is still the real proof (Settings -> Actions -> Runs).'
exit 0
