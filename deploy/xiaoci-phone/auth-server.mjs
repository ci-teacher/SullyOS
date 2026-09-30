import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const HOST = process.env.AUTH_HOST || '127.0.0.1';
const PORT = Number(process.env.AUTH_PORT || 8792);
const AUTH_USER = String(process.env.AUTH_USER || 'xiaoci').trim();
const HTPASSWD_FILE = String(process.env.HTPASSWD_FILE || '/etc/nginx/.htpasswd-xiaoci-phone').trim();
const SESSION_SECRET = String(process.env.AUTH_SESSION_SECRET || '').trim();
const COOKIE_NAME = 'xiaoci_phone_auth';
const COOKIE_MAX_AGE = Number(process.env.AUTH_COOKIE_MAX_AGE || 2592000);

if (!SESSION_SECRET) {
  console.error('AUTH_SESSION_SECRET is required');
  process.exit(1);
}
if (!fs.existsSync(HTPASSWD_FILE)) {
  console.error('htpasswd file not found: ' + HTPASSWD_FILE);
  process.exit(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeNext(value) {
  const next = String(value || '/teacher');
  if (!next.startsWith('/') || next.startsWith('//')) return '/teacher';
  if (next.startsWith('/login') || next.startsWith('/logout') || next.startsWith('/_auth_check')) return '/teacher';
  return next;
}

function sessionToken() {
  return createHmac('sha256', SESSION_SECRET)
    .update('xiaoci-phone:' + AUTH_USER)
    .digest('base64url');
}

function getCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return part.slice(index + 1).trim();
  }
  return '';
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function isAuthorized(req) {
  return secureEqual(getCookie(req, COOKIE_NAME), sessionToken());
}

function readApr1() {
  const lines = fs.readFileSync(HTPASSWD_FILE, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const username = line.slice(0, separator);
    const hash = line.slice(separator + 1);
    if (username !== AUTH_USER) continue;
    const match = hash.match(/^\$apr1\$([^$]+)\$/);
    if (!match) throw new Error('Only Apache APR1 htpasswd hashes are supported');
    return { hash, salt: match[1] };
  }
  throw new Error('user not found in htpasswd file');
}

function verifyPassword(password) {
  try {
    const entry = readApr1();
    const result = spawnSync(
      '/usr/bin/openssl',
      ['passwd', '-apr1', '-salt', entry.salt, '-stdin'],
      { input: String(password || ''), encoding: 'utf8', timeout: 5000 }
    );
    if (result.status !== 0) return false;
    return secureEqual(String(result.stdout || '').trim(), entry.hash);
  } catch (error) {
    console.error('password verification failed:', error);
    return false;
  }
}

function renderLogin(res, next, failed) {
  const error = failed ? '<div class="error">用户名或密码不正确。</div>' : '';
  const html = [
    '<!doctype html>',
    '<html lang="zh-CN"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">',
    '<title>Teacher Login</title>',
    '<style>',
    '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f7f4f2;color:#241d1d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '.card{width:min(390px,100%);padding:30px;border:1px solid #eadfda;border-radius:24px;background:#fff;box-shadow:0 18px 60px rgba(77,30,34,.08)}',
    'h1{margin:0 0 8px;font-size:26px}p{margin:0 0 24px;color:#7b6e6e;font-size:14px}label{display:block;margin:14px 0 7px;font-size:13px;font-weight:700}',
    'input{width:100%;border:1px solid #ded2cd;border-radius:13px;padding:12px 14px;font:inherit;outline:none}input:focus{border-color:#c92f42}',
    'button{width:100%;margin-top:22px;border:0;border-radius:13px;padding:13px 16px;background:#c92f42;color:#fff;font:inherit;font-weight:800;cursor:pointer}',
    '.error{margin:0 0 12px;color:#b42318;font-size:13px}',
    '</style></head><body><main class="card">',
    '<h1>Teacher Login</h1><p>进入小词的私人小手机。</p>',
    error,
    '<form method="post" action="/login">',
    '<input type="hidden" name="next" value="' + escapeHtml(next) + '">',
    '<label for="username">用户名</label>',
    '<input id="username" name="username" autocomplete="username" value="' + escapeHtml(AUTH_USER) + '" required>',
    '<label for="password">密码</label>',
    '<input id="password" name="password" type="password" autocomplete="current-password" required>',
    '<button type="submit">进入 Teacher Home</button>',
    '</form></main></body></html>'
  ].join('');

  res.writeHead(failed ? 401 : 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
  });
  res.end(html);
}

function setSessionCookie(res, next) {
  res.writeHead(303, {
    Location: next,
    'Set-Cookie': COOKIE_NAME + '=' + sessionToken() + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + COOKIE_MAX_AGE,
    'Cache-Control': 'no-store'
  });
  res.end();
}

function clearSessionCookie(res) {
  res.writeHead(303, {
    Location: '/login',
    'Set-Cookie': COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'Cache-Control': 'no-store'
  });
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && url.pathname === '/check') {
    res.writeHead(isAuthorized(req) ? 204 : 401, { 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/login') {
    const next = safeNext(url.searchParams.get('next'));
    if (isAuthorized(req)) {
      res.writeHead(302, { Location: next, 'Cache-Control': 'no-store' });
      return res.end();
    }
    return renderLogin(res, next, false);
  }

  if (req.method === 'POST' && url.pathname === '/login') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 8192) req.destroy();
    });
    req.on('end', () => {
      const form = new URLSearchParams(body);
      const username = String(form.get('username') || '');
      const password = String(form.get('password') || '');
      const next = safeNext(form.get('next'));
      if (username !== AUTH_USER || !verifyPassword(password)) return renderLogin(res, next, true);
      return setSessionCookie(res, next);
    });
    return;
  }

  if (url.pathname === '/logout') return clearSessionCookie(res);

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log('xiaoci phone auth listening on http://' + HOST + ':' + PORT);
});
