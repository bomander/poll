# Enkät

En enkel tjänst för direkta klassrumsomröstningar. Lärare skapar en flervalsfråga
eller ett ordmoln, startar en session och visar aggregerade resultat på projektor.
Elever ansluter anonymt med en kort kod och kan svara en gång per fråga.

## Stack
- Backend: Laravel (PHP 8.x)
- Frontend: React (Vite)
- Live updates: short polling interval
- Auth: OpenID Connect via the shared boma.nu account at auth.boma.nu (teachers only)

## Project docs
- `docs/requirements.md` - MVP scope and constraints
- `docs/datamodel.md` - Core entities and relations
- `docs/api.md` - REST endpoints (MVP)

## Local setup (expected)
1. Copy `.env.example` to `.env`.
2. Install backend deps:
   - `composer install`
3. Install frontend deps:
   - `npm ci`
4. Generate the app key, create the SQLite file and run migrations:
   - `php artisan key:generate`
   - `touch database/database.sqlite`
   - `php artisan migrate`
5. Start dev servers:
   - `php artisan serve`
   - `npm run dev`

## Notes
- Elever har inga konton och tjänsten lagrar inga IP-adresser eller user-agent-strängar för svar.
- En slumpmässig, sessionsspecifik cookie används enbart för att begränsa dubbla svar.
- Sessions are per live run; no cross-session analytics in MVP.
- Exports are aggregated CSV per session only.
- Deltagar-, projektor- och lärarvyer uppdateras automatiskt var femte sekund.
- Teacher sign-in uses Authorization Code with PKCE against auth.boma.nu; configure the `BOMA_AUTH_*` variables in production.
