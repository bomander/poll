# Real-time Classroom Polls

Mentimeter-like live polling for teaching. Teachers create multiple-choice polls,
run live sessions, and show real-time results on a projector. Students join
anonymously with a short code and vote once per question.

## Stack
- Backend: Laravel (PHP 8.x)
- Frontend: React (Vite)
- Realtime: WebSockets (Laravel Reverb/Pusher/Socket.IO-compatible)
- Auth: OAuth via Basen (teachers only)

## Project docs
- `docs/requirements.md` - MVP scope and constraints
- `docs/datamodel.md` - Core entities and relations
- `docs/api.md` - REST endpoints (MVP)
- `docs/ws-events.md` - WebSocket channels and events

## Local setup (expected)
1. Copy `.env.example` to `.env` and fill in values.
2. Install backend deps:
   - `composer install`
3. Install frontend deps:
   - `npm install`
4. Run migrations:
   - `php artisan migrate`
5. Start dev servers:
   - `php artisan serve`
   - `npm run dev`

## Notes
- Students are fully anonymous (no accounts, no PII).
- Sessions are per live run; no cross-session analytics in MVP.
- Exports are aggregated CSV per session only.
- Realtime uses Laravel broadcasting; set `BROADCAST_CONNECTION` and Pusher/Reverb env values.
- OAuth uses Basen; configure `BASEN_*` env vars in production.
