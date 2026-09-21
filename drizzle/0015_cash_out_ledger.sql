CREATE TABLE `cash_outs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`shiftId` int NOT NULL,
	`category` enum('employee_advance','store_operations') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`recipientUserId` int,
	`recordedByUserId` int NOT NULL,
	`notes` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_outs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cash_outs` ADD CONSTRAINT `cash_outs_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_outs` ADD CONSTRAINT `cash_outs_shiftId_shifts_id_fk` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_outs` ADD CONSTRAINT `cash_outs_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_outs` ADD CONSTRAINT `cash_outs_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_outs_store_created_idx` ON `cash_outs` (`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cash_outs_shift_created_idx` ON `cash_outs` (`shiftId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cash_outs_recipient_created_idx` ON `cash_outs` (`recipientUserId`,`createdAt`);