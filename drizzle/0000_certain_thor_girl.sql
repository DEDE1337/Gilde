CREATE TABLE `guild_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL
);
