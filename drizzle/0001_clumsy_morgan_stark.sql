CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`kind` text NOT NULL,
	`to_phone` text NOT NULL,
	`status` text NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_appointment_idx` ON `notifications` (`appointment_id`);--> statement-breakpoint
ALTER TABLE `barbers` ADD `notify_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `owner_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `notify_owner_all` integer DEFAULT false NOT NULL;