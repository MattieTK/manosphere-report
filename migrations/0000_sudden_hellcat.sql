CREATE TABLE `episode_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`summary` text NOT NULL,
	`tags` text NOT NULL,
	`themes` text NOT NULL,
	`sentiment` text,
	`key_quotes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_analyses_episode_id_unique` ON `episode_analyses` (`episode_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`podcast_id` text NOT NULL,
	`title` text NOT NULL,
	`guid` text NOT NULL,
	`audio_url` text NOT NULL,
	`r2_key` text,
	`published_at` integer NOT NULL,
	`duration_seconds` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`workflow_id` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`podcast_id`) REFERENCES `podcasts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_episodes_podcast_id` ON `episodes` (`podcast_id`);--> statement-breakpoint
CREATE INDEX `idx_episodes_guid` ON `episodes` (`guid`);--> statement-breakpoint
CREATE INDEX `idx_episodes_status` ON `episodes` (`status`);--> statement-breakpoint
CREATE TABLE `podcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`feed_url` text NOT NULL,
	`image_url` text,
	`description` text,
	`added_at` integer NOT NULL,
	`last_polled_at` integer,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `podcasts_feed_url_unique` ON `podcasts` (`feed_url`);--> statement-breakpoint
CREATE TABLE `transcript_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`segment_index` integer NOT NULL,
	`text` text NOT NULL,
	`start_time` real NOT NULL,
	`end_time` real NOT NULL,
	`words` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transcript_segments_episode` ON `transcript_segments` (`episode_id`,`segment_index`);--> statement-breakpoint
CREATE TABLE `weekly_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` integer NOT NULL,
	`week_end` integer NOT NULL,
	`analysis` text NOT NULL,
	`trending_topics` text NOT NULL,
	`episode_ids` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_weekly_analyses_week_end` ON `weekly_analyses` (`week_end`);