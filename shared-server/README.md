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
- `POST /v1/wake/claim` (legacy: claims highest-priority pending signal)
- `POST /v1/wake/claim?signal=<UUID>` (exact-ID claim; 400 for bad ID, 409 if unavailable)
- `POST /v1/wake`
- `POST /v1/wake/:id/consume` (409 if already resolved/missing)
- `POST /v1/wake/:id/fail`

All endpoints accept `Authorization: Bearer <SHARED_PHONE_TOKEN>` when a token is configured.

The Vite frontend enables remote sync only when `VITE_SHARED_API_BASE` is set. Without it, SullyOS remains fully local and the shared adapter falls back to IndexedDB.

## Wake engine delivery and diary updates

The wake engine reads the shared SQLite database. A saved exchange diary
(`diaries.updated_by='xiaoci'`, `deleted=0`) can generate the
`new_diary` signal after the normal quiet-hours, pending-signal and
cooldown checks. Its signal payload contains the diary ID, character ID,
date and update time; diary content is read separately from Teacher Home
after authenticating. To avoid duplicate notices, diary saves are excluded
from generic `new_xiaoci_activity` detection.

- `WAKE_DELIVERY_MODE=resend` delivers the doorbell through Resend.
  Configure `RESEND_API_KEY`, `RESEND_WAKE_FROM` and `RESEND_WAKE_TO`
  in the server environment (never commit secrets).
- `WAKE_DELIVERY_MODE=slack` keeps the original Slack webhook option.
- `WAKE_PHONE_URL` defaults to `https://phone.meimeibw.cc/teacher`.
- The wake engine keeps its normal 15-minute polling cycle and does not
  bypass existing cooldown or duplicate-signal protections.

GitHub commits do not update a running server or generate a wake signal
in the production SQLite database. Review and reconcile the deployed
checkout and environment configuration before deploying this branch.
