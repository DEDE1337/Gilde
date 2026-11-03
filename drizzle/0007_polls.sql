CREATE TABLE polls (
	id text PRIMARY KEY NOT NULL,
	question text NOT NULL,
	options_json text NOT NULL,
	kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','class','race')),
	multi integer NOT NULL DEFAULT 0,
	popup integer NOT NULL DEFAULT 0,
	closes_at text NOT NULL,
	closed integer NOT NULL DEFAULT 0,
	created_by text REFERENCES users(id) ON DELETE SET NULL,
	created_at text NOT NULL,
	discord_ref text,
	discord_counts_json text,
	discord_synced_at text
);
CREATE TABLE poll_votes (
	poll_id text NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	option_index integer NOT NULL,
	created_at text NOT NULL,
	PRIMARY KEY (poll_id, user_id, option_index)
);
CREATE INDEX idx_poll_votes_user ON poll_votes(user_id);
