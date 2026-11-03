-- Hidden accounts (e.g. the site admin) do not show up in member lists, rankings or poll counts.
ALTER TABLE users ADD COLUMN hidden integer NOT NULL DEFAULT 0;
