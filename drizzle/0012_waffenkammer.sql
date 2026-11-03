-- modcheck:rebuild
-- Waffenkammer: three free automat rolls per Berlin day, one gold ledger for every game, inventory, auction house and duels.
-- daily_spins gets a roll number, so the old (user_id, day) key is rebuilt; existing spins become roll 1 of their day.
CREATE TABLE daily_spins_new (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	day text NOT NULL,
	roll integer NOT NULL DEFAULT 1 CHECK (roll >= 1),
	reels text NOT NULL,
	reward integer NOT NULL,
	streak integer NOT NULL,
	created_at text NOT NULL,
	PRIMARY KEY (user_id, day, roll)
);
INSERT INTO daily_spins_new(user_id,day,roll,reels,reward,streak,created_at) SELECT user_id,day,1,reels,reward,streak,created_at FROM daily_spins;
DROP TABLE daily_spins;
ALTER TABLE daily_spins_new RENAME TO daily_spins;
CREATE INDEX idx_daily_spins_day ON daily_spins(day);

-- Every gold movement outside the casino games: start gold, chests, shop, auction house, duel rewards.
CREATE TABLE gold_ledger (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	amount integer NOT NULL,
	reason text NOT NULL,
	ref text,
	created_at text NOT NULL
);
CREATE INDEX idx_gold_ledger_user ON gold_ledger(user_id);
-- Start gold exists once per account, enforced by the database and not only by the code.
CREATE UNIQUE INDEX idx_gold_ledger_start ON gold_ledger(user_id) WHERE reason = 'start';

-- One row per item instance. An item is either in the bag, equipped in one slot or listed in the auction house.
CREATE TABLE inventory (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	item_id integer NOT NULL,
	source text NOT NULL,
	slot text,
	listed integer NOT NULL DEFAULT 0,
	created_at text NOT NULL
);
CREATE INDEX idx_inventory_user ON inventory(user_id);
CREATE UNIQUE INDEX idx_inventory_slot ON inventory(user_id, slot) WHERE slot IS NOT NULL;

CREATE TABLE chest_opens (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	chest text NOT NULL,
	item_id integer NOT NULL,
	rarity text NOT NULL,
	created_at text NOT NULL
);
CREATE INDEX idx_chest_opens_user ON chest_opens(user_id);

-- Fixed-price market. The listed item stays in the seller's inventory row (listed = 1) until it is bought or withdrawn.
CREATE TABLE auctions (
	id text PRIMARY KEY NOT NULL,
	seller_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	inventory_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
	item_id integer NOT NULL,
	price integer NOT NULL CHECK (price > 0),
	status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','sold','withdrawn')),
	buyer_id text REFERENCES users(id) ON DELETE SET NULL,
	created_at text NOT NULL,
	closed_at text
);
CREATE UNIQUE INDEX idx_auctions_open_item ON auctions(inventory_id) WHERE status = 'open';
CREATE INDEX idx_auctions_status ON auctions(status, created_at);

-- Turn-based duels. state holds both fighters' values, health and the combat log; only the server changes it.
CREATE TABLE duels (
	id text PRIMARY KEY NOT NULL,
	challenger_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	opponent_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done','declined','expired')),
	state text,
	turn_user_id text,
	turn_deadline integer,
	winner_id text,
	reward integer NOT NULL DEFAULT 0,
	created_at text NOT NULL,
	updated_at text NOT NULL
);
CREATE INDEX idx_duels_challenger ON duels(challenger_id, status);
CREATE INDEX idx_duels_opponent ON duels(opponent_id, status);
