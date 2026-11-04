-- Tower of Trials: an endless solo climb. One open run per player; floor is the floor being fought, best the floors cleared.
-- gold is banked until the player cashes out (all of it) or dies (half of it). week (Monday of the Berlin week) feeds the weekly ranking.
CREATE TABLE tower_runs (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	character_id text REFERENCES characters(id) ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','dead','cashed')),
	floor integer NOT NULL DEFAULT 1,
	best integer NOT NULL DEFAULT 0,
	gold integer NOT NULL DEFAULT 0,
	paid integer NOT NULL DEFAULT 0,
	state text NOT NULL,
	week text NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL
);
CREATE UNIQUE INDEX idx_tower_active ON tower_runs(user_id) WHERE status='active';
CREATE INDEX idx_tower_week ON tower_runs(week, best);
