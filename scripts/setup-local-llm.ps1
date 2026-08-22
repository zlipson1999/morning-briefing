$ErrorActionPreference = "Stop"

# Everything Miles needs for private chat that npm cannot install: Ollama
# itself, and the model it serves. Safe to re-run — each step checks first and
# does nothing when it is already done.

$projectDir = Split-Path -Parent $PSScriptRoot

function Read-EnvValue([string]$key, [string]$fallback) {
  foreach ($file in @(".env.local", ".env")) {
    $path = Join-Path $projectDir $file
    if (-not (Test-Path $path)) { continue }
    foreach ($line in Get-Content $path) {
      if ($line -match "^\s*$key\s*=\s*(.+?)\s*$") {
        return $Matches[1].Trim('"').Trim("'")
      }
    }
  }
  return $fallback
}

# Match what the app will actually ask for at runtime.
$model = Read-EnvValue "OLLAMA_MODEL" "gemma4:e2b"
$baseUrl = (Read-EnvValue "OLLAMA_URL" "http://127.0.0.1:11434").TrimEnd("/")

Write-Host "Miles chat setup - model '$model' at $baseUrl"

function Test-Ollama {
  try {
    Invoke-RestMethod -Uri "$baseUrl/api/tags" -TimeoutSec 3 -ErrorAction Stop | Out-Null
    return $true
  } catch {
    return $false
  }
}

# 1. The Ollama program.
$ollama = Get-Command "ollama" -ErrorAction SilentlyContinue
if (-not $ollama) {
  if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
    throw "Ollama is not installed and winget is unavailable. Install it from https://ollama.com/download and re-run this script."
  }
  Write-Host "Installing Ollama with winget..."
  & winget install --id Ollama.Ollama --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget could not install Ollama (exit $LASTEXITCODE)." }

  # winget updates the machine PATH, not this already-running shell.
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
  $ollama = Get-Command "ollama" -ErrorAction SilentlyContinue
  if (-not $ollama) { throw "Ollama installed, but is not on PATH yet. Open a new terminal and re-run this script." }
} else {
  Write-Host "Ollama is already installed."
}

# 2. The server behind that URL. A remote OLLAMA_URL is somebody else's to start.
$isLocal = $baseUrl -match "^https?://(127\.0\.0\.1|localhost|\[::1\])(:|/|$)"
if (-not (Test-Ollama)) {
  if (-not $isLocal) { throw "Nothing is answering at $baseUrl. Start Ollama on that host, then re-run." }
  Write-Host "Starting the Ollama server..."
  Start-Process -FilePath $ollama.Source -ArgumentList "serve" -WindowStyle Hidden
  foreach ($attempt in 1..20) {
    Start-Sleep -Seconds 1
    if (Test-Ollama) { break }
  }
  if (-not (Test-Ollama)) { throw "Ollama did not start listening on $baseUrl." }
}
Write-Host "Ollama is answering at $baseUrl."

# 3. The model. Pulling one is gigabytes, so never re-pull what is present.
$tags = Invoke-RestMethod -Uri "$baseUrl/api/tags" -TimeoutSec 5
$present = @($tags.models | ForEach-Object { $_.name }) -contains $model -or
           @($tags.models | ForEach-Object { $_.name }) -contains "${model}:latest"
if ($present) {
  Write-Host "Model '$model' is already pulled."
} else {
  Write-Host "Pulling '$model' - this downloads gigabytes and only happens once..."
  & $ollama.Source pull $model
  if ($LASTEXITCODE -ne 0) { throw "Could not pull '$model'. Check the name at https://ollama.com/library" }
}

# 4. Prove it end to end, so a green finish means chat actually works.
$verify = Invoke-RestMethod -Uri "$baseUrl/api/tags" -TimeoutSec 5
$names = @($verify.models | ForEach-Object { $_.name })
if (-not ($names -contains $model -or $names -contains "${model}:latest")) {
  throw "'$model' still is not installed after the pull. Installed: $($names -join ', ')"
}

Write-Host ""
Write-Host "Ready. Ask Miles and confirmed actions will work once Miles restarts."
Write-Host "Check it any time at http://127.0.0.1:3000/health under 'Chat'."
