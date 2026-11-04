-- Gathering professions, alchemy and daily tasks for the Waffenkammer.
-- materials: stackable crafting goods per account (ores, herbs, leather, vials), outside the 200-slot item bag.
CREATE TABLE materials (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	item_id integer NOT NULL,
	count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
	PRIMARY KEY (user_id, item_id)
);
-- Last gathering per profession, for the cooldown.
CREATE TABLE gather_times (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind text NOT NULL,
	at integer NOT NULL,
	PRIMARY KEY (user_id, kind)
);
-- Material stacks offered to other players for a fixed price (whole stack, no bids).
CREATE TABLE material_auctions (
	id text PRIMARY KEY NOT NULL,
	seller_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	item_id integer NOT NULL,
	count integer NOT NULL CHECK (count > 0),
	price integer NOT NULL CHECK (price > 0),
	created_at text NOT NULL
);
CREATE INDEX idx_material_auctions_item ON material_auctions(item_id, price);
-- Three tasks per player and Berlin day; finishing all three on consecutive days builds a streak.
CREATE TABLE daily_tasks (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	day text NOT NULL,
	task text NOT NULL,
	target integer NOT NULL,
	progress integer NOT NULL DEFAULT 0,
	claimed integer NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, day, task)
);
CREATE TABLE daily_streaks (
	user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	last_day text NOT NULL,
	streak integer NOT NULL DEFAULT 0
);
