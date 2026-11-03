-- Guild platform: accounts, characters, raids, BiS, professions, forum, legacy, patches.
ALTER TABLE guild_events ADD COLUMN raid_id text;

CREATE TABLE users (
	id text PRIMARY KEY NOT NULL,
	username text NOT NULL COLLATE NOCASE UNIQUE,
	password_hash text NOT NULL,
	role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','officer','member')),
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
	guild_rank text NOT NULL DEFAULT 'Rekrut',
	main_character_id text,
	dashboard_json text NOT NULL DEFAULT '{}',
	legacy_public integer NOT NULL DEFAULT 0,
	created_at text NOT NULL
);
CREATE TABLE sessions (
	token_hash text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at integer NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE user_permissions (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	permission text NOT NULL,
	PRIMARY KEY (user_id, permission)
);

CREATE TABLE characters (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name text NOT NULL COLLATE NOCASE UNIQUE,
	class_id integer NOT NULL,
	race text NOT NULL,
	level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 60),
	spec text NOT NULL DEFAULT '',
	talents_json text NOT NULL DEFAULT '{}',
	talents_checked_at text,
	created_at text NOT NULL
);
CREATE INDEX idx_characters_user ON characters(user_id);
CREATE TABLE character_gear (
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	slot text NOT NULL,
	item_id integer NOT NULL,
	PRIMARY KEY (character_id, slot)
);
CREATE TABLE character_items (
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	item_id integer NOT NULL,
	status text NOT NULL CHECK (status IN ('owned','needed','wishlist','equipped','obsolete')),
	updated_at text NOT NULL,
	PRIMARY KEY (character_id, item_id)
);
CREATE INDEX idx_character_items_item ON character_items(item_id);

CREATE TABLE raid_instances (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	size integer NOT NULL,
	boss_count integer NOT NULL,
	unlocks_on text,
	note text NOT NULL DEFAULT '',
	source_url text NOT NULL DEFAULT ''
);
CREATE TABLE raid_bosses (
	id text PRIMARY KEY NOT NULL,
	instance_id text NOT NULL REFERENCES raid_instances(id) ON DELETE CASCADE,
	name text NOT NULL,
	sort integer NOT NULL DEFAULT 0,
	confirmed integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_raid_bosses_instance ON raid_bosses(instance_id);
CREATE TABLE raids (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	instance_id text NOT NULL REFERENCES raid_instances(id),
	starts_at text NOT NULL,
	duration integer NOT NULL,
	max_players integer NOT NULL,
	need_tank integer NOT NULL,
	need_heal integer NOT NULL,
	need_dps integer NOT NULL,
	min_level integer NOT NULL DEFAULT 60,
	description text NOT NULL DEFAULT '',
	leader_id text NOT NULL REFERENCES users(id),
	status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','closed','done','cancelled')),
	created_at text NOT NULL
);
CREATE INDEX idx_raids_start ON raids(starts_at);
CREATE TABLE raid_signups (
	id text PRIMARY KEY NOT NULL,
	raid_id text NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	role text NOT NULL CHECK (role IN ('tank','heal','dps')),
	status text NOT NULL CHECK (status IN ('signed','confirmed','bench','withdrawn','unavailable')),
	comment text NOT NULL DEFAULT '',
	updated_at text NOT NULL,
	UNIQUE (raid_id, character_id)
);
CREATE INDEX idx_raid_signups_character ON raid_signups(character_id);
CREATE TABLE uploads (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	mime text NOT NULL,
	size integer NOT NULL,
	public integer NOT NULL DEFAULT 0,
	created_at text NOT NULL
);
CREATE TABLE raid_kills (
	id text PRIMARY KEY NOT NULL,
	boss_id text NOT NULL REFERENCES raid_bosses(id),
	raid_id text REFERENCES raids(id) ON DELETE SET NULL,
	killed_at text NOT NULL,
	comment text NOT NULL DEFAULT '',
	screenshot_id text REFERENCES uploads(id) ON DELETE SET NULL,
	created_by text NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_raid_kills_boss ON raid_kills(boss_id, killed_at);
CREATE TABLE kill_participants (
	kill_id text NOT NULL REFERENCES raid_kills(id) ON DELETE CASCADE,
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	PRIMARY KEY (kill_id, character_id)
);
CREATE TABLE hall_entries (
	id text PRIMARY KEY NOT NULL,
	title text NOT NULL,
	category text NOT NULL CHECK (category IN ('firstkill','raid','event','mount','character','anniversary','milestone')),
	description text NOT NULL DEFAULT '',
	occurred_on text NOT NULL,
	participants text NOT NULL DEFAULT '',
	screenshot_id text REFERENCES uploads(id) ON DELETE SET NULL,
	kill_id text REFERENCES raid_kills(id) ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
	submitted_by text NOT NULL REFERENCES users(id),
	created_at text NOT NULL
);
CREATE INDEX idx_hall_status ON hall_entries(status, occurred_on);

CREATE TABLE bis_lists (
	id text PRIMARY KEY NOT NULL,
	class_id integer NOT NULL,
	spec text NOT NULL,
	version text NOT NULL,
	source_name text NOT NULL,
	source_url text NOT NULL,
	reviewed_at text NOT NULL,
	reviewed_patch_id text,
	created_by text NOT NULL REFERENCES users(id),
	UNIQUE (class_id, spec, version)
);
CREATE TABLE bis_items (
	list_id text NOT NULL REFERENCES bis_lists(id) ON DELETE CASCADE,
	slot text NOT NULL,
	item_id integer NOT NULL,
	alternative integer NOT NULL DEFAULT 0,
	note text NOT NULL DEFAULT '',
	PRIMARY KEY (list_id, slot, item_id)
);
CREATE INDEX idx_bis_items_item ON bis_items(item_id);

CREATE TABLE character_professions (
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	profession text NOT NULL,
	skill integer NOT NULL DEFAULT 1 CHECK (skill BETWEEN 1 AND 300),
	specialization text NOT NULL DEFAULT '',
	PRIMARY KEY (character_id, profession)
);
CREATE TABLE character_recipes (
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	spell_id integer NOT NULL,
	profession text NOT NULL,
	rare integer NOT NULL DEFAULT 0,
	PRIMARY KEY (character_id, spell_id)
);
CREATE INDEX idx_character_recipes_spell ON character_recipes(spell_id);
CREATE TABLE craft_requests (
	id text PRIMARY KEY NOT NULL,
	requester_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	crafter_id text REFERENCES users(id) ON DELETE SET NULL,
	item_id integer,
	item_name text NOT NULL,
	quantity integer NOT NULL DEFAULT 1,
	materials text NOT NULL DEFAULT '',
	comment text NOT NULL DEFAULT '',
	status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','progress','done','cancelled')),
	created_at text NOT NULL,
	updated_at text NOT NULL
);
CREATE INDEX idx_craft_status ON craft_requests(status);

CREATE TABLE forum_categories (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	description text NOT NULL DEFAULT '',
	sort integer NOT NULL DEFAULT 0,
	access text NOT NULL DEFAULT 'member' CHECK (access IN ('public','member','officer'))
);
CREATE TABLE forum_topics (
	id text PRIMARY KEY NOT NULL,
	category_id text NOT NULL REFERENCES forum_categories(id),
	title text NOT NULL,
	user_id text NOT NULL REFERENCES users(id),
	pinned integer NOT NULL DEFAULT 0,
	locked integer NOT NULL DEFAULT 0,
	created_at text NOT NULL,
	last_post_at text NOT NULL
);
CREATE INDEX idx_topics_category ON forum_topics(category_id, pinned, last_post_at);
CREATE TABLE forum_posts (
	id text PRIMARY KEY NOT NULL,
	topic_id text NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
	user_id text NOT NULL REFERENCES users(id),
	body text NOT NULL,
	image_id text REFERENCES uploads(id) ON DELETE SET NULL,
	created_at text NOT NULL,
	edited_at text,
	removed integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_posts_topic ON forum_posts(topic_id, created_at);
CREATE TABLE forum_reads (
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	topic_id text NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
	read_at text NOT NULL,
	PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE legacy_nodes (
	id text PRIMARY KEY NOT NULL,
	tree text NOT NULL,
	name text NOT NULL,
	max_rank integer NOT NULL,
	requires text,
	effect text NOT NULL,
	sort integer NOT NULL DEFAULT 0
);
CREATE TABLE legacy_progress (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	character_id text REFERENCES characters(id) ON DELETE CASCADE,
	key text NOT NULL,
	value integer NOT NULL,
	updated_at text NOT NULL
);
CREATE UNIQUE INDEX idx_legacy_account ON legacy_progress(user_id, key) WHERE character_id IS NULL;
CREATE UNIQUE INDEX idx_legacy_character ON legacy_progress(character_id, key) WHERE character_id IS NOT NULL;
CREATE TABLE legacy_history (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	character_id text REFERENCES characters(id) ON DELETE CASCADE,
	key text NOT NULL,
	value integer NOT NULL,
	created_at text NOT NULL
);

CREATE TABLE news_items (
	guid text PRIMARY KEY NOT NULL,
	title text NOT NULL,
	link text NOT NULL,
	summary text NOT NULL DEFAULT '',
	image text NOT NULL DEFAULT '',
	published_at text NOT NULL,
	source text NOT NULL,
	is_patch integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_news_date ON news_items(published_at);
CREATE TABLE patches (
	id text PRIMARY KEY NOT NULL,
	version text NOT NULL,
	released_on text NOT NULL,
	source_name text NOT NULL,
	source_url text NOT NULL,
	status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
	created_at text NOT NULL
);
CREATE TABLE patch_changes (
	id text PRIMARY KEY NOT NULL,
	patch_id text NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
	class_id integer,
	area text NOT NULL CHECK (area IN ('class','talent','ability','item','raid','profession','general')),
	object_id integer,
	object_name text NOT NULL DEFAULT '',
	before_text text NOT NULL DEFAULT '',
	after_text text NOT NULL DEFAULT '',
	label text NOT NULL DEFAULT 'neutral' CHECK (label IN ('buff','nerf','fix','mechanic','neutral'))
);
CREATE INDEX idx_patch_changes_object ON patch_changes(area, object_id);
CREATE TABLE notifications (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	message text NOT NULL,
	link text NOT NULL DEFAULT '',
	dedupe_key text NOT NULL,
	created_at text NOT NULL,
	read_at text,
	UNIQUE (user_id, dedupe_key)
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

INSERT INTO raid_instances (id,name,size,boss_count,unlocks_on,note,source_url) VALUES
 ('barrow-deeps','Barrow Deeps',10,8,'2026-12-09','Bossnamen abgeleitet aus Legacy-Herausforderungen, von Blizzard noch nicht bestätigt.','https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement'),
 ('hyjal-summit','Hyjal Summit',20,13,'2026-12-09','Blizzard nennt 13 Bosse, aber noch keine Namen. Admins tragen sie nach, sobald sie bestätigt sind.','https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement'),
 ('onyxias-lair','Onyxias Hort',40,1,'2026-12-09','Zutritt nur mit Drachenfeuer-Amulett im Inventar.','https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement');
INSERT INTO raid_bosses (id,instance_id,name,sort,confirmed) VALUES
 ('barrow-1','barrow-deeps','Deepscar Matriarch',1,0),
 ('barrow-2','barrow-deeps','Khalith the Dreadspinner',2,0),
 ('barrow-3','barrow-deeps','Amethrax',3,0),
 ('barrow-4','barrow-deeps','Ravus and Darlissa',4,0),
 ('barrow-5','barrow-deeps','Elder Tangleclaw',5,0),
 ('barrow-6','barrow-deeps','Well of Sorrow',6,0),
 ('barrow-7','barrow-deeps','Del''lynar Songwood',7,0),
 ('barrow-8','barrow-deeps','Sonya Darkhallow',8,0),
 ('onyxia','onyxias-lair','Onyxia',1,1);

INSERT INTO forum_categories (id,name,description,sort,access) VALUES
 ('announcements','Gildenankündigungen','Wichtiges von der Gildenleitung.',1,'member'),
 ('general','Allgemeine Diskussionen','Alles rund um Gilde und Azeroth.',2,'member'),
 ('raids','Raidplanung','Taktiken, Aufstellungen und Absprachen.',3,'member'),
 ('classes','Klassen und Talente','Builds, Rotationen und Fragen.',4,'member'),
 ('guides','Guides und Tipps','Wissen aus der Gilde für die Gilde.',5,'member'),
 ('trade','Berufe und Handel','Rezepte, Materialien und Tausch.',6,'member'),
 ('applications','Bewerbungen','Stell dich der Gilde vor. Für Gäste lesbar.',7,'public'),
 ('feedback','Vorschläge und Feedback','Ideen für Gilde und Webseite.',8,'member');

INSERT INTO legacy_nodes (id,tree,name,max_rank,requires,effect,sort) VALUES
 ('master-chef','Berufe','Master Chef',5,NULL,'Kochrezepte erzeugen mit 10 bis 50 % Chance ein zusätzliches Ergebnis.',1),
 ('working-overtime','Berufe','Working Overtime',5,NULL,'Erhöht die Chance auf Berufspunkte um 4 bis 20 %.',2),
 ('bartering','Berufe','Bartering',2,NULL,'Senkt Händlerpreise um 5 % pro Rang.',3),
 ('dedicated-study','Berufe','Dedicated Study',1,'bartering','Fähigkeit: erhöht den niedrigsten Beruf um 1 (23 Stunden Abklingzeit).',4),
 ('bountiful-harvest','Berufe','Bountiful Harvest',5,NULL,'Erhöht die Chance auf seltene Sammelmaterialien um 20 % pro Rang.',5),
 ('performance-bonus','Berufe','Performance Bonus',3,'bountiful-harvest','5 bis 15 % Chance auf doppelte Händlergunst bei Lieferkisten.',6),
 ('luremaster','Berufe','Luremaster',2,NULL,'Mit Köder 25 oder 50 % Chance auf einen zusätzlichen Fisch.',7),
 ('high-alert','Abenteuer','High Alert',2,NULL,'Verbessert die Tarnungserkennung um 1 bis 2 Stufen.',1),
 ('well-rested','Abenteuer','Well Rested',5,NULL,'Erholungs-EP bauen sich 4 % pro Rang schneller auf, die Obergrenze steigt entsprechend.',2),
 ('talented','Abenteuer','Talented',5,'well-rested','Talentpunkte beginnen ab Stufe 9 (Rang 1) bis Stufe 5 (Rang 5). Maximum bleibt 51.',3),
 ('thrill-of-adventure','Abenteuer','Thrill of Adventure',5,NULL,'Tötung stellt 1 bis 5 % Leben und Mana über 10 Sekunden her. Nicht in Instanzen.',4),
 ('field-guide','Abenteuer','Field Guide',3,NULL,'Verkürzt die Abklingzeit beim Lagerausbau um 8 bis 25 %.',5),
 ('frequent-flier','Abenteuer','Frequent Flier',1,'field-guide','Flugrouten 50 % günstiger, Flugtier 20 % schneller.',6),
 ('field-medicine','Abenteuer','Field Medicine',2,NULL,'Verkürzt „Kürzlich verbunden“ um 5 oder 10 Sekunden.',7),
 ('for-great-honor','Findigkeit','For Great Honor',5,NULL,'Erhöht gewonnene Ehre um 2 % pro Rang.',1),
 ('gourmand','Findigkeit','Gourmand',3,NULL,'Verlängert Nahrungsboni um 33 bis 100 %.',2),
 ('permanence','Findigkeit','Permanence',2,'gourmand','Verlängert lange Gruppenboni und Lagerboni um 50 oder 100 %.',3),
 ('quick-and-dead','Findigkeit','The Quick and the Dead',2,NULL,'Schneller als Geist, nach der Wiederbelebung kurz kostenlose Fähigkeiten.',4),
 ('reagent-economy','Findigkeit','Reagent Economy',1,'quick-and-dead','Klassenfähigkeiten brauchen keine Händler-Reagenzien mehr.',5),
 ('reinforce','Findigkeit','Reinforce',5,NULL,'Senkt Haltbarkeitsverlust beim Tod um 8 % pro Rang.',6),
 ('diplomat','Findigkeit','Diplomat',5,NULL,'Erhöht Rufgewinne um 2 % pro Rang.',7);
