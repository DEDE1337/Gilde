-- Since the Waffenkammer levels go to 60, an item counts only from its required level on. Gear worn before that change keeps counting
-- (level_exempt = 1) until it is taken off or moved; equipped again, the level rule applies.
ALTER TABLE inventory ADD COLUMN level_exempt integer NOT NULL DEFAULT 0;
UPDATE inventory SET level_exempt=1 WHERE slot IS NOT NULL;
