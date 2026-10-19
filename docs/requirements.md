# MVP Requirements

## Scope
- Multiple-choice polls and word clouds with 1–10 questions that the teacher
  steps through.
- Eleven themes for the student view and the projector, chosen per poll.
- Anonymous students, no accounts or personal data.
- No org structure or sharing between teachers in MVP.
- No multi-session analytics; results are per session run.

## Roles
Teacher (authenticated):
- Create and clone polls. A poll can be edited until its first session; after
  that it is immutable so historical results remain intact.
- Start/end live sessions.
- Control active question, lock question.
- Export results (CSV).

Student (anonymous):
- Join by short code.
- Vote once per question.
- View live chart (projector view).

## Live behavior
- Participant and teacher views refresh every five seconds, the projector
  every three seconds.
- Target audience: 30-40 concurrent students.
- The public rate limit allows one 40-student class to use the polling fallback
  behind a shared IP address.

## GDPR principles
- No student identifiers or IPs in app logic.
- Teachers can delete closed sessions and their responses.
- CSV contains only aggregated answers.
