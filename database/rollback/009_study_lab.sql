-- MANUAL ONLY. Destructive to laboratory data; never run automatically.
-- Export laboratory records first. Existing academic tables are not affected.
BEGIN;
DROP TABLE learning_answers;
DROP TABLE learning_activities;
DELETE FROM schema_migrations WHERE name='009_study_lab.sql';
COMMIT;
