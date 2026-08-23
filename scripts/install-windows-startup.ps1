$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$buildId = Join-Path $projectDir ".next\BUILD_ID"

if (-not (Test-Path $buildId)) {
  Write-Host "Building Miles for production..."
  Push-Location $projectDir
  try { & npm.cmd run build } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "Miles could not be built." }
}

$startup = [Environment]::GetFolderPath("Startup")
$launcher = Join-Path $startup "Miles.cmd"
$script = Join-Path $PSScriptRoot "start-miles.ps1"
$line = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"`r`n"
[IO.File]::WriteAllText($launcher, $line)

if (-not (Test-Path $launcher)) { throw "The startup launcher could not be written to $startup" }

Write-Host "Miles will now start when you sign into Windows."
Write-Host "Startup launcher: $launcher"
Write-Host ""
Write-Host "Windows holds startup items back for about half a minute after you sign"
Write-Host "in, so give it a moment before deciding it has not worked."
Write-Host "If it ever does not appear, run:  npm run startup:status"

