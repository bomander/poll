# Data Model (MVP)

## users
- id
- auth_subject (unique, permanent OIDC subject)
- basen_subject (legacy link, unique)
- created_at

## polls
- id
- user_id (FK users)
- title
- description (nullable)
- type (multiple_choice|word_cloud)
- created_at
- updated_at

## poll_questions
- id
- poll_id (FK polls)
- question_text
- order_index

## poll_options
- id
- question_id (FK poll_questions)
- option_text
- order_index

## poll_sessions
- id
- poll_id (FK polls)
- code (8 chars, unique)
- name (nullable)
- status (active|closed)
- högst en aktiv session per poll (databasspärr i SQLite/PostgreSQL)
- current_question_id (FK poll_questions, nullable)
- started_at
- ended_at (nullable)

## responses
- id
- session_id (FK poll_sessions)
- question_id (FK poll_questions)
- option_id (FK poll_options, nullable for word clouds)
- answer_text (nullable, normalized word-cloud answer)
- respondent_key (hash)
- created_at

## sessions
- serverlagrade och krypterade sessionsdata
- user_id för återkallning av inloggade lärares sessioner
- IP-adress och user-agent lämnas tomma

## Notes
- Enforce one response per respondent_key per question in a session.
- Consider a counter table for real-time aggregation.
