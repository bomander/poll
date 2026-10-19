# API Contract (MVP)

API-endpoints are prefixed with `/api`. Browser requests use the web session and
must include the CSRF token rendered in the page.

## Auth (teacher)
- `GET /auth/boma` -> starts the OpenID Connect flow against auth.boma.nu
- `GET /auth/boma/callback` -> verifies the OpenID Connect callback
- `POST /logout` -> end session

## Polls (teacher)
- `GET /polls` -> list polls for teacher
- `POST /polls` -> create poll
- `GET /polls/{poll}` -> poll detail
- `PUT /polls/{poll}` -> update poll before its first session
- `DELETE /polls/{poll}` -> delete poll with its closed sessions and responses (409 while a session is active)
- `POST /polls/{poll}/clone` -> clone poll (keeps the theme)
- `PATCH /polls/{poll}/theme` -> `{ "theme": "rymd" }`, change the theme; allowed
  after the poll has run and during a live session

Payload (create/update):
```
{
  "title": "string",
  "description": "string|null",
  "type": "multiple_choice|word_cloud",
  "settings": { "theme": "lekfullt|rymd|skog|hav|pixel|tavla|arena|pastell|tidning|bauhaus|klar" },
  "questions": [
    {
      "question_text": "string",
      "options": ["string", "string"]
    }
  ]
}
```

A poll has 1–10 questions of the same type. Multiple choice questions have 2–8
options. Only `settings.theme` is stored; other settings keys are dropped.

## Sessions (teacher)
- `POST /polls/{poll}/sessions` -> start session; 409 with `session_id` if one is already active
- `POST /sessions/{session}/close` -> close session
- `POST /sessions/{session}/current-question` -> set active question
- `POST /sessions/{session}/lock-question` -> lock current question
- `POST /sessions/{session}/results-visibility` -> `{ "show_results": bool }`, show or hide results for students and the projector
- `POST /sessions/{session}/hidden-answers` -> `{ "answer_text": "string", "hidden": bool }`, hide a word-cloud answer from the class
- `GET /sessions/{session}` -> session detail + results
- `GET /sessions` -> list the teacher's sessions
- `GET /sessions/{session}/export` -> complete CSV export; spreadsheet formulas are neutralized
- `DELETE /sessions/{session}` -> delete a closed session and its responses

## Student
- `POST /join` -> join with code (returns session + current question). Codes are
  six characters without 0/O/1/I/L; spaces, dashes and lowercase are accepted.
  `results` is empty while the teacher hides results, and hidden word-cloud
  answers are never included. `my_answer` is the respondent's own answer.
  `theme` is the poll's theme (`lekfullt` when none is set), and
  `question_number` / `question_count` give the position in the poll.
- `POST /sessions/{session}/vote` -> submit vote

The vote response has the same shape as `POST /join`.

Vote payload:
```
{
  "question_id": 1,
  "option_id": 2
}
```

For a word cloud, replace `option_id` with `answer_text` (max 60 characters). Respondent identity is
an HTTP-only, service-scoped random cookie; clients never submit its hash.

## Responses
- 401 for unauthorized teacher requests
- 404 for invalid poll/session
- 409 for duplicate vote, closed/locked session or immutable poll history
