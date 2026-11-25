# One command for local testing with the DEV app ("ShopiReachBoost AI Dev"). Never touches the live app.
#
#   powershell -ExecutionPolicy Bypass -File D:\cartncodform\scripts\dev-start.ps1
#
# 1. Stops old copies of the backend (4000), admin (3030), tunnel and `shopify app dev`.
# 2. Starts a Cloudflare quick tunnel to the admin (cloudflared ships with the Shopify CLI) and reads
#    its https://<random>.trycloudflare.com address. Unlike free ngrok it has no "You are about to
#    visit" page, so Shopify's app proxy (storefront widgets) gets real JSON.
# 3. Writes that address into backend/.env.dev, frontend/.env.development.local and a generated
#    shopify.app.devlocal.toml (copy of shopify.app.dev.toml, git-ignored), then deploys the DEV app.
# 4. Opens windows: Backend (.env.dev), Admin (next dev), Tunnel. The deploy above already ships the
#    theme blocks and checkout function, so no `shopify app dev` is run; an old dev preview is
#    cleaned up instead (it would point the app at a dead tunnel address).
# Close those windows (or run this again) to stop.

$ErrorActionPreference = 'Stop'
$root   = Split-Path $PSScriptRoot -Parent
# Test store with ONLY the dev app (the live app's store, cartncod-form, also uses /apps/cartncodform).
$store  = 'srb-dev-test.myshopify.com'
$cloudflared = Join-Path $env:APPDATA 'npm\node_modules\@shopify\cli\bin\cloudflared.exe'
$tunnelLog   = Join-Path $env:TEMP 'srb-dev-tunnel.log'

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

  # Old tunnels: ngrok (earlier setup) and our cloudflared (matched by its log file).
  Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'srb-dev-tunnel'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  # An older `shopify app dev` (two copies fight over the dev preview).
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'shopify' -and $_.CommandLine -match 'app\s+dev'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
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

# Replace KEY=... lines (adds the line when missing). Only the named keys change.
function Set-EnvLines($path, $values) {
  $lines = @()
  if (Test-Path $path) { $lines = @(Get-Content $path) }
  foreach ($key in $values.Keys) {
    $line = "$key=$($values[$key])"
    $hit = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^$key=") { $lines[$i] = $line; $hit = $true }
    }
    if (-not $hit) { $lines += $line }
  }
  [IO.File]::WriteAllLines($path, $lines)
}

if (-not (Test-Path "$root\backend\.env.dev")) { throw 'backend\.env.dev is missing.' }
if (-not (Test-Path $cloudflared)) { throw "cloudflared not found at $cloudflared (it comes with the Shopify CLI)." }

Write-Host 'Stopping old servers...' -ForegroundColor Cyan
Stop-Old
Start-Sleep -Seconds 2

# ── 1. Tunnel ────────────────────────────────────────────────────────────────
# A quick tunnel's address can be dropped by Cloudflare (sleep, network change: "Tunnel not found"),
# so the address is only used once it answers from the internet. Up to 3 tries.
function Start-Tunnel {
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'srb-dev-tunnel'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }
  Open-Window '3 Tunnel' $root "& '$cloudflared' tunnel --no-autoupdate --url http://localhost:3030 --logfile '$tunnelLog'"

  $url = $null
  $deadline = (Get-Date).AddSeconds(60)
  while (-not $url -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if (Test-Path $tunnelLog) {
      $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  if (-not $url) { return $null }

  # Live = the address resolves and Cloudflare answers (any HTTP status; the admin is not up yet).
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    $code = & curl.exe -s -o NUL -m 10 -w "%{http_code}" $url
    if ($code -and $code -ne '000') { return $url }
    Start-Sleep -Seconds 3
  }
  return $null
}

Write-Host 'Starting Cloudflare tunnel...' -ForegroundColor Cyan
$tunnelUrl = $null
for ($try = 1; $try -le 3 -and -not $tunnelUrl; $try++) {
  $tunnelUrl = Start-Tunnel
  if (-not $tunnelUrl) { Write-Host "  ..  tunnel not reachable yet, new tunnel (try $try of 3)" -ForegroundColor Yellow }
}
if (-not $tunnelUrl) { throw "Tunnel did not come up after 3 tries - check your internet connection and the '3 Tunnel' window." }
Write-Host "  OK  Tunnel: $tunnelUrl" -ForegroundColor Green

# ── 2. Settings ──────────────────────────────────────────────────────────────
Set-EnvLines "$root\backend\.env.dev" @{ BACKEND_URL = $tunnelUrl; FRONTEND_URL = $tunnelUrl }
Set-EnvLines "$root\frontend\.env.development.local" @{ NEXT_PUBLIC_BACKEND_URL = $tunnelUrl }

$toml = Get-Content "$root\shopify.app.dev.toml" -Raw
$toml = [regex]::Replace($toml, 'https://[a-z0-9.-]+\.(ngrok-free\.dev|trycloudflare\.com)', $tunnelUrl)
$toml = "# GENERATED by scripts/dev-start.ps1 from shopify.app.dev.toml - do not edit, do not commit.`r`n" + $toml
[IO.File]::WriteAllText("$root\shopify.app.devlocal.toml", $toml)

Write-Host 'Deploying the DEV app with the new address (about a minute)...' -ForegroundColor Cyan
Push-Location $root
# cmd /c: the CLI prints notes on stderr, which Windows PowerShell 5.1 would turn into an error.
# Success is judged only by the "New version released" line below.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $out = cmd /c "shopify app deploy --config devlocal --allow-updates 2>&1" | Out-String
} finally { $ErrorActionPreference = $prevEap; Pop-Location }
if ($out -notmatch 'New version released') {
  Write-Host $out
  throw 'Dev app deploy failed (see above).'
}
Write-Host '  OK  Dev app updated' -ForegroundColor Green

# ── 3. Servers ───────────────────────────────────────────────────────────────
Write-Host 'Starting backend and admin...' -ForegroundColor Cyan
Open-Window '1 Backend (dev)' "$root\backend"  'npm run dev:local'
Open-Window '2 Admin (dev)'   "$root\frontend" 'npm run dev'

$ok = (Wait-Port 4000 'Backend' 120) -and (Wait-Port 3030 'Admin' 120)
if (-not $ok) { exit 1 }

# End-to-end check: internet → tunnel → admin → backend (install route answers with a redirect).
$checkDeadline = (Get-Date).AddSeconds(90)
$installCode = '000'
while ((Get-Date) -lt $checkDeadline) {
  $installCode = & curl.exe -s -o NUL -m 15 -w "%{http_code}" "$tunnelUrl/api/auth/install?shop=$store"
  if ($installCode -eq '302') { break }
  Start-Sleep -Seconds 3
}
if ($installCode -eq '302') {
  Write-Host '  OK  Tunnel -> admin -> backend works' -ForegroundColor Green
} else {
  Write-Host "  !!  Install link answered $installCode (expected 302) - look at the '1 Backend (dev)' window." -ForegroundColor Red
}

Write-Host 'Removing any old dev preview (the released dev version is used instead)...' -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
Push-Location $root
try { $null = cmd /c "shopify app dev clean --config devlocal --store $store 2>&1" } finally { Pop-Location; $ErrorActionPreference = $prevEap }

Write-Host ''
Write-Host 'Ready. Keep the 3 windows open while you test (closing them stops the tunnel).' -ForegroundColor Green
Write-Host "  Install: $tunnelUrl/api/auth/install?shop=$store   (only if the Dev app is not installed)"
Write-Host "  App:     https://admin.shopify.com/store/$($store -replace '\.myshopify\.com$','')/apps/shopireachboost-ai-dev"
Write-Host "  Product: https://$store/products/the-multi-location-snowboard"
