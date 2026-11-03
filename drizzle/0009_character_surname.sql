-- modcheck:rebuild
-- WoW Forever characters have a first and a last name; only the combination must be unique.
-- SQLite cannot drop the old UNIQUE on name, so the table is rebuilt with foreign keys switched off by the runner.
CREATE TABLE characters_new (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name text NOT NULL COLLATE NOCASE,
	surname text NOT NULL DEFAULT '' COLLATE NOCASE,
	class_id integer NOT NULL,
	race text NOT NULL,
	level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 60),
	spec text NOT NULL DEFAULT '',
	talents_json text NOT NULL DEFAULT '{}',
	talents_checked_at text,
	created_at text NOT NULL,
	gender integer NOT NULL DEFAULT 0,
	appearance_json text NOT NULL DEFAULT '{}'
);
INSERT INTO characters_new (id,user_id,name,surname,class_id,race,level,spec,talents_json,talents_checked_at,created_at,gender,appearance_json)
	SELECT id,user_id,name,'',class_id,race,level,spec,talents_json,talents_checked_at,created_at,gender,appearance_json FROM characters;
DROP TABLE characters;
ALTER TABLE characters_new RENAME TO characters;
CREATE INDEX idx_characters_user ON characters(user_id);
CREATE UNIQUE INDEX idx_characters_full_name ON characters(name, surname);
