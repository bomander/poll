# Data Model (MVP)

## users
- id
- basen_subject (unique)
- created_at

## polls
- id
- user_id (FK users)
- title
- description (nullable)
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
- code (6-8 chars, unique)
- status (active|closed)
- current_question_id (FK poll_questions, nullable)
- started_at
- ended_at (nullable)

## responses
- id
- session_id (FK poll_sessions)
- question_id (FK poll_questions)
- option_id (FK poll_options)
- respondent_key (hash)
- created_at

## Notes
- Enforce one response per respondent_key per question in a session.
- Consider a counter table for real-time aggregation.
