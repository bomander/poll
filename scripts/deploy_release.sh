#!/usr/bin/env bash
# Robust, steg-för-steg deploy för Laravel-app i undermapp (boma.nu/enkat)
# Körs lokalt från projektroten. Kräver ssh/rsync till servern.

set -euo pipefail

########################################
# Konfiguration (anpassa vid behov)
########################################
SSH_HOST=${SSH_HOST:-"hostup"}
APP_PATH=${APP_PATH:-"/home/nrnqv/apps/enkat"}           # rot för releases/current/shared
WEB_ROOT=${WEB_ROOT:-"/home/nrnqv/public_html/enkat"}    # publik webbmapp
KEEP_RELEASES=${KEEP_RELEASES:-5}
KEEP_DB_BACKUPS=${KEEP_DB_BACKUPS:-10}

# Flaggor
NO_BUILD=${NO_BUILD:-0}      # 1 = skippa npm build lokalt
NO_COMPOSER=${NO_COMPOSER:-0} # 1 = skippa composer install lokalt (skickar med vendor/)
RUN_MIGRATIONS=${RUN_MIGRATIONS:-1}  # 1 = kör php artisan migrate --force på servern

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
GIT_COMMIT=$(git -C "$ROOT_DIR" rev-parse HEAD)
GIT_DIRTY=$(git -C "$ROOT_DIR" status --porcelain | wc -l | tr -d ' ')

if [[ "$GIT_DIRTY" != "0" ]]; then
  echo "Deploy avbruten: arbetskopian innehåller $GIT_DIRTY ocommittade filer." >&2
  exit 1
fi

########################################
# 0) Förutsättningar
########################################
command -v rsync >/dev/null 2>&1 || { echo "rsync saknas"; exit 1; }
command -v ssh >/dev/null 2>&1 || { echo "ssh saknas"; exit 1; }
command -v composer >/dev/null 2>&1 || { echo "composer saknas"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl saknas"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm saknas"; exit 1; }

composer audit --no-dev --locked --no-interaction
npm audit

########################################
# 1) Bygg frontenden lokalt
########################################
if [[ "$NO_BUILD" -eq 0 ]]; then
  echo "[local] npm ci && npm run build"
  npm ci --prefer-offline
  npm run build
else
  echo "[local] skip build (NO_BUILD=1)"
fi

########################################
# 2) Bygg en lokal release med composer
########################################
RELEASE=$(date +%Y%m%d%H%M%S)
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/enkat-deploy.XXXXXX")
LOCAL_RELEASE="${BUILD_DIR}/release"
trap 'rm -rf "$BUILD_DIR"' EXIT

export COMPOSER_CACHE_DIR="${COMPOSER_CACHE_DIR:-${BUILD_DIR}/composer-cache}"
mkdir -p "$COMPOSER_CACHE_DIR"

rsync -az --delete \
  --exclude='.git' --exclude='node_modules' \
  $([[ "$NO_COMPOSER" -eq 0 ]] && echo "--exclude=vendor") \
  --exclude='.env' --exclude='storage' --exclude='database/database.sqlite' \
  ./ "${LOCAL_RELEASE}"

if [[ "$NO_COMPOSER" -eq 0 ]]; then
  (cd "${LOCAL_RELEASE}" && COMPOSER_NO_DEV=1 COMPOSER_MEMORY_LIMIT=-1 composer install --prefer-dist --optimize-autoloader --no-interaction --no-scripts)
else
  echo "[local] skip composer install (NO_COMPOSER=1)"
fi

# Rensa genererade cachefiler som kan innehålla dev-provider (t.ex. Pail)
rm -f "${LOCAL_RELEASE}/bootstrap/cache/packages.php" "${LOCAL_RELEASE}/bootstrap/cache/services.php"
# Säkerställ att Vite inte kör i hot-läge i produktion
rm -f "${LOCAL_RELEASE}/public/hot"

########################################
# 3) Skapa release på servern + synka upp koden
########################################
echo "[remote] mkdir -p $APP_PATH/releases"
ssh "$SSH_HOST" "mkdir -p $APP_PATH/releases"

echo "[rsync] sync code to $APP_PATH/releases/$RELEASE"
rsync -az --delete \
  --exclude='storage' --exclude='database/database.sqlite' \
  "${LOCAL_RELEASE}/" "$SSH_HOST:$APP_PATH/releases/$RELEASE"

########################################
# 4) Server-steg: länka shared, migrering, caches, current
########################################
echo "[remote] prepare release, migrate, caches, current"
ssh "$SSH_HOST" "set -euo pipefail; \
APP_PATH='$APP_PATH'; RELEASE='$RELEASE'; GIT_COMMIT='$GIT_COMMIT'; GIT_DIRTY='$GIT_DIRTY'; \
NEW=\"\${APP_PATH}/releases/\${RELEASE}\"; \
mkdir -p \"\${APP_PATH}/shared/storage/framework/cache\" \"\${APP_PATH}/shared/storage/framework/sessions\" \"\${APP_PATH}/shared/storage/framework/views\" \"\${APP_PATH}/shared/storage/logs\" \"\${APP_PATH}/shared/database\" \"\${APP_PATH}/releases\"; \
mkdir -p \"\${APP_PATH}/shared/storage/app\"; \
echo \"\${RELEASE}\" > \"\${APP_PATH}/shared/storage/app/build.txt\"; \
[ -f \"\${APP_PATH}/shared/.env\" ] || touch \"\${APP_PATH}/shared/.env\"; \
[ \"\$(grep -E '^APP_URL=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'https://boma.nu/enkat' ] || { echo 'Fel APP_URL' >&2; exit 1; }; \
[ \"\$(grep -E '^BOMA_AUTH_REDIRECT_URI=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'https://boma.nu/enkat/auth/boma/callback' ] || { echo 'Fel BOMA_AUTH_REDIRECT_URI' >&2; exit 1; }; \
[ \"\$(grep -E '^SESSION_COOKIE=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'enkat_session' ] || { echo 'Fel SESSION_COOKIE' >&2; exit 1; }; \
[ \"\$(grep -E '^SESSION_PATH=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = '/enkat/' ] || { echo 'Fel SESSION_PATH' >&2; exit 1; }; \
[ -f \"\${APP_PATH}/shared/database/database.sqlite\" ] || { mkdir -p \"\${APP_PATH}/shared/database\"; touch \"\${APP_PATH}/shared/database/database.sqlite\"; }; \
mkdir -p \"\${APP_PATH}/shared/backups\"; \
ln -snf \"\${APP_PATH}/shared/.env\" \"\${NEW}/.env\"; \
rm -rf \"\${NEW}/storage\" && ln -snf \"\${APP_PATH}/shared/storage\" \"\${NEW}/storage\"; \
mkdir -p \"\${NEW}/database\"; \
ln -snf \"\${APP_PATH}/shared/database/database.sqlite\" \"\${NEW}/database/database.sqlite\"; \
cd \"\${NEW}\"; \
rm -f bootstrap/cache/*.php || true; \
composer audit --no-dev --locked --no-interaction; \
php artisan config:clear; php artisan route:clear; php artisan view:clear; \
# Säkerhetskopiera databasen innan migreringar
if [ -f \"\${APP_PATH}/shared/database/database.sqlite\" ]; then \
  cp -a \"\${APP_PATH}/shared/database/database.sqlite\" \"\${APP_PATH}/shared/backups/database-\${RELEASE}.sqlite\"; \
fi; \
# Rensa gamla backups, behåll senaste KEEP_DB_BACKUPS
cd \"\${APP_PATH}/shared/backups\"; \
ls -1 | sort | head -n -$KEEP_DB_BACKUPS | xargs -r -I{} rm -f {}; \
cd \"\${NEW}\"; \
if [[ '$RUN_MIGRATIONS' == '1' ]]; then php artisan migrate --force; fi; \
php artisan about --only=environment --no-ansi >/dev/null; \
printf 'release=%s\ncommit=%s\ndirty_files=%s\ndeployed_at=%s\n' '$RELEASE' '$GIT_COMMIT' '$GIT_DIRTY' \"\$(date -Iseconds)\" > \"\${NEW}/.release-meta\"; \
ln -snf \"\${NEW}\" \"\${APP_PATH}/current\"; \
# Städa äldre releaser
cd \"\${APP_PATH}/releases\"; \
ls -1 | sort | head -n -$KEEP_RELEASES | xargs -r -I{} rm -rf {}; \
touch /home/nrnqv/.lsphp_restart.txt \
"

########################################
# 5) Synka public till webroot + patcha index.php
########################################
echo "[remote] sync public to webroot and patch index.php"
ssh "$SSH_HOST" "rsync -az --delete $APP_PATH/current/public/ $WEB_ROOT/"

# Skapa patchad index.php lokalt och skicka upp
INDEX_TMP=$(mktemp)
cat > "$INDEX_TMP" << INDEXEOF
<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Point to the actual application directory
\$appPath = '$APP_PATH/current';

// Determine if the application is in maintenance mode...
if (file_exists(\$maintenance = \$appPath.'/storage/framework/maintenance.php')) {
    require \$maintenance;
}

// Register the Composer autoloader...
require \$appPath.'/vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application \$app */
\$app = require_once \$appPath.'/bootstrap/app.php';

\$app->handleRequest(Request::capture());
INDEXEOF

scp -q "$INDEX_TMP" "$SSH_HOST:$WEB_ROOT/index.php"
rm -f "$INDEX_TMP"

echo "[check] exakt release, beroenden och OIDC-start"
ssh "$SSH_HOST" "set -euo pipefail;
grep -Fx 'commit=$GIT_COMMIT' '$APP_PATH/current/.release-meta';
grep -Fx 'dirty_files=0' '$APP_PATH/current/.release-meta';
cd '$APP_PATH/current';
composer audit --no-dev --locked --no-interaction;
"

AUTH_HEADERS="$(mktemp)"
trap 'rm -rf "$BUILD_DIR"; rm -f "$AUTH_HEADERS"' EXIT
curl --retry 6 --retry-delay 2 --retry-all-errors --fail --silent --show-error \
  --dump-header "$AUTH_HEADERS" --output /dev/null \
  'https://boma.nu/enkat/auth/boma'
grep -qi '^location: https://auth\.boma\.nu/' "$AUTH_HEADERS"
grep -Eqi '^set-cookie: XSRF-TOKEN=.*path=/enkat/([;[:space:]]|$)' "$AUTH_HEADERS"
grep -Eqi '^set-cookie: enkat_session=.*path=/enkat/([;[:space:]]|$)' "$AUTH_HEADERS"

echo "[done] Deploy klar: release $RELEASE"
