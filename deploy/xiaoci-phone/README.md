# Xiaoci Phone · ChatGPT Work login

This deployment layer replaces the browser-native HTTP Basic Auth challenge with a normal HTML login form backed by the same existing htpasswd credential.

It keeps the site private and lets browser automation sessions authenticate with a secure HttpOnly cookie.

## What it changes

- Starts a localhost-only auth service on `127.0.0.1:8792`.
- Reuses `/etc/nginx/.htpasswd-xiaoci-phone`; no password is stored in Git.
- Generates a random session signing secret in `/etc/xiaoci-phone-auth.env`.
- Uses nginx `auth_request` for the SPA and `/shared-api/`.
- Keeps the existing shared API on `127.0.0.1:8791`.
- Redirects unauthenticated browser requests to `/login`.
- Returns JSON 401 for unauthenticated API requests.

## Deploy on the VPS

From the checkout at `/var/www/xiaoci-phone`:

```bash
git fetch origin
git checkout fix/chatgpt-work-auth
git pull --ff-only
sudo bash deploy/xiaoci-phone/install-work-auth.sh
```

Then open `https://phone.meimeibw.cc/teacher` and use the existing username `xiaoci` with the same password that was used for HTTP Basic Auth.

## Rollback

The installer prints the nginx backup path it creates. Restore that file, run `nginx -t`, reload nginx, then disable `xiaoci-phone-auth.service`.
