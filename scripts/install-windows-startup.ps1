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
Write-Host "Miles will now start when you sign into Windows."
Write-Host "Startup launcher: $launcher"

