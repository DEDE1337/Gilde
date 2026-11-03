ALTER TABLE characters ADD COLUMN gender integer NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN appearance_json text NOT NULL DEFAULT '{}';
