$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectDir ".data"
$logFile = Join-Path $logDir "miles-server.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# This runs hidden at sign-in, so anything it fails to write down is lost. It
# used to log only npm's output, which meant a launcher that died before
# reaching npm — a slow cmdlet, a path it could not write — left no window, no
# message and no log line: Miles simply was not there, with nothing to read.
# Every step now says what it did, and the failure says what stopped it.
function Write-Log([string]$message) {
  Add-Content -Path $logFile -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message)
}

# A plain socket probe: immediate when nothing is listening, and without
# Test-NetConnection's habit of taking seconds or writing to the error stream,
# which under "Stop" was itself enough to kill the launcher.
function Test-Miles {
  try {
    $client = New-Object Net.Sockets.TcpClient
    $client.Connect("127.0.0.1", 3000)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

try {
  Write-Log "launcher: signed in, checking Miles"

  if (Test-Miles) {
    Write-Log "launcher: already listening on 3000, leaving it alone"
  } else {
    if (-not (Test-Path (Join-Path $projectDir ".next\BUILD_ID"))) {
      Write-Log "launcher: no production build found - run 'npm run build' once, then sign in again"
    }

    Write-Log "launcher: starting the server"
    $command = "npm.cmd run start >> `"$logFile`" 2>&1"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", $command -WorkingDirectory $projectDir -WindowStyle Hidden

    $up = $false
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      if (Test-Miles) { $up = $true; break }
    }

    if ($up) {
      Write-Log "launcher: Miles is answering on http://127.0.0.1:3000"
    } else {
      Write-Log "launcher: Miles did not answer within 30s - npm's own output above is the reason"
    }
  }

  $tailscale = Get-Command "tailscale.exe" -ErrorAction SilentlyContinue
  if ($tailscale) {
    & $tailscale.Source serve --bg http://127.0.0.1:3000 2>&1 | Out-Null
    Write-Log "launcher: refreshed the Tailscale Serve proxy"
  } else {
    Write-Log "launcher: Tailscale not installed, so no private HTTPS address - localhost still works"
  }
} catch {
  Write-Log ("launcher: FAILED - " + $_.Exception.Message)
  exit 1
}
