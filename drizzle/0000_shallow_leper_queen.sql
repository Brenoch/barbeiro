CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`barber_id` text,
	`display_name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_idx` ON `accounts` (`username`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`client` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`service_id` text NOT NULL,
	`barber_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`payment_method` text,
	`auto_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `appointments_date_idx` ON `appointments` (`date`);--> statement-breakpoint
CREATE INDEX `appointments_barber_idx` ON `appointments` (`barber_id`);--> statement-breakpoint
CREATE TABLE `availability` (
	`id` text PRIMARY KEY NOT NULL,
	`barber_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`start` text DEFAULT '09:00' NOT NULL,
	`end` text DEFAULT '18:00' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_barber_weekday_idx` ON `availability` (`barber_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `barbers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`specialty` text DEFAULT '' NOT NULL,
	`photo` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`barber_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocks_lookup_idx` ON `blocks` (`barber_id`,`date`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_phone_idx` ON `clients` (`phone`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`duration` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`account_id` text,
	`client_id` text,
	`display_name` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_idx` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_account_idx` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE TABLE `shop_settings` (
	`id` text PRIMARY KEY DEFAULT 'shop' NOT NULL,
	`shop_name` text DEFAULT 'Bart do Corte' NOT NULL,
	`neighborhood` text DEFAULT 'Campo Grande · RJ' NOT NULL
);
