CREATE TABLE blackjack_hands (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	amount integer NOT NULL CHECK (amount > 0),
	deck text NOT NULL,
	player text NOT NULL,
	dealer text NOT NULL,
	status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','done')),
	result text,
	payout integer NOT NULL DEFAULT 0,
	created_at text NOT NULL
);
CREATE UNIQUE INDEX idx_blackjack_open ON blackjack_hands(user_id) WHERE status = 'playing';
CREATE INDEX idx_blackjack_user ON blackjack_hands(user_id);
