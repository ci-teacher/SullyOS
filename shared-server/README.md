# Shared Phone server

Private shared-data service for the Xiaoci / Laoshi phone.

## Requirements

- Node.js 24+ (uses the built-in `node:sqlite` module)
- No model API key is used.

## Run locally

```bash
SHARED_PHONE_TOKEN=dev-secret node shared-server/server.mjs
```

Health check:

```text
GET http://127.0.0.1:8787/health
```

## Current endpoints

- `GET /health`
- `GET /v1/diaries?charId=...`
- `PUT /v1/diaries/:id`
- `DELETE /v1/diaries/:id`
- `GET /v1/activity`
- `POST /v1/activity`
- `GET /v1/teacher/home`
- `GET /v1/wake/next`
- `POST /v1/wake`
- `POST /v1/wake/:id/consume`

All endpoints accept `Authorization: Bearer <SHARED_PHONE_TOKEN>` when a token is configured.

The Vite frontend enables remote sync only when `VITE_SHARED_API_BASE` is set. Without it, SullyOS remains fully local and the shared adapter falls back to IndexedDB.


## Slack doorbell

The Wake Engine can post pending WakeSignals to a Slack channel through a Slack app Incoming Webhook.

Keep the webhook URL only in `shared-server/.env` on the VPS:

```bash
SLACK_WAKE_WEBHOOK_URL=https://hooks.slack.com/services/...
WAKE_PHONE_URL=https://phone.meimeibw.cc/teacher
```

On the production VPS, run:

```bash
sudo bash deploy/configure-slack-doorbell.sh
```

The setup script prompts for the webhook without echoing it, writes it to the private env file, creates a high-priority
`doorbell_test` WakeSignal, and restarts the Wake Engine so the test signal is delivered immediately.

## Gmail / Resend wake delivery

On the deployed server, set `WAKE_DELIVERY_MODE=resend`,
`RESEND_API_KEY`, `RESEND_WAKE_FROM`, and `RESEND_WAKE_TO`
in the private environment. The fallback `WAKE_DELIVERY_MODE=slack`
keeps the original webhook behavior. Never commit credentials.

- Newly updated exchange diaries by `xiaoci` may generate a
  `new_diary` wake signal (priority 86), subject to normal cooldown,
  quiet hours, pending signals, and baseline logic.
- Wake email carries signal metadata but no private diary body.
- `POST /v1/wake/claim?signal=<UUID>` claims the specified pending
  signal; invalid UUID returns 400 and unavailable signals return 409.
- `POST /v1/wake/:id/consume` returns 409 for already handled signals.

### Safe deployment note

The production checkout may contain local changes to `shared-server/server.mjs`
and `shared-server/wake-engine.mjs` made during manual debugging. Before
deploying, reconcile those local changes with this branch. Do not overwrite
production copies, secrets or the SQLite database, and avoid `git reset --hard`.
