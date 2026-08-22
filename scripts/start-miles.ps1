$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectDir ".data"
$logFile = Join-Path $logDir "miles-server.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$listening = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $listening) {
  $command = "npm.cmd run start >> `"$logFile`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", $command -WorkingDirectory $projectDir -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

$tailscale = Get-Command "tailscale.exe" -ErrorAction SilentlyContinue
if ($tailscale) {
  & $tailscale.Source serve --bg http://127.0.0.1:3000 | Out-Null
}

