CREATE TABLE `direct_return_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`directReturnId` int NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unitRefund` decimal(12,2) NOT NULL,
	`lineTotal` decimal(14,2) NOT NULL,
	CONSTRAINT `direct_return_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `direct_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`cashierUserId` int NOT NULL,
	`returnNumber` varchar(64) NOT NULL,
	`reason` varchar(500),
	`totalRefund` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `direct_returns_id` PRIMARY KEY(`id`),
	CONSTRAINT `direct_returns_returnNumber_unique` UNIQUE(`returnNumber`)
);
--> statement-breakpoint
ALTER TABLE `sales` ADD `invoiceNumber` varchar(12);--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_invoiceNumber_unique` UNIQUE(`invoiceNumber`);--> statement-breakpoint
ALTER TABLE `direct_return_lines` ADD CONSTRAINT `direct_return_lines_directReturnId_direct_returns_id_fk` FOREIGN KEY (`directReturnId`) REFERENCES `direct_returns`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `direct_return_lines` ADD CONSTRAINT `direct_return_lines_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `direct_returns` ADD CONSTRAINT `direct_returns_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `direct_returns` ADD CONSTRAINT `direct_returns_cashierUserId_users_id_fk` FOREIGN KEY (`cashierUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `direct_return_lines_return_idx` ON `direct_return_lines` (`directReturnId`);--> statement-breakpoint
CREATE INDEX `direct_return_lines_product_idx` ON `direct_return_lines` (`productId`);--> statement-breakpoint
CREATE INDEX `direct_returns_store_created_idx` ON `direct_returns` (`storeId`,`createdAt`);