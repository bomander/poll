# WebSocket Events (MVP)

## Channels
- `session.{session_id}` (public or presence depending on provider)

## Events
### results_updated
Payload:
```
{
  "session_id": 1,
  "question_id": 10,
  "results": [
    {"option_id": 100, "count": 12, "percent": 40}
  ]
}
```

### session_updated
Payload:
```
{
  "session_id": 1,
  "status": "active|closed",
  "current_question_id": 10,
  "locked": false
}
```

## Client expectations
- Students and teachers subscribe on join.
- On vote submit, clients expect a `results_updated` event.
