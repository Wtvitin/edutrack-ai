-- Extend the laboratory only. Existing quiz questions/answers are immutable.
ALTER TABLE learning_activities DROP CONSTRAINT learning_activities_status_check;
ALTER TABLE learning_activities ADD CONSTRAINT learning_activities_status_check CHECK(status IN ('draft','generating','ready','completed','failed'));
ALTER TABLE learning_activities ADD COLUMN context_json jsonb NOT NULL DEFAULT '{}';
ALTER TABLE learning_activities ADD COLUMN generation_started_at timestamptz;
ALTER TABLE learning_activities ADD COLUMN review_json jsonb;
ALTER TABLE learning_activities ADD COLUMN review_state text NOT NULL DEFAULT 'idle' CHECK(review_state IN ('idle','pending','ready','failed'));
ALTER TABLE learning_activities ADD COLUMN review_version text;
ALTER TABLE learning_activities ADD COLUMN review_started_at timestamptz;
ALTER TABLE learning_activities ADD COLUMN review_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE learning_activities ADD COLUMN review_error_code text;
