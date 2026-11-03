CREATE TABLE `wowhead_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text,
	`fetched_at` integer,
	`checked_at` integer NOT NULL,
	`error` text
);
