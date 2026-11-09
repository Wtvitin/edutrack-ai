-- MANUAL ONLY. Export reviews first. Run before rollback 009 when reverting both.
-- This removes assisted drafts/reviews, never questions/answers of completed quizzes.
BEGIN;
UPDATE learning_activities SET status='failed',error_code='lab-assisted-rolled-back' WHERE status='draft';
ALTER TABLE learning_activities DROP CONSTRAINT learning_activities_status_check;
ALTER TABLE learning_activities ADD CONSTRAINT learning_activities_status_check CHECK(status IN ('generating','ready','completed','failed'));
ALTER TABLE learning_activities DROP COLUMN context_json, DROP COLUMN generation_started_at,
  DROP COLUMN review_json, DROP COLUMN review_state, DROP COLUMN review_version,
  DROP COLUMN review_started_at, DROP COLUMN review_attempts, DROP COLUMN review_error_code;
DELETE FROM schema_migrations WHERE name='010_lab_assisted.sql';
COMMIT;
