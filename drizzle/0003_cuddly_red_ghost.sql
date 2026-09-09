ALTER TABLE `appointments` ADD `service_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD `price` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD `duration` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
-- Agendamentos criados antes desta migração não tinham preço nem duração
-- congelados. Preenche uma vez com o catálogo de hoje, que é a melhor
-- aproximação disponível para o que já existia.
UPDATE `appointments`
SET
  `service_name` = COALESCE((SELECT `name` FROM `services` WHERE `services`.`id` = `appointments`.`service_id`), ''),
  `price` = COALESCE((SELECT `price` FROM `services` WHERE `services`.`id` = `appointments`.`service_id`), 0),
  `duration` = COALESCE((SELECT `duration` FROM `services` WHERE `services`.`id` = `appointments`.`service_id`), 30)
WHERE `price` = 0 AND `duration` = 30 AND `service_name` = '';