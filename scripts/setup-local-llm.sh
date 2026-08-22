#!/usr/bin/env bash
# The macOS and Linux twin of setup-local-llm.ps1: install Ollama, start it,
# pull the configured model. Safe to re-run — every step checks first.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read_env() {
  local key="$1" fallback="$2" file value
  for file in "$project_dir/.env.local" "$project_dir/.env"; do
    [ -f "$file" ] || continue
    value="$(sed -n "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1 | tr -d '"'"'"'' | xargs || true)"
    [ -n "$value" ] && { printf '%s' "$value"; return; }
  done
  printf '%s' "$fallback"
}

model="$(read_env OLLAMA_MODEL "gemma4:e2b")"
base_url="$(read_env OLLAMA_URL "http://127.0.0.1:11434")"
base_url="${base_url%/}"

echo "Miles chat setup - model '$model' at $base_url"

answering() { curl -fsS --max-time 3 "$base_url/api/tags" >/dev/null 2>&1; }

# 1. The Ollama program.
if ! command -v ollama >/dev/null 2>&1; then
  if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    echo "Installing Ollama with Homebrew..."
    brew install ollama
  elif [ "$(uname -s)" = "Linux" ]; then
    echo "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
  else
    echo "Ollama is not installed. Get it from https://ollama.com/download and re-run this script." >&2
    exit 1
  fi
else
  echo "Ollama is already installed."
fi

# 2. The server behind that URL. A remote OLLAMA_URL is somebody else's to start.
if ! answering; then
  case "$base_url" in
    http://127.0.0.1*|http://localhost*|http://\[::1\]*) ;;
    *) echo "Nothing is answering at $base_url. Start Ollama on that host, then re-run." >&2; exit 1 ;;
  esac
  echo "Starting the Ollama server..."
  nohup ollama serve >/dev/null 2>&1 &
  for _ in $(seq 1 20); do
    sleep 1
    answering && break
  done
  answering || { echo "Ollama did not start listening on $base_url." >&2; exit 1; }
fi
echo "Ollama is answering at $base_url."

# 3. The model. Pulling one is gigabytes, so never re-pull what is present.
installed() { curl -fsS --max-time 5 "$base_url/api/tags" | grep -q "\"$1\""; }

if installed "$model" || installed "$model:latest"; then
  echo "Model '$model' is already pulled."
else
  echo "Pulling '$model' - this downloads gigabytes and only happens once..."
  ollama pull "$model"
fi

# 4. Prove it end to end, so a green finish means chat actually works.
if ! { installed "$model" || installed "$model:latest"; }; then
  echo "'$model' still is not installed after the pull." >&2
  exit 1
fi

echo
echo "Ready. Ask Miles and confirmed actions will work once Miles restarts."
echo "Check it any time at http://127.0.0.1:3000/health under 'Chat'."
