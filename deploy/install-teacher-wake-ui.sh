#!/usr/bin/env bash
# Install just the exact-ID Teacher Home wake UI on an existing Xiaoci Phone VPS.
# Intentionally avoids git pull/reset, worker rebuilds, shared-server files,
# database, private env files, and systemd restarts.
set -euo pipefail

cd /var/www/xiaoci-phone
file_a=components/shared/TeacherHomeGate.tsx
file_b=utils/shared/wake.ts

if ! command -v pnpm >/dev/null 2>&1; then
  echo "STOP: pnpm unavailable. No files changed."
  exit 1
fi
if [ ! -f dist/index.html ]; then
  echo "STOP: deployed dist/index.html not found. No files changed."
  exit 1
fi
if [ -n "$(git status --porcelain -- "$file_a" "$file_b")" ]; then
  echo "STOP: target frontend source files have local edits. No files changed."
  exit 1
fi

for file in "$file_a" "$file_b"; do
  git cat-file -e "FETCH_HEAD:$file" || { echo "STOP: $file absent from FETCH_HEAD"; exit 1; }
done

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_a="$file_a.bak.wakeui-$stamp"
backup_b="$file_b.bak.wakeui-$stamp"
stage="$(mktemp -d /tmp/xiaoci-wake-ui.XXXXXXXX)"
built=0
install_started=0

rollback() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "ERROR: installation halted (exit $status); restoring original UI source."
    if [ -f "$backup_a" ]; then cp -p "$backup_a" "$file_a"; fi
    if [ -f "$backup_b" ]; then cp -p "$backup_b" "$file_b"; fi
    if [ "$install_started" -eq 1 ] && [ -f "$stage/index.old.html" ]; then
      cp -p "$stage/index.old.html" dist/index.html
      echo "Restored previous dist/index.html."
    fi
  fi
  rm -rf "$stage"
  exit "$status"
}
trap rollback EXIT

cp -p "$file_a" "$backup_a"
cp -p "$file_b" "$backup_b"
cp -p dist/index.html "$stage/index.old.html"

git show "FETCH_HEAD:$file_a" > "$stage/TeacherHomeGate.tsx"
git show "FETCH_HEAD:$file_b" > "$stage/wake.ts"

if ! grep -q 'id="wake-by-id"' "$stage/TeacherHomeGate.tsx" || \
   ! grep -q 'claimWakeSignal(id)' "$stage/TeacherHomeGate.tsx" || \
   ! grep -q 'claim?signal=' "$stage/wake.ts"; then
  echo "STOP: fetched code is missing exact-ID controls."
  exit 1
fi
if grep -q 'claimWakeSignal()' "$stage/TeacherHomeGate.tsx"; then
  echo "STOP: unsafe automatic claim still present."
  exit 1
fi

cp "$stage/TeacherHomeGate.tsx" "$file_a"
cp "$stage/wake.ts" "$file_b"
echo "Building the updated frontend (existing service and database remain untouched)..."
pnpm exec vite build --outDir "$stage/dist" --emptyOutDir

if [ ! -s "$stage/dist/index.html" ]; then
  echo "STOP: Vite build did not produce a valid index.html."
  exit 1
fi
built=1
echo "Build succeeded. Installing static assets, then index.html last."
install_started=1

# Copy assets first so clients never load an index referencing missing bundles.
for item in "$stage"/dist/*; do
  [ -e "$item" ] || continue
  if [ "$(basename "$item")" = "index.html" ]; then continue; fi
  cp -a "$item" dist/
done
cp -p "$stage/dist/index.html" dist/index.html
install_started=0

echo "SUCCESS: exact-ID Teacher Home UI installed."
echo "Backups:"
echo "  $backup_a"
echo "  $backup_b"
echo "  $stage/index.old.html (removed with staging dir)"
echo "Existing shared-server code, SQLite, env, worker source, and services left intact."
