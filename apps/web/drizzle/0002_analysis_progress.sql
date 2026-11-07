ALTER TABLE `analyses` ADD `stage` text;--> statement-breakpoint
ALTER TABLE `analyses` ADD `progress` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `analyses` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `error` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `updated_at` integer DEFAULT 0 NOT NULL;