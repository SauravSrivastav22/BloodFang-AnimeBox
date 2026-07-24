#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BloodFang streaming backend — one-shot server bootstrap for Ubuntu (Oracle
# Cloud "Always Free" ARM VM). Safe to re-run: it skips what's already installed.
#
# Run it on the VM after SSH-ing in:
#     curl -fsSL https://raw.githubusercontent.com/SauravSrivastav22/BloodFang-AnimeBox/main/deploy/setup.sh | bash
# ...or, if you cloned the repo first:
#     bash deploy/setup.sh
#
# What it does:
#   1. Installs Node 22, git, pm2, Caddy
#   2. Clones (or updates) the repo
#   3. Installs backend deps
#   4. Starts the API under pm2 on port 8080 and enables boot-start
# HTTPS (Caddy) and the firewall are finished in ORACLE_SETUP.md Parts 2 & 5.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="https://github.com/SauravSrivastav22/BloodFang-AnimeBox.git"
APP_DIR="$HOME/BloodFang-AnimeBox"

log() { printf '\n\033[1;35m▶ %s\033[0m\n' "$1"; }

log "1/5  System packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates gnupg

log "2/5  Node.js 22"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

log "3/5  pm2 + Caddy"
sudo npm install -g pm2
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

log "4/5  Clone / update the repo"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
npm install --omit=dev

log "5/5  Start the API under pm2"
pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save
# Make pm2 (and the API) come back automatically after a reboot.
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | bash || true
pm2 save

log "DONE. The API is running on http://localhost:8080"
echo "Test locally on the VM:  curl -s http://localhost:8080/api/health"
echo "Next: open the firewall (Part 2) and set up HTTPS with Caddy (Part 5)."
