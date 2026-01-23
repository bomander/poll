# API Contract (MVP)

All endpoints are prefixed with `/api`.

## Auth (teacher)
- `GET /auth/basen/redirect` -> starts OAuth flow
- `GET /auth/basen/callback` -> handles OAuth callback
- `POST /auth/logout` -> end session

## Polls (teacher)
- `GET /polls` -> list polls for teacher
- `POST /polls` -> create poll
- `GET /polls/{poll}` -> poll detail
- `PUT /polls/{poll}` -> update poll
- `POST /polls/{poll}/clone` -> clone poll

Payload (create/update):
```
{
  "title": "string",
  "description": "string|null",
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
- `GET /sessions/{session}/export` -> CSV export

## Student
- `POST /join` -> join with code (returns session + current question)
- `POST /sessions/{session}/vote` -> submit vote

Vote payload:
```
{
  "question_id": 1,
  "option_id": 2,
  "respondent_key": "hash"
}
```

## Responses
- 401 for unauthorized teacher requests
- 404 for invalid poll/session
- 409 for duplicate vote
