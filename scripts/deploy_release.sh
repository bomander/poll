#!/usr/bin/env bash
# Robust, steg-för-steg deploy för Laravel-app i undermapp (boma.nu/enkat)
# Körs lokalt från projektroten. Kräver ssh/rsync till servern.

set -euo pipefail

########################################
# Konfiguration (anpassa vid behov)
########################################
SSH_HOST=${SSH_HOST:-"nrnqv@delta.hostup.se"}
APP_PATH=${APP_PATH:-"/home/nrnqv/apps/enkat"}           # rot för releases/current/shared
WEB_ROOT=${WEB_ROOT:-"/home/nrnqv/public_html/enkat"}    # publik webbmapp
KEEP_RELEASES=${KEEP_RELEASES:-5}
KEEP_DB_BACKUPS=${KEEP_DB_BACKUPS:-10}

# Flaggor
NO_BUILD=${NO_BUILD:-0}      # 1 = skippa npm build lokalt
RUN_MIGRATIONS=${RUN_MIGRATIONS:-1}  # 1 = kör php artisan migrate --force på servern
RUN_SEEDERS=${RUN_SEEDERS:-1}        # 1 = kör specifika seeders (idempotent)

########################################
# 0) Förutsättningar
########################################
command -v rsync >/dev/null 2>&1 || { echo "rsync saknas"; exit 1; }
command -v ssh >/dev/null 2>&1 || { echo "ssh saknas"; exit 1; }

########################################
# 1) Bygg frontenden lokalt
########################################
if [[ "$NO_BUILD" -eq 0 ]]; then
  echo "[local] npm run build"
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

rsync -az --delete \
  --exclude='.git' --exclude='node_modules' --exclude='vendor' \
  --exclude='.env' --exclude='storage' --exclude='database/database.sqlite' \
  ./ "${LOCAL_RELEASE}"

(cd "${LOCAL_RELEASE}" && COMPOSER_NO_DEV=1 COMPOSER_MEMORY_LIMIT=-1 composer install --prefer-dist --optimize-autoloader --no-interaction --no-scripts)

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
ssh "$SSH_HOST" bash -lc "set -euo pipefail; \
APP_PATH='$APP_PATH'; RELEASE='$RELEASE'; \
NEW=\"\${APP_PATH}/releases/\${RELEASE}\"; \
mkdir -p \"\${APP_PATH}/shared/storage/framework/cache\" \"\${APP_PATH}/shared/storage/framework/sessions\" \"\${APP_PATH}/shared/storage/framework/views\" \"\${APP_PATH}/shared/storage/logs\" \"\${APP_PATH}/shared/database\" \"\${APP_PATH}/releases\"; \
mkdir -p \"\${APP_PATH}/shared/storage/app\"; \
echo \"\${RELEASE}\" > \"\${APP_PATH}/shared/storage/app/build.txt\"; \
[ -f \"\${APP_PATH}/shared/.env\" ] || touch \"\${APP_PATH}/shared/.env\"; \
[ -f \"\${APP_PATH}/shared/database/database.sqlite\" ] || { mkdir -p \"\${APP_PATH}/shared/database\"; touch \"\${APP_PATH}/shared/database/database.sqlite\"; }; \
mkdir -p \"\${APP_PATH}/shared/backups\"; \
ln -snf \"\${APP_PATH}/shared/.env\" \"\${NEW}/.env\"; \
rm -rf \"\${NEW}/storage\" && ln -snf \"\${APP_PATH}/shared/storage\" \"\${NEW}/storage\"; \
mkdir -p \"\${NEW}/database\"; \
ln -snf \"\${APP_PATH}/shared/database/database.sqlite\" \"\${NEW}/database/database.sqlite\"; \
cd \"\${NEW}\"; \
rm -f bootstrap/cache/*.php || true; \
php artisan config:clear || true; php artisan route:clear || true; php artisan view:clear || true; \
# Säkerhetskopiera databasen innan migreringar
if [ -f \"\${APP_PATH}/shared/database/database.sqlite\" ]; then \
  cp -a \"\${APP_PATH}/shared/database/database.sqlite\" \"\${APP_PATH}/shared/backups/database-\${RELEASE}.sqlite\"; \
fi; \
# Rensa gamla backups, behåll senaste KEEP_DB_BACKUPS
cd \"\${APP_PATH}/shared/backups\"; \
ls -1 | sort | head -n -$KEEP_DB_BACKUPS | xargs -r -I{} rm -f {}; \
cd \"\${NEW}\"; \
if [[ '$RUN_MIGRATIONS' == '1' ]]; then php artisan migrate --force; fi; \
if [[ '$RUN_SEEDERS' == '1' ]]; then php artisan db:seed --class=AdminUserSeeder --no-interaction --force || true; fi; \
ln -snf \"\${NEW}\" \"\${APP_PATH}/current\"; \
# Städa äldre releaser
cd \"\${APP_PATH}/releases\"; \
ls -1 | sort | head -n -$KEEP_RELEASES | xargs -r -I{} rm -rf {} \
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

# Rensa OPCache via HTTP för att tvinga omladdning av PHP-filer
ssh "$SSH_HOST" "echo '<?php if(function_exists(\"opcache_reset\")) { opcache_reset(); echo \"cleared\"; } ?>' > $WEB_ROOT/opcache_clear.php"
curl -sk "https://boma.nu/enkat/opcache_clear.php" || true
ssh "$SSH_HOST" "rm -f $WEB_ROOT/opcache_clear.php"

########################################
# 6) Health check (innehålls-koll, inte bara status)
########################################
echo "[check] GET https://boma.nu/enkat/login"
if command -v curl >/dev/null 2>&1; then
  set +e
  RESPONSE=$(curl -sI https://boma.nu/enkat/login 2>/dev/null | head -1)
  echo "$RESPONSE" | grep -qE "302|200" && echo "OK: $RESPONSE" || echo "VARNING: $RESPONSE"
  set -e
else
  echo "(curl saknas lokalt – hoppar över health check)"
fi

echo "[done] Deploy klar: release $RELEASE"
