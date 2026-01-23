## Deploy-guide (Laravel i undermapp: boma.nu/enkat)

Den här guiden beskriver exakt hur vi deployar appen till delad hosting. Den är enkel att följa, robust och felsökningsvänlig. Alla kommandon kan köras om (idempotenta) utan att skada installationen.

### Arkitektur i produktion

- **Applikationskod (ej publik)**: `/home/<user>/apps/enkat`
  - `releases/<timestamp>` – varje release i egen katalog
  - `current/` – symlink som pekar på aktiv release
  - `shared/` – persistenta resurser
    - `shared/.env`
    - `shared/storage/` (framework/cache, sessions, views, logs)
    - `shared/database/database.sqlite`
- **Publik webb (undermapp)**: `/home/<user>/public_html/enkat`
  - Fylls från `current/public/` (rsync)
  - `index.php` patchas så den pekar på `…/apps/enkat/current`

Varför så här?
- Säkerhet: webservern når bara `public/`.
- Snabb release/rollback: byt bara vart `current`-symlinken pekar.

---

### Förutsättningar

- Lokalt: Node+npm, rsync, ssh, git
- Server: PHP 8.2+, Composer, SQLite, `php artisan` via CLI
- Första gången på servern (en gång):
  ```bash
  mkdir -p ~/apps/enkat/{releases,shared/storage,shared/database,shared/backups} ~/public_html/enkat
  ```

---

### Skript för deploy

Vi använder ett robust skript som sköter hela flödet:

```
scripts/deploy_release.sh
```

Skriptet gör:
1. Bygger Vite-assets lokalt (kan stängas av med `NO_BUILD=1`)
2. Skapar en ny release på servern och rsync:ar upp koden
3. Länkar `shared/.env`, `shared/storage` och `shared/database.sqlite` in i releasen
4. Kör Composer i prod-läge utan scripts, rensar cache, kör migrations (kan stängas av)
5. Kör seeders (Admin) om env-variabler finns
6. Sätter `current` → nya releasen (atomiskt byte)
7. Kopierar `current/public/` till `~/public_html/enkat` och patchar `index.php`
8. Städar gamla releaser (behåller 5)
9. Gör enkel health check på `/login`
10. Tar automatisk backup av SQLite-databasen före migreringar (roterar, behåller 10)

Exempel (från din dator):
```bash
SSH_HOST=<user>@<server> \
APP_PATH=/home/<user>/apps/enkat \
WEB_ROOT=/home/<user>/public_html/enkat \
./scripts/deploy_release.sh
```

Flaggor:
- Skippa build: `NO_BUILD=1 ./scripts/deploy_release.sh`
- Skippa migreringar: `RUN_MIGRATIONS=0 ./scripts/deploy_release.sh`
- Antal DB-backuper att behålla: `KEEP_DB_BACKUPS=20 ./scripts/deploy_release.sh`

---

### Viktig konfiguration för undermapp

- `vite.config.ts` har `base: '/enkat/'` → korrekta asset-URL:er i prod.
- `APP_URL` i `.env` → `https://boma.nu/enkat`
- `.htaccess` i `~/public_html/enkat` bör innehålla:
  ```apache
  <IfModule mod_rewrite.c>
      Options -MultiViews
      RewriteEngine On
      RewriteBase /enkat/
      RewriteRule ^index\.php$ - [L]
      RewriteCond %{REQUEST_FILENAME} !-f
      RewriteCond %{REQUEST_FILENAME} !-d
      RewriteRule . index.php [L]
  </IfModule>
  ```

---

### Första produktionstart (en gång)

1) Skapa `.env` (minsta möjliga) och generera APP_KEY
```bash
cd /home/<user>/apps/enkat/current
cat > .env <<'ENV'
APP_NAME=Enkat
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://boma.nu/enkat

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=sqlite
DB_DATABASE=/home/<user>/apps/enkat/shared/database/database.sqlite

SESSION_DRIVER=file
SESSION_LIFETIME=120

# Admin user (first user)
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@boma.nu
ADMIN_PASSWORD=change-me
ENV
php artisan key:generate --force
```

2) Rensa caches
```bash
php artisan config:clear && php artisan route:clear && php artisan view:clear
```

---

### Regelbunden uppdatering (varje release)

1) Kör deployskriptet lokalt (se "Skript för deploy")
2) Testa snabbt: `https://boma.nu/enkat/login` ska visa en inloggningssida

---

### Rollback

1) Lista releaser och välj timestamp
```bash
ssh <user>@<server> 'ls -1 /home/<user>/apps/enkat/releases'
```
2) Peka om `current`
```bash
ssh <user>@<server> 'ln -snf /home/<user>/apps/enkat/releases/<timestamp> /home/<user>/apps/enkat/current'
```
3) Synka om public till webroot
```bash
ssh <user>@<server> 'rsync -az --delete /home/<user>/apps/enkat/current/public/ /home/<user>/public_html/enkat/'
```

---

### Felsökning (symptom → åtgärd)

- **404 i `boma.nu/enkat`**
  - Kontrollera att `~/public_html/enkat/index.php` finns
  - `.htaccess` har `RewriteBase /enkat/`
  - `index.php` pekar mot `…/apps/enkat/current`

- **500 `Class "Laravel\\Pail\\PailServiceProvider" not found`**
  - Prod kör utan dev-paket. Kompilera utan scripts: `composer install --no-scripts --no-dev …`
  - Rensa Laravel-cachefiler `bootstrap/cache/*.php` innan du bootar.

- **500 `The MAC is invalid`**
  - `APP_KEY` har bytts efter att data krypterats. Använd samma APP_KEY som i den miljö där DB-filen skapades.

- **`Please provide a valid cache path`**
  - Se till att `shared/storage/…` finns och att `storage` i releasen länkas mot `shared/storage`.

- **Assets har fel URL**
  - Se `vite.config.ts` → `base: '/enkat/'`. Bygg om.

- **Rättigheter**
  - På delad hosting brukar `chmod -R 775 ~/apps/enkat/shared/storage` räcka.
  - Se till att `~/apps/enkat/shared/backups` går att skriva till.

---
