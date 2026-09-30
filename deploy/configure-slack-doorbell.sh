#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/xiaoci-phone"
ENV_FILE="$ROOT/shared-server/.env"
WAKE_SERVICE="xiaoci-phone-wake.service"
PHONE_URL="https://phone.meimeibw.cc/teacher"

if [[ ${EUID} -ne 0 ]]; then
  echo "Please run this script as root."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

read -r -s -p "Paste Slack incoming webhook URL: " SLACK_URL
echo

if [[ "$SLACK_URL" != https://hooks.slack.com/services/* ]]; then
  echo "That does not look like a Slack incoming webhook URL."
  exit 1
fi

SLACK_WAKE_WEBHOOK_URL="$SLACK_URL" PHONE_URL="$PHONE_URL" python3 - "$ENV_FILE" <<'PY'
import os, sys
path = sys.argv[1]
updates = {
    "SLACK_WAKE_WEBHOOK_URL": os.environ["SLACK_WAKE_WEBHOOK_URL"],
    "WAKE_PHONE_URL": os.environ["PHONE_URL"],
}
with open(path, "r", encoding="utf-8") as fh:
    lines = fh.read().splitlines()
seen = set()
out = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line else None
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
with open(path, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")
PY

unset SLACK_URL
chown root:www-data "$ENV_FILE"
chmod 640 "$ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

curl -fsS "http://127.0.0.1:${PORT:-8791}/health" >/dev/null

TEST_ID="slack-doorbell-test-$(date +%s)"
NOW_MS="$(date +%s%3N)"
EXPIRES_AT="$((NOW_MS + 30 * 60 * 1000))"

AUTH_ARGS=()
if [[ -n "${SHARED_PHONE_TOKEN:-}" ]]; then
  AUTH_ARGS=(-H "Authorization: Bearer ${SHARED_PHONE_TOKEN}")
fi

curl -fsS -X POST "http://127.0.0.1:${PORT:-8791}/v1/wake" \
  "${AUTH_ARGS[@]}" \
  -H 'Content-Type: application/json' \
  --data-binary @- >/dev/null <<JSON
{"id":"$TEST_ID","reason":"doorbell_test","priority":99,"payload":{"source":"configure-slack-doorbell","message":"End-to-end Slack doorbell test"},"expiresAt":$EXPIRES_AT,"dedupeKey":"$TEST_ID"}
JSON

systemctl restart "$WAKE_SERVICE"

echo
echo "Slack doorbell configured."
echo "Created test WakeSignal: $TEST_ID"
echo "Wake service: $(systemctl is-active "$WAKE_SERVICE")"
echo
journalctl -u "$WAKE_SERVICE" -n 12 --no-pager
