CREATE TABLE daily_spins (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	day text NOT NULL,
	reels text NOT NULL,
	reward integer NOT NULL,
	streak integer NOT NULL,
	created_at text NOT NULL,
	PRIMARY KEY (user_id, day)
);
CREATE INDEX idx_daily_spins_day ON daily_spins(day);
