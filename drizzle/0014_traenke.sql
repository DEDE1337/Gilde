-- Potions for the duel bag, counted per account. Bought from the merchant, used up in duels.
CREATE TABLE potions (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	potion text NOT NULL,
	count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
	PRIMARY KEY (user_id, potion)
);
-- Accounts that already got their start gold receive the starter potions too.
INSERT OR IGNORE INTO potions(user_id,potion,count) SELECT user_id,'heal',2 FROM gold_ledger WHERE reason='start';
INSERT OR IGNORE INTO potions(user_id,potion,count) SELECT user_id,'mana',1 FROM gold_ledger WHERE reason='start';
