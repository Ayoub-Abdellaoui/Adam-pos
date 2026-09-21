CREATE TABLE `user_branch_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storeId` int NOT NULL,
	`role` enum('admin','cashier','stock_manager','supervisor') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_branch_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_branch_roles_user_store_unique` UNIQUE(`userId`,`storeId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','admin','cashier','stock_manager','supervisor') NOT NULL DEFAULT 'cashier';--> statement-breakpoint
ALTER TABLE `user_branch_roles` ADD CONSTRAINT `user_branch_roles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_branch_roles` ADD CONSTRAINT `user_branch_roles_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO `user_branch_roles` (`userId`, `storeId`, `role`)
SELECT `id`, `storeId`, `role` FROM `users`
WHERE `storeId` IS NOT NULL AND `role` IN ('admin','cashier','stock_manager','supervisor')
ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);--> statement-breakpoint
UPDATE `users` SET `role` = 'super_admin', `storeId` = NULL
WHERE `role` = 'admin' AND `storeId` IS NULL;--> statement-breakpoint
CREATE INDEX `user_branch_roles_store_role_idx` ON `user_branch_roles` (`storeId`,`role`);--> statement-breakpoint
CREATE INDEX `user_branch_roles_user_idx` ON `user_branch_roles` (`userId`);
