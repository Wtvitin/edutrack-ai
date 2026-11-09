-- Additive module: existing sessions, tasks and academic data are untouched.
CREATE TABLE learning_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid,
  subject_name text NOT NULL,
  mode text NOT NULL DEFAULT 'quiz' CHECK(mode IN ('quiz')),
  contract_version integer NOT NULL DEFAULT 1 CHECK(contract_version=1),
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  topic text NOT NULL,
  config_json jsonb NOT NULL,
  questions_json jsonb,
  source_text text NOT NULL DEFAULT '',
  status text NOT NULL CHECK(status IN ('generating','ready','completed','failed')),
  error_code text,
  provider text,
  model text,
  prompt_version text NOT NULL DEFAULT 'study-quiz-v1',
  score integer,
  duration_seconds integer CHECK(duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE(user_id,id),
  UNIQUE(user_id,request_id),
  FOREIGN KEY(user_id,subject_id) REFERENCES subjects(user_id,id) ON DELETE SET NULL (subject_id),
  CHECK ((status IN ('ready','completed')) = (questions_json IS NOT NULL)),
  CHECK ((status='completed') = (completed_at IS NOT NULL)),
  CHECK (score IS NULL OR score BETWEEN 0 AND 20)
);
CREATE INDEX learning_activities_owner_created_idx ON learning_activities(user_id,created_at DESC);
CREATE TABLE learning_answers (
  activity_id uuid NOT NULL,
  user_id uuid NOT NULL,
  question_index integer NOT NULL CHECK(question_index BETWEEN 0 AND 19),
  option_index integer NOT NULL CHECK(option_index BETWEEN 0 AND 4),
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(activity_id,question_index),
  FOREIGN KEY(user_id,activity_id) REFERENCES learning_activities(user_id,id) ON DELETE CASCADE
);
CREATE INDEX learning_answers_owner_idx ON learning_answers(user_id,activity_id);
