-- Gear and level belong to a character now; bags and gold stay with the account.
-- The game plays with the character picked at login (users.game_character_id), falling back to the main character.
ALTER TABLE users ADD COLUMN game_character_id text;
ALTER TABLE characters ADD COLUMN armory_xp integer NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN character_id text REFERENCES characters(id) ON DELETE SET NULL;
-- Rings, necklaces and trinkets left the game; whatever was worn goes back into the bag.
UPDATE inventory SET slot = NULL WHERE slot IN ('neck','ring1','ring2','trinket1','trinket2');
-- Gear worn so far goes to the account's main character, or its first one.
UPDATE inventory SET character_id = COALESCE(
	(SELECT u.main_character_id FROM users u WHERE u.id = inventory.user_id AND EXISTS (SELECT 1 FROM characters c WHERE c.id = u.main_character_id)),
	(SELECT c.id FROM characters c WHERE c.user_id = inventory.user_id ORDER BY c.created_at LIMIT 1)
) WHERE slot IS NOT NULL;
UPDATE inventory SET slot = NULL WHERE slot IS NOT NULL AND character_id IS NULL;
DROP INDEX idx_inventory_slot;
CREATE UNIQUE INDEX idx_inventory_slot ON inventory(character_id, slot) WHERE slot IS NOT NULL;
-- XP from duels is capped per day; the ledger of XP grants makes that countable.
CREATE TABLE armory_xp_log (
	id text PRIMARY KEY NOT NULL,
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	amount integer NOT NULL,
	reason text NOT NULL,
	day text NOT NULL,
	created_at text NOT NULL
);
CREATE INDEX idx_armory_xp_log ON armory_xp_log(character_id, reason, day);
