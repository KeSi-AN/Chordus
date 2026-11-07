CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`key` text,
	`key_confidence` real,
	`bpm` real,
	`chord_timeline` text,
	`melody_low_midi` real,
	`melody_high_midi` real,
	`melody_p10_midi` real,
	`melody_p90_midi` real,
	`vocal_stem_path` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analyses_song_idx` ON `analyses` (`song_id`);--> statement-breakpoint
CREATE TABLE `chord_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`chordpro` text NOT NULL,
	`origin` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chord_sheets_song_idx` ON `chord_sheets` (`song_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`song_id` text,
	`type` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `events_user_created_idx` ON `events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_song_idx` ON `events` (`song_id`);--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `song_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`transpose_semitones` integer DEFAULT 0 NOT NULL,
	`transpose_state` text DEFAULT 'suggested' NOT NULL,
	`audio_pitch_semitones` integer DEFAULT 0 NOT NULL,
	`audio_pitch_state` text DEFAULT 'suggested' NOT NULL,
	`pitch_linked` integer DEFAULT true NOT NULL,
	`capo_fret` integer DEFAULT 0 NOT NULL,
	`capo_state` text DEFAULT 'suggested' NOT NULL,
	`strum_pattern_id` text,
	`strum_state` text DEFAULT 'suggested' NOT NULL,
	`suggestion_meta` text,
	`confirmed_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`strum_pattern_id`) REFERENCES `strum_patterns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_prefs_user_song_idx` ON `song_prefs` (`user_id`,`song_id`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text DEFAULT '' NOT NULL,
	`original_key` text,
	`bpm` real,
	`time_signature` text DEFAULT '4/4' NOT NULL,
	`duration_sec` real,
	`vocalist_hint` text DEFAULT 'unknown' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `songs_user_idx` ON `songs` (`user_id`);--> statement-breakpoint
CREATE INDEX `songs_artist_idx` ON `songs` (`artist`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`kind` text NOT NULL,
	`youtube_video_id` text,
	`file_path` text,
	`original_filename` text,
	`mime_type` text,
	`license` text,
	`attribution` text,
	`source_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sources_song_idx` ON `sources` (`song_id`);--> statement-breakpoint
CREATE INDEX `sources_yt_idx` ON `sources` (`youtube_video_id`);--> statement-breakpoint
CREATE TABLE `strum_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`time_signature` text NOT NULL,
	`subdivision` integer NOT NULL,
	`pattern` text NOT NULL,
	`is_preset` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`comfort_low_midi` real,
	`comfort_high_midi` real,
	`max_low_midi` real,
	`max_high_midi` real,
	`confidence` real DEFAULT 0 NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
