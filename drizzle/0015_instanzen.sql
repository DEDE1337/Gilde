-- Dungeon and raid runs. Dungeons: a host opens a lobby, others join, the host starts.
-- Raids are scheduled (every day 19:00 Berlin): sign-up opens an hour before, the fight starts on its own; they have no host and carry starts_at.
-- state holds the party, the boss and the combat log.
CREATE TABLE dungeon_runs (
	id text PRIMARY KEY NOT NULL,
	dungeon text NOT NULL,
	kind text NOT NULL CHECK (kind IN ('dungeon','raid')),
	host_id text REFERENCES users(id) ON DELETE SET NULL,
	starts_at integer,
	status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','active','won','wiped','abandoned')),
	state text,
	turn_user_id text,
	turn_deadline integer,
	created_at text NOT NULL,
	updated_at text NOT NULL
);
CREATE INDEX idx_dungeon_runs_status ON dungeon_runs(status, created_at);
-- started_day counts against the daily limit of three dungeons; left_at marks a member who gave up and is out of the fight.
CREATE TABLE dungeon_members (
	run_id text NOT NULL REFERENCES dungeon_runs(id) ON DELETE CASCADE,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	joined_at text NOT NULL,
	started_day text,
	left_at text,
	PRIMARY KEY (run_id, user_id)
);
CREATE INDEX idx_dungeon_members_user ON dungeon_members(user_id, started_day);
