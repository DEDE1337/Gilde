CREATE TABLE roulette_rounds (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	bet_color text NOT NULL CHECK (bet_color IN ('red','black','green')),
	amount integer NOT NULL CHECK (amount > 0),
	number integer NOT NULL CHECK (number BETWEEN 0 AND 36),
	payout integer NOT NULL,
	created_at text NOT NULL
);
CREATE INDEX idx_roulette_created ON roulette_rounds(created_at);
CREATE INDEX idx_roulette_user ON roulette_rounds(user_id);
