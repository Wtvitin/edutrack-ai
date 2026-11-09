-- Extend the same assessment entities. No existing answers or questions changed.
ALTER TABLE learning_activities DROP CONSTRAINT learning_activities_mode_check;
ALTER TABLE learning_activities ADD CONSTRAINT learning_activities_mode_check CHECK(mode IN ('quiz','exam'));
ALTER TABLE learning_activities DROP CONSTRAINT learning_activities_score_check;
ALTER TABLE learning_activities ADD CONSTRAINT learning_activities_score_check CHECK(score IS NULL OR score BETWEEN 0 AND 30);
ALTER TABLE learning_answers DROP CONSTRAINT learning_answers_question_index_check;
ALTER TABLE learning_answers ADD CONSTRAINT learning_answers_question_index_check CHECK(question_index BETWEEN 0 AND 29);
ALTER TABLE learning_answers ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE learning_activities ADD COLUMN review_marks jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(review_marks)='array');
ALTER TABLE learning_activities ADD COLUMN mark_revision integer NOT NULL DEFAULT 0;
ALTER TABLE learning_activities ADD COLUMN expires_at timestamptz;
ALTER TABLE learning_activities ADD COLUMN result_json jsonb;
