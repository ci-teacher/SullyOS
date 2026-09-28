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
