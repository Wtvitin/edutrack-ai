-- Additive study material and self-assessments; assessment records stay untouched.
CREATE TABLE flashcard_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid, subject_name text NOT NULL, topic text NOT NULL,
  source_activity_id uuid, source_json jsonb NOT NULL DEFAULT '{}',
  request_id uuid NOT NULL, request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','generating','ready','failed')),
  card_count integer NOT NULL CHECK(card_count BETWEEN 5 AND 20),
  provider text, model text, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), generation_started_at timestamptz,
  UNIQUE(user_id,id), UNIQUE(user_id,request_id),
  FOREIGN KEY(user_id,subject_id) REFERENCES subjects(user_id,id) ON DELETE SET NULL (subject_id),
  FOREIGN KEY(user_id,source_activity_id) REFERENCES learning_activities(user_id,id) ON DELETE SET NULL (source_activity_id)
);
CREATE TABLE flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, deck_id uuid NOT NULL,
  position integer NOT NULL, front text NOT NULL, back text NOT NULL, concept text NOT NULL,
  grounding text NOT NULL CHECK(grounding IN ('material','extra','general')), source_quote text NOT NULL DEFAULT '',
  origin text NOT NULL DEFAULT 'ai' CHECK(origin IN ('ai','edited')), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  archived boolean NOT NULL DEFAULT false, stage integer NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 8),
  review_count integer NOT NULL DEFAULT 0, lapse_count integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id), UNIQUE(deck_id,position), FOREIGN KEY(user_id,deck_id) REFERENCES flashcard_decks(user_id,id) ON DELETE CASCADE
);
CREATE INDEX flashcards_due_idx ON flashcards(user_id,due_at) WHERE archived=false;
CREATE TABLE flashcard_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, request_hash text NOT NULL, card_ids jsonb NOT NULL,
  cursor integer NOT NULL DEFAULT 0 CHECK(cursor>=0), revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(user_id,id), UNIQUE(user_id,request_id)
);
CREATE UNIQUE INDEX flashcard_session_active_idx ON flashcard_sessions(user_id) WHERE status='active';
CREATE TABLE flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, card_id uuid NOT NULL, session_id uuid NOT NULL,
  request_id uuid NOT NULL, rating text NOT NULL CHECK(rating IN ('again','hard','good','easy')),
  card_revision integer NOT NULL, card_snapshot jsonb NOT NULL, previous_stage integer NOT NULL, next_stage integer NOT NULL,
  interval_seconds integer NOT NULL CHECK(interval_seconds>0), due_at timestamptz NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(), algorithm text NOT NULL DEFAULT 'edutrack-boxes-v1',
  UNIQUE(user_id,request_id), UNIQUE(session_id,card_id),
  FOREIGN KEY(user_id,card_id) REFERENCES flashcards(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,session_id) REFERENCES flashcard_sessions(user_id,id) ON DELETE CASCADE
);
CREATE INDEX flashcard_reviews_owner_time_idx ON flashcard_reviews(user_id,reviewed_at DESC);
CREATE TABLE flashcard_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id uuid, card_id uuid, session_id uuid, action text NOT NULL, revision integer, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,deck_id) REFERENCES flashcard_decks(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,card_id) REFERENCES flashcards(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,session_id) REFERENCES flashcard_sessions(user_id,id) ON DELETE CASCADE
);
