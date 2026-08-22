$startup = [Environment]::GetFolderPath("Startup")
$launcher = Join-Path $startup "Miles.cmd"
if (Test-Path $launcher) { Remove-Item -LiteralPath $launcher -Force }
Write-Host "Miles was removed from Windows startup."

