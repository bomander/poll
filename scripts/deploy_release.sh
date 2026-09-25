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
KEEP_RELEASES=${KEEP_RELEASES:-20}
KEEP_DB_BACKUPS=${KEEP_DB_BACKUPS:-20}

# Flaggor
NO_BUILD=${NO_BUILD:-0}      # 1 = skippa npm build lokalt
NO_COMPOSER=${NO_COMPOSER:-0} # 1 = skippa composer install lokalt (skickar med vendor/)
RUN_MIGRATIONS=${RUN_MIGRATIONS:-1}  # 1 = kör php artisan migrate --force på servern

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"
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

composer test
composer audit --no-dev --locked --no-interaction
npm run format:check
npm run lint
npm run types
npm audit

########################################
# 1) Bygg frontenden lokalt
########################################
if [[ "$NO_BUILD" -eq 0 ]]; then
  echo "[local] npm ci && npm run build"
  npm ci --prefer-offline
  VITE_APP_NAME=Enkät VITE_BASE_PATH=/enkat/build/ npm run build
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
if grep -q '^APP_NAME=' \"\${APP_PATH}/shared/.env\"; then sed -i 's|^APP_NAME=.*$|APP_NAME=Enkät|' \"\${APP_PATH}/shared/.env\"; else printf '\nAPP_NAME=Enkät\n' >> \"\${APP_PATH}/shared/.env\"; fi; \
for ITEM in APP_LOCALE=sv APP_FALLBACK_LOCALE=sv; do KEY=\${ITEM%%=*}; if grep -q \"^\${KEY}=\" \"\${APP_PATH}/shared/.env\"; then sed -i \"s|^\${KEY}=.*$|\${ITEM}|\" \"\${APP_PATH}/shared/.env\"; else printf '\n%s\n' \"\${ITEM}\" >> \"\${APP_PATH}/shared/.env\"; fi; done; \
SESSION_RESET=0; \
for ITEM in SESSION_DRIVER=database SESSION_ENCRYPT=true SESSION_SECURE_COOKIE=true; do \
  KEY=\${ITEM%%=*}; \
  if ! grep -Fxq \"\${ITEM}\" \"\${APP_PATH}/shared/.env\"; then SESSION_RESET=1; fi; \
  if grep -q \"^\${KEY}=\" \"\${APP_PATH}/shared/.env\"; then sed -i \"s|^\${KEY}=.*$|\${ITEM}|\" \"\${APP_PATH}/shared/.env\"; else printf '\n%s\n' \"\${ITEM}\" >> \"\${APP_PATH}/shared/.env\"; fi; \
done; \
grep -q '^BOMA_AUTH_EVENTS_ENABLED=' \"\${APP_PATH}/shared/.env\" || printf '\nBOMA_AUTH_EVENTS_ENABLED=false\n' >> \"\${APP_PATH}/shared/.env\"; \
grep -q '^BOMA_AUTH_EVENT_RECEIPT_RETENTION_DAYS=' \"\${APP_PATH}/shared/.env\" || printf 'BOMA_AUTH_EVENT_RECEIPT_RETENTION_DAYS=90\n' >> \"\${APP_PATH}/shared/.env\"; \
[ \"\$(grep -E '^APP_ENV=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'production' ] || { echo 'APP_ENV måste vara production' >&2; exit 1; }; \
grep -Eq '^APP_DEBUG=(false|\"false\")$' \"\${APP_PATH}/shared/.env\" || { echo 'APP_DEBUG måste vara false' >&2; exit 1; }; \
[ \"\$(grep -E '^APP_URL=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'https://boma.nu/enkat' ] || { echo 'Fel APP_URL' >&2; exit 1; }; \
[ \"\$(grep -E '^BOMA_AUTH_REDIRECT_URI=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'https://boma.nu/enkat/auth/boma/callback' ] || { echo 'Fel BOMA_AUTH_REDIRECT_URI' >&2; exit 1; }; \
[ \"\$(grep -E '^SESSION_COOKIE=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'enkat_session' ] || { echo 'Fel SESSION_COOKIE' >&2; exit 1; }; \
[ \"\$(grep -E '^SESSION_PATH=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = '/enkat/' ] || { echo 'Fel SESSION_PATH' >&2; exit 1; }; \
[ \"\$(grep -E '^SESSION_DRIVER=' \"\${APP_PATH}/shared/.env\" | tail -n 1 | cut -d= -f2-)\" = 'database' ] || { echo 'SESSION_DRIVER måste vara database' >&2; exit 1; }; \
grep -Eq '^SESSION_ENCRYPT=(true|\"true\")$' \"\${APP_PATH}/shared/.env\" || { echo 'SESSION_ENCRYPT måste vara true' >&2; exit 1; }; \
grep -Eq '^SESSION_SECURE_COOKIE=(true|\"true\")$' \"\${APP_PATH}/shared/.env\" || { echo 'SESSION_SECURE_COOKIE måste vara true' >&2; exit 1; }; \
grep -Eq '^BOMA_AUTH_EVENTS_ENABLED=(true|false|\"true\"|\"false\")$' \"\${APP_PATH}/shared/.env\" || { echo 'Fel BOMA_AUTH_EVENTS_ENABLED' >&2; exit 1; }; \
grep -Eq '^BOMA_AUTH_EVENT_RECEIPT_RETENTION_DAYS=(90|\"90\")$' \"\${APP_PATH}/shared/.env\" || { echo 'BOMA_AUTH_EVENT_RECEIPT_RETENTION_DAYS måste vara 90' >&2; exit 1; }; \
if grep -Eq '^BOMA_AUTH_EVENTS_ENABLED=(true|\"true\")$' \"\${APP_PATH}/shared/.env\"; then grep -Eq '^BOMA_AUTH_EVENT_SUBJECT_HASH_KEY=([^\"[:space:]][^\"[:space:]]*|\"[^\"[:space:]][^\"]*\")$' \"\${APP_PATH}/shared/.env\" || { echo 'BOMA_AUTH_EVENT_SUBJECT_HASH_KEY krävs när identitetshändelser är aktiverade' >&2; exit 1; }; fi; \
printf '%s\n' \"\${SESSION_RESET}\" > \"\${NEW}/.session-reset-required\"; \
chmod 600 \"\${APP_PATH}/shared/.env\"; \
[ -f \"\${APP_PATH}/shared/database/database.sqlite\" ] || { mkdir -p \"\${APP_PATH}/shared/database\"; touch \"\${APP_PATH}/shared/database/database.sqlite\"; }; \
chmod 600 \"\${APP_PATH}/shared/database/database.sqlite\"; \
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
  php -r '\$source = new SQLite3(\$argv[1], SQLITE3_OPEN_READONLY); \$backup = new SQLite3(\$argv[2]); exit(\$source->backup(\$backup) ? 0 : 1);' \"\${APP_PATH}/shared/database/database.sqlite\" \"\${APP_PATH}/shared/backups/database-\${RELEASE}.sqlite\"; \
  chmod 600 \"\${APP_PATH}/shared/backups/database-\${RELEASE}.sqlite\"; \
  php -r '\$db = new SQLite3(\$argv[1], SQLITE3_OPEN_READONLY); exit(\$db->querySingle(\"PRAGMA integrity_check\") === \"ok\" ? 0 : 1);' \"\${APP_PATH}/shared/backups/database-\${RELEASE}.sqlite\"; \
fi; \
# Rensa gamla backups, behåll senaste KEEP_DB_BACKUPS
cd \"\${APP_PATH}/shared/backups\"; \
ls -1 | sort | head -n -$KEEP_DB_BACKUPS | xargs -r -I{} rm -f {}; \
cd \"\${NEW}\"; \
if [[ '$RUN_MIGRATIONS' == '1' ]]; then php artisan migrate --force; fi; \
if [ \"\$(cat \"\${NEW}/.session-reset-required\")\" = '1' ]; then \
  php -r '\$db = new SQLite3(\$argv[1]); exit(\$db->exec(\"DELETE FROM sessions\") ? 0 : 1);' \"\${APP_PATH}/shared/database/database.sqlite\"; \
fi; \
php -r '\$db = new SQLite3(\$argv[1], SQLITE3_OPEN_READONLY); exit(\$db->querySingle(\"PRAGMA integrity_check\") === \"ok\" ? 0 : 1);' \"\${APP_PATH}/shared/database/database.sqlite\"; \
rm -f \"\${NEW}/.session-reset-required\"; \
php artisan config:cache; php artisan view:cache; \
php artisan about --only=environment --no-ansi >/dev/null; \
printf 'release=%s\ncommit=%s\ndirty_files=%s\ndeployed_at=%s\n' '$RELEASE' '$GIT_COMMIT' '$GIT_DIRTY' \"\$(date -Iseconds)\" > \"\${NEW}/.release-meta\"; \
"

########################################
# 5) Förbered publik katalog utan att bryta föregående release
########################################
INDEX_TMP=$(mktemp "${TMPDIR:-/tmp}/enkat-index.XXXXXX")
AUTH_HEADERS=$(mktemp "${TMPDIR:-/tmp}/enkat-auth-headers.XXXXXX")
COOKIE_JAR=$(mktemp "${TMPDIR:-/tmp}/enkat-cookies.XXXXXX")
HOME_HTML=$(mktemp "${TMPDIR:-/tmp}/enkat-home.XXXXXX")
PREVIOUS_RELEASE=""
SWITCHED=0
DEPLOY_COMPLETE=0

cleanup() {
  local status=$?
  trap - EXIT

  if [[ "$status" -ne 0 && "$SWITCHED" -eq 1 && "$DEPLOY_COMPLETE" -eq 0 && "$PREVIOUS_RELEASE" == "$APP_PATH/releases/"* ]]; then
    echo "Driftsättningen misslyckades. Återställer $PREVIOUS_RELEASE" >&2
    ssh "$SSH_HOST" "set -euo pipefail; ln -sfn '$PREVIOUS_RELEASE' '$APP_PATH/current'; rsync -az --delete --exclude='index.php' '$PREVIOUS_RELEASE/public/' '$WEB_ROOT/'; touch /home/nrnqv/.lsphp_restart.txt" || true
  fi

  rm -rf "$BUILD_DIR"
  rm -f "$INDEX_TMP" "$AUTH_HEADERS" "$COOKIE_JAR" "$HOME_HTML"
  exit "$status"
}

trap cleanup EXIT

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

echo "[remote] stage public files and front controller"
ssh "$SSH_HOST" "set -euo pipefail; mkdir -p '$WEB_ROOT'; rsync -az --exclude='index.php' '$APP_PATH/releases/$RELEASE/public/' '$WEB_ROOT/'"
scp -q "$INDEX_TMP" "$SSH_HOST:$WEB_ROOT/index.php"

PREVIOUS_RELEASE=$(ssh "$SSH_HOST" "readlink -f '$APP_PATH/current' 2>/dev/null || true")

echo "[remote] switch current to release $RELEASE"
ssh "$SSH_HOST" "set -euo pipefail; ln -sfn '$APP_PATH/releases/$RELEASE' '$APP_PATH/current'; touch /home/nrnqv/.lsphp_restart.txt"
SWITCHED=1

echo "[remote] ensure Laravel scheduler"
ssh "$SSH_HOST" "set -euo pipefail;
mkdir -p \$HOME/crontab-backups; exec 9>\$HOME/crontab-backups/.lock; flock -w 60 9 || { echo 'Kunde inte låsa crontab' >&2; exit 1; };
CRON_TMP=\$(mktemp);
trap 'rm -f \"\$CRON_TMP\"' EXIT;
((crontab -l 2>/dev/null || true) | grep -v '/apps/enkat/current/artisan schedule:run' || true) > \"\$CRON_TMP\";
printf '%s\n' '* * * * * /usr/local/bin/php -d memory_limit=256M $APP_PATH/current/artisan schedule:run --no-ansi >> $APP_PATH/shared/storage/logs/cron.log 2>&1 # enkat-scheduler' >> \"\$CRON_TMP\";
crontab \"\$CRON_TMP\";
crontab -l | grep -Fqx '* * * * * /usr/local/bin/php -d memory_limit=256M $APP_PATH/current/artisan schedule:run --no-ansi >> $APP_PATH/shared/storage/logs/cron.log 2>&1 # enkat-scheduler';
"

echo "[check] verify exact public release"
PUBLIC_RELEASE=""
for ATTEMPT in {1..60}; do
  PUBLIC_RELEASE=$(curl -fsS -D - -o /dev/null \
    "https://boma.nu/enkat/?release=$RELEASE&attempt=$ATTEMPT" 2>/dev/null \
    | awk 'BEGIN { IGNORECASE=1 } /^x-boma-release:/ { gsub("\r", "", $2); print $2; exit }' \
    || true)
  if [[ "$PUBLIC_RELEASE" == "$RELEASE" ]]; then
    break
  fi
  sleep 1
done

if [[ "$PUBLIC_RELEASE" != "$RELEASE" ]]; then
  echo "Publik app växlade inte till release $RELEASE" >&2
  exit 1
fi

echo "[remote] finalize public files and retention"
ssh "$SSH_HOST" "set -euo pipefail;
rsync -az --delete --exclude='index.php' '$APP_PATH/current/public/' '$WEB_ROOT/';
cd '$APP_PATH/releases';
ls -1dt */ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r -I{} rm -rf '{}';
"

echo "[check] exakt release, beroenden och OIDC-start"
ssh "$SSH_HOST" "set -euo pipefail;
grep -Fx 'commit=$GIT_COMMIT' '$APP_PATH/current/.release-meta';
grep -Fx 'dirty_files=0' '$APP_PATH/current/.release-meta';
cd '$APP_PATH/current';
composer audit --no-dev --locked --no-interaction;
php -r '\$db = new SQLite3(\$argv[1]); exit(\$db->exec(\"UPDATE sessions SET ip_address = NULL, user_agent = NULL\") ? 0 : 1);' '$APP_PATH/shared/database/database.sqlite';
php -r '\$db = new SQLite3(\$argv[1], SQLITE3_OPEN_READONLY); exit(\$db->querySingle(\"PRAGMA integrity_check\") === \"ok\" ? 0 : 1);' '$APP_PATH/shared/database/database.sqlite';
php artisan schedule:list --no-ansi >/dev/null;
[ \"\$(stat -c %a '$APP_PATH/shared/.env' 2>/dev/null || stat -f %Lp '$APP_PATH/shared/.env')\" = '600' ];
[ \"\$(stat -c %a '$APP_PATH/shared/database/database.sqlite' 2>/dev/null || stat -f %Lp '$APP_PATH/shared/database/database.sqlite')\" = '600' ];
"

curl --retry 6 --retry-delay 2 --retry-all-errors --fail --silent --show-error \
  --dump-header "$AUTH_HEADERS" --output /dev/null \
  'https://boma.nu/enkat/auth/boma'
grep -qi '^location: https://auth\.boma\.nu/' "$AUTH_HEADERS"
grep -Eqi '^set-cookie: XSRF-TOKEN=.*path=/enkat/([;[:space:]]|$)' "$AUTH_HEADERS"
grep -Eqi '^set-cookie: enkat_session=.*path=/enkat/([;[:space:]]|$)' "$AUTH_HEADERS"

curl --retry 6 --retry-delay 2 --retry-all-errors --fail --silent --show-error \
  --cookie-jar "$COOKIE_JAR" --output "$HOME_HTML" \
  "https://boma.nu/enkat/?csrf-check=$RELEASE"
CSRF_TOKEN=$(sed -n 's/.*name="csrf-token" content="\([^"]*\)".*/\1/p' "$HOME_HTML" | head -n 1)
[[ -n "$CSRF_TOKEN" ]]
NO_CSRF_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --cookie "$COOKIE_JAR" --header 'Accept: application/json' --header 'Content-Type: application/json' \
  --request POST --data '{"code":"INVALID1"}' 'https://boma.nu/enkat/api/join')
[[ "$NO_CSRF_STATUS" == "419" ]]
WITH_CSRF_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --cookie "$COOKIE_JAR" --header 'Accept: application/json' --header 'Content-Type: application/json' \
  --header "X-CSRF-TOKEN: $CSRF_TOKEN" \
  --request POST --data '{"code":"INVALID1"}' 'https://boma.nu/enkat/api/join')
[[ "$WITH_CSRF_STATUS" != "419" ]]

DEPLOY_COMPLETE=1
echo "[done] Deploy klar: release $RELEASE"
