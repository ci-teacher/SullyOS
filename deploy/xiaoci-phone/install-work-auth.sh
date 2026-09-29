#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/xiaoci-phone"
AUTH_ENV="/etc/xiaoci-phone-auth.env"
HTPASSWD="/etc/nginx/.htpasswd-xiaoci-phone"
SITE_AVAILABLE="/etc/nginx/sites-available/phone.meimeibw.cc"
SITE_ENABLED="/etc/nginx/sites-enabled/phone.meimeibw.cc"
SERVICE="/etc/systemd/system/xiaoci-phone-auth.service"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${SITE_AVAILABLE}.bak-${STAMP}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

for command in node openssl nginx systemctl curl; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Missing command: ${command}"
    exit 1
  }
done

if [[ ! -f "${ROOT}/deploy/xiaoci-phone/auth-server.mjs" ]]; then
  echo "Run this script from a checkout installed at ${ROOT}."
  exit 1
fi

if [[ ! -f "${HTPASSWD}" ]]; then
  echo "Missing existing htpasswd file: ${HTPASSWD}"
  exit 1
fi

if ! grep -q '^xiaoci:' "${HTPASSWD}"; then
  echo "User xiaoci was not found in ${HTPASSWD}."
  exit 1
fi

if ! nginx -V 2>&1 | grep -q -- '--with-http_auth_request_module'; then
  echo "This nginx build does not include http_auth_request_module."
  exit 1
fi

chgrp www-data "${HTPASSWD}"
chmod 640 "${HTPASSWD}"

if [[ ! -f "${AUTH_ENV}" ]]; then
  SECRET="$(openssl rand -hex 32)"
  cat > "${AUTH_ENV}" <<EOF
AUTH_HOST=127.0.0.1
AUTH_PORT=8792
AUTH_USER=xiaoci
HTPASSWD_FILE=${HTPASSWD}
AUTH_SESSION_SECRET=${SECRET}
AUTH_COOKIE_MAX_AGE=2592000
EOF
  chmod 640 "${AUTH_ENV}"
  chown root:www-data "${AUTH_ENV}"
fi

install -m 0644 \
  "${ROOT}/deploy/xiaoci-phone/xiaoci-phone-auth.service" \
  "${SERVICE}"

systemctl daemon-reload
systemctl enable --now xiaoci-phone-auth.service

if ! curl -fsS http://127.0.0.1:8792/health >/dev/null; then
  echo "Auth service health check failed."
  systemctl status xiaoci-phone-auth.service --no-pager -l || true
  exit 1
fi

cp "${SITE_AVAILABLE}" "${BACKUP}"
cp "${ROOT}/deploy/xiaoci-phone/nginx-phone.conf" "${SITE_AVAILABLE}"

if [[ ! -e "${SITE_ENABLED}" ]]; then
  ln -s "${SITE_AVAILABLE}" "${SITE_ENABLED}"
fi

if ! nginx -t; then
  echo "nginx config check failed; restoring ${BACKUP}"
  cp "${BACKUP}" "${SITE_AVAILABLE}"
  nginx -t
  exit 1
fi

systemctl reload nginx

echo
echo "Installed."
echo "Backup: ${BACKUP}"
echo "Open: https://phone.meimeibw.cc/teacher"
echo "Login user: xiaoci"
echo "Password: your existing Basic Auth password"
