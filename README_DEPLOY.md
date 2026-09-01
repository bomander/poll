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
1. Kör tester, kodkontroller och beroendegranskningar.
2. Bygger Vite-assets lokalt för `/enkat/build/`.
3. Skapar en isolerad release med exakta produktionsberoenden.
4. Länkar persistenta miljö-, lagrings- och databasfiler.
5. Tar en transaktionssäker SQLite-backup och verifierar dess integritet.
6. Kör migreringar och bygger Laravel-cacher.
7. Förbereder publika filer och växlar `current` atomiskt.
8. Kontrollerar exakt release via `X-Boma-Release` och återställer automatiskt vid fel.
9. Installerar schemaläggaren och verifierar OIDC, cookies, CSRF, filrättigheter och databas.
10. Städar först därefter gamla releaser och backuper (20 av vardera som standard).

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

- Deployskriptet bygger med `VITE_BASE_PATH=/enkat/build/`; lokal `.env` kan använda `/build/`.
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
APP_NAME=Enkät
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://boma.nu/enkat

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=sqlite
DB_DATABASE=/home/<user>/apps/enkat/shared/database/database.sqlite

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=true
SESSION_COOKIE=enkat_session
SESSION_PATH=/enkat/
SESSION_SECURE_COOKIE=true

BOMA_AUTH_ENABLED=true
BOMA_AUTH_ISSUER=https://auth.boma.nu
BOMA_AUTH_CLIENT_ID=<client-id>
BOMA_AUTH_CLIENT_SECRET=<client-secret>
BOMA_AUTH_REDIRECT_URI=https://boma.nu/enkat/auth/boma/callback
BOMA_AUTH_EVENTS_ENABLED=false
BOMA_AUTH_EVENT_RECEIPT_RETENTION_DAYS=90
ENV
php artisan key:generate --force
```

Appens databasdrivrutin använder återkallningsbara sessioner men lagrar inte
IP-adress eller user-agent.

Lärare loggar in med sitt gemensamma boma.nu-konto. Enkät har inga lokala
registrerings-, lösenords- eller återställningsvägar. Callback-adressen måste
vara registrerad för Enkäts klient i auth-tjänsten. Ange aldrig klienthemligheten
i dokumentation, Git eller chatt.

Aktivera identitetshändelser först när auth-tjänsten är konfigurerad att skicka
dem till Enkät. När `BOMA_AUTH_EVENTS_ENABLED=true` krävs även en separat,
hemlig `BOMA_AUTH_EVENT_SUBJECT_HASH_KEY`.

2) Rensa caches
```bash
php artisan config:clear && php artisan route:clear && php artisan view:clear
```

---

### Regelbunden uppdatering (varje release)

1) Kör deployskriptet lokalt (se "Skript för deploy")
2) Skriptet verifierar själv den exakta publika releasen, inloggningsstarten,
   sessionscookies och CSRF-skyddet innan det rapporterar klart.

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
  - Kontrollera `VITE_BASE_PATH`. Produktion ska byggas för `/enkat/build/`.

- **Rättigheter**
  - På delad hosting brukar `chmod -R 775 ~/apps/enkat/shared/storage` räcka.
  - Se till att `~/apps/enkat/shared/backups` går att skriva till.

---
