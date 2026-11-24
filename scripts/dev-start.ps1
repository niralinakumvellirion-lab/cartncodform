# One command for local testing with the DEV app ("ShopiReachBoost AI Dev"). Never touches the live app.
#
#   powershell -ExecutionPolicy Bypass -File D:\cartncodform\scripts\dev-start.ps1
#
# 1. Stops old copies of the backend (port 4000), admin (port 3030) and ngrok.
# 2. Opens four windows: Backend (.env.dev), Admin (next dev), Tunnel (ngrok), Shopify dev.
# 3. Waits until backend and admin answer, then starts `shopify app dev --config dev`.
# Close those four windows (or run this again) to stop.

$ErrorActionPreference = 'Stop'
$root   = Split-Path $PSScriptRoot -Parent
$tunnel = 'subsonic-regain-bounce.ngrok-free.dev'

function Stop-Old {
  # This project's nodemon (backend watcher) and next dev (admin) — both have the project path in
  # their command line. Without this, an old nodemon would restart the backend and grab port 4000 again.
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'cartncodform' -and $_.CommandLine -match 'nodemon|[\\/]next[\\/]dist[\\/]'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  # Whatever still holds the backend / admin ports (the backend child is just `node server.js`).
  foreach ($port in 4000, 3030) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -Unique OwningProcess |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Open-Window($title, $dir, $cmd) {
  $script = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$dir'; $cmd"
  Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $script | Out-Null
}

function Wait-Port($port, $name, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
      Write-Host "  OK  $name is up (port $port)" -ForegroundColor Green
      return $true
    }
    Start-Sleep -Seconds 2
  }
  Write-Host "  !!  $name did not start - look at its window for the error" -ForegroundColor Red
  return $false
}

if (-not (Test-Path "$root\backend\.env.dev")) { throw 'backend\.env.dev is missing.' }

Write-Host 'Stopping old servers...' -ForegroundColor Cyan
Stop-Old
Start-Sleep -Seconds 2

Write-Host 'Starting backend, admin and tunnel...' -ForegroundColor Cyan
Open-Window '1 Backend (dev)' "$root\backend"  'npm run dev:local'
Open-Window '2 Admin (dev)'   "$root\frontend" 'npm run dev'
Open-Window '3 Tunnel'        $root            "ngrok http --url=$tunnel 3030"

$ok = (Wait-Port 4000 'Backend' 120) -and (Wait-Port 3030 'Admin' 120)
if (-not $ok) { exit 1 }

Write-Host 'Starting Shopify dev (theme blocks + checkout discount)...' -ForegroundColor Cyan
Open-Window '4 Shopify dev' $root 'shopify app dev --config dev'

Write-Host ''
Write-Host 'Ready. Next:' -ForegroundColor Green
Write-Host "  1. First time only: open https://$tunnel/admin in Chrome and click 'Visit Site'."
Write-Host "  2. In window '4 Shopify dev', press p to open the app inside Shopify."
