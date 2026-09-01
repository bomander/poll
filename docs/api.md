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
- `POST /polls/{poll}/clone` -> clone poll

Payload (create/update):
```
{
  "title": "string",
  "description": "string|null",
  "type": "multiple_choice|word_cloud",
  "questions": [
    {
      "question_text": "string",
      "options": ["string", "string"]
    }
  ]
}
```

## Sessions (teacher)
- `POST /polls/{poll}/sessions` -> start session
- `POST /sessions/{session}/close` -> close session
- `POST /sessions/{session}/current-question` -> set active question
- `POST /sessions/{session}/lock-question` -> lock current question
- `GET /sessions/{session}` -> session detail + results
- `GET /sessions` -> list the teacher's sessions
- `GET /sessions/{session}/export` -> complete CSV export; spreadsheet formulas are neutralized
- `DELETE /sessions/{session}` -> delete a closed session and its responses

## Student
- `POST /join` -> join with code (returns session + current question)
- `POST /sessions/{session}/vote` -> submit vote

Vote payload:
```
{
  "question_id": 1,
  "option_id": 2
}
```

For a word cloud, replace `option_id` with `answer_text`. Respondent identity is
an HTTP-only, service-scoped random cookie; clients never submit its hash.

## Responses
- 401 for unauthorized teacher requests
- 404 for invalid poll/session
- 409 for duplicate vote, closed/locked session or immutable poll history
