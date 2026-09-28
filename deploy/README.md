# Deploy the private shared phone

Production target used by this repo:

- Frontend: `https://phone.meimeibw.cc`
- API: same-origin `/shared-api`
- API process: localhost `127.0.0.1:8791`
- Database: SQLite under `/var/www/xiaoci-phone/data`
- Media: `/var/www/xiaoci-phone/data/media`
- Authentication: Nginx Basic Auth around the entire site

Do **not** put a long-lived API secret in a `VITE_*` variable. Vite variables are shipped to the browser.

## Server packages

```bash
sudo apt update
sudo apt install -y nginx apache2-utils certbot python3-certbot-nginx git
```

Node.js 24+ is required because the server uses built-in `node:sqlite`.

## Checkout

```bash
sudo mkdir -p /var/www/xiaoci-phone
sudo chown -R "$USER":"$USER" /var/www/xiaoci-phone
git clone -b shared-phone-foundation https://github.com/ci-teacher/SullyOS.git /var/www/xiaoci-phone
cd /var/www/xiaoci-phone
corepack enable
pnpm install --frozen-lockfile
cp deploy/.env.production .env.production
pnpm build
```

## Shared server config

```bash
mkdir -p /var/www/xiaoci-phone/data/media
cp deploy/shared-server.env /var/www/xiaoci-phone/shared-server/.env
sudo chown -R www-data:www-data /var/www/xiaoci-phone/data
sudo chown www-data:www-data /var/www/xiaoci-phone/shared-server/.env
```

## Basic Auth

Choose a username and password. This example uses `xiaoci`:

```bash
sudo htpasswd -c /etc/nginx/.htpasswd-xiaoci-phone xiaoci
```

The same credentials can later be entered once in the ChatGPT Work cloud browser.

## Nginx + HTTPS

First make sure DNS for `phone.meimeibw.cc` points at the VPS.

For the first certificate issuance, use a temporary HTTP-only Nginx server or an existing certbot-compatible site, then:

```bash
sudo certbot --nginx -d phone.meimeibw.cc
```

Install `deploy/nginx-phone.conf` as the site config after the certificate exists:

```bash
sudo cp deploy/nginx-phone.conf /etc/nginx/sites-available/phone.meimeibw.cc
sudo ln -sf /etc/nginx/sites-available/phone.meimeibw.cc /etc/nginx/sites-enabled/phone.meimeibw.cc
sudo nginx -t
sudo systemctl reload nginx
```

## systemd

```bash
sudo cp deploy/xiaoci-phone-api.service /etc/systemd/system/
sudo cp deploy/xiaoci-phone-wake.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xiaoci-phone-api.service
sudo systemctl enable --now xiaoci-phone-wake.service
```

Check:

```bash
sudo systemctl status xiaoci-phone-api.service --no-pager
sudo systemctl status xiaoci-phone-wake.service --no-pager
curl -I http://127.0.0.1:8791/health
```

## Updating later

```bash
cd /var/www/xiaoci-phone
git pull
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart xiaoci-phone-api.service xiaoci-phone-wake.service
```
