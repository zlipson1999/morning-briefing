$projectDir = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $projectDir ".data\miles-server.log"
$launcher = Join-Path ([Environment]::GetFolderPath("Startup")) "Miles.cmd"

# Why Miles is not there when you sign in is one of four things, and this says
# which in one screen rather than leaving you to guess at it.

Write-Host ""
Write-Host "Startup launcher : " -NoNewline
if (Test-Path $launcher) {
  Write-Host "installed"
  Write-Host "                   $launcher"
} else {
  Write-Host "MISSING - nothing will start at sign-in. Fix: npm run startup:install"
}

Write-Host "Production build : " -NoNewline
if (Test-Path (Join-Path $projectDir ".next\BUILD_ID")) {
  Write-Host "present"
} else {
  Write-Host "MISSING - 'npm run start' cannot run. Fix: npm run build"
}

Write-Host "Answering now    : " -NoNewline
try {
  $client = New-Object Net.Sockets.TcpClient
  $client.Connect("127.0.0.1", 3000)
  $client.Close()
  Write-Host "yes - http://127.0.0.1:3000"
} catch {
  Write-Host "no - nothing is listening on port 3000"
}

Write-Host ""
if (Test-Path $logFile) {
  Write-Host "Last 20 lines of $logFile"
  Write-Host "----------------------------------------------------------------"
  Get-Content -Path $logFile -Tail 20
} else {
  Write-Host "No log at $logFile - the launcher has never run."
  Write-Host "Run it by hand to watch it work: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-miles.ps1"
}
Write-Host ""
