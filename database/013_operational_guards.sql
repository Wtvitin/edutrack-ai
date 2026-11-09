-- Additive operational guards and measured listing indexes. No data cleanup.
ALTER TABLE ai_conversations ADD COLUMN active_turn uuid;
ALTER TABLE ai_conversations ADD COLUMN active_turn_started_at timestamptz;
ALTER TABLE ai_conversations ADD CONSTRAINT ai_turn_pair CHECK((active_turn IS NULL)=(active_turn_started_at IS NULL));
CREATE INDEX flashcards_owner_due_id_idx ON flashcards(user_id,due_at,id) WHERE archived=false;
CREATE INDEX flashcard_decks_owner_created_idx ON flashcard_decks(user_id,created_at DESC,id DESC);
CREATE INDEX flashcard_reviews_owner_created_idx ON flashcard_reviews(user_id,reviewed_at DESC,id DESC);
CREATE INDEX ai_messages_history_order_idx ON ai_messages(conversation_id,created_at DESC,id DESC);
