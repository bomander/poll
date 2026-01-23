# MVP Requirements

## Scope
- Multiple-choice polls only (single choice).
- Anonymous students, no accounts or personal data.
- No org structure or sharing between teachers in MVP.
- No multi-session analytics; results are per session run.

## Roles
Teacher (authenticated):
- Create, edit, clone polls.
- Start/end live sessions.
- Control active question, lock question.
- Export results (CSV).

Student (anonymous):
- Join by short code.
- Vote once per question.
- View live chart (projector view).

## Realtime behavior
- WebSocket events, no polling.
- Target latency < 500ms, 30-40 concurrent students.

## GDPR principles
- No student identifiers or IPs in app logic.
- Session data may be purged (e.g., 30 days).
- CSV contains only aggregated answers.
