#!/usr/bin/env bash
# One-time setup of the textsiegel server on a VPS (idempotent, can be run repeatedly).
# Afterwards everything runs through GitHub: Actions builds the image, a systemd timer pulls it every 5 minutes.
#
#   sudo bash deploy/install.sh [service-url]
#
# Creates /opt/textsiegel (compose.yml, textsiegel.env, data/), an Ed25519 key and the systemd timer.
# Exposing the service (tailscale serve, funnel or a reverse proxy) is a separate step, see README.
set -euo pipefail

DIR=/opt/textsiegel
SRC="$(cd "$(dirname "$0")" && pwd)"
CONTAINER_UID=1000 # user "node" in the image
SERVICE_URL="${1:-}"

install -d -m 755 "$DIR" "$DIR/data"
install -d -m 750 "$DIR/data/records"
install -m 644 "$SRC/compose.yml" "$DIR/compose.yml"

if [ ! -f "$DIR/textsiegel.env" ]; then
  install -m 600 "$SRC/textsiegel.env.example" "$DIR/textsiegel.env"
  sed -i "s|^MARK_KEY=.*|MARK_KEY=$(openssl rand -hex 32)|" "$DIR/textsiegel.env"
  echo "textsiegel.env created. MARK_KEY must be the key your chatbot marks with – adjust if needed: $DIR/textsiegel.env"
fi
if [ -n "$SERVICE_URL" ]; then
  sed -i "s|^SERVICE_URL=.*|SERVICE_URL=$SERVICE_URL|" "$DIR/textsiegel.env"
fi

if [ ! -f "$DIR/data/textsiegel-ed25519.pem" ]; then
  openssl genpkey -algorithm ed25519 -out "$DIR/data/textsiegel-ed25519.pem"
  echo "Ed25519 key created: $DIR/data/textsiegel-ed25519.pem (back it up, never commit it)"
fi
chown -R "$CONTAINER_UID:$CONTAINER_UID" "$DIR/data"
chmod 600 "$DIR/data/textsiegel-ed25519.pem"

install -m 644 "$SRC/textsiegel-update.service" /etc/systemd/system/textsiegel-update.service
install -m 644 "$SRC/textsiegel-update.timer" /etc/systemd/system/textsiegel-update.timer
systemctl daemon-reload
systemctl enable --now textsiegel-update.timer
systemctl start textsiegel-update.service

echo "Done. The service listens on 127.0.0.1:8790. Check: curl -s http://127.0.0.1:8790/.well-known/textsiegel-keys.json"
