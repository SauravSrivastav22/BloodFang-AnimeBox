#!/usr/bin/env bash
# Redeploy the BloodFang backend after you push new code to GitHub.
# Run on the VM:  bash deploy/update.sh
set -euo pipefail
APP_DIR="$HOME/BloodFang-AnimeBox"
cd "$APP_DIR"
echo "▶ Pulling latest…"
git pull --ff-only
echo "▶ Installing deps…"
npm install --omit=dev
echo "▶ Restarting API…"
pm2 restart bloodfang-api --update-env
pm2 save
echo "✓ Updated. Health:"
curl -s http://localhost:8080/api/health && echo
