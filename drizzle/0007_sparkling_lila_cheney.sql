CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(64) NOT NULL,
	`email` varchar(320),
	`loyaltyNumber` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_phone_unique` UNIQUE(`phone`),
	CONSTRAINT `customers_loyaltyNumber_unique` UNIQUE(`loyaltyNumber`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`cashierUserId` int NOT NULL,
	`openedByUserId` int NOT NULL,
	`closedByUserId` int,
	`openingCash` decimal(14,2) NOT NULL DEFAULT '0.00',
	`expectedCash` decimal(14,2) NOT NULL DEFAULT '0.00',
	`declaredCash` decimal(14,2),
	`variance` decimal(14,2),
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`notes` varchar(500),
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfer_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transferId` int NOT NULL,
	`sourceProductId` int NOT NULL,
	`targetProductId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unitCost` decimal(12,2) NOT NULL,
	CONSTRAINT `stock_transfer_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceStoreId` int NOT NULL,
	`targetStoreId` int NOT NULL,
	`requestedByUserId` int NOT NULL,
	`status` enum('completed','cancelled') NOT NULL DEFAULT 'completed',
	`notes` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `barcodes` DROP INDEX `barcodes_value_unique`;--> statement-breakpoint
ALTER TABLE `stores` MODIFY COLUMN `type` enum('cosmetics','bookstore','clothing','gifts','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `sales` ADD `shiftId` int;--> statement-breakpoint
ALTER TABLE `stores` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `barcodes` ADD CONSTRAINT `barcodes_product_value_unique` UNIQUE(`productId`,`value`);--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_cashierUserId_users_id_fk` FOREIGN KEY (`cashierUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_openedByUserId_users_id_fk` FOREIGN KEY (`openedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_closedByUserId_users_id_fk` FOREIGN KEY (`closedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfer_lines` ADD CONSTRAINT `stock_transfer_lines_transferId_stock_transfers_id_fk` FOREIGN KEY (`transferId`) REFERENCES `stock_transfers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfer_lines` ADD CONSTRAINT `stock_transfer_lines_sourceProductId_products_id_fk` FOREIGN KEY (`sourceProductId`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfer_lines` ADD CONSTRAINT `stock_transfer_lines_targetProductId_products_id_fk` FOREIGN KEY (`targetProductId`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_sourceStoreId_stores_id_fk` FOREIGN KEY (`sourceStoreId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_targetStoreId_stores_id_fk` FOREIGN KEY (`targetStoreId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_requestedByUserId_users_id_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `shifts_store_status_idx` ON `shifts` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `shifts_cashier_status_idx` ON `shifts` (`cashierUserId`,`status`);--> statement-breakpoint
CREATE INDEX `stock_transfer_lines_transfer_idx` ON `stock_transfer_lines` (`transferId`);--> statement-breakpoint
CREATE INDEX `stock_transfer_lines_source_product_idx` ON `stock_transfer_lines` (`sourceProductId`);--> statement-breakpoint
CREATE INDEX `stock_transfer_lines_target_product_idx` ON `stock_transfer_lines` (`targetProductId`);--> statement-breakpoint
CREATE INDEX `stock_transfers_source_created_idx` ON `stock_transfers` (`sourceStoreId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `stock_transfers_target_created_idx` ON `stock_transfers` (`targetStoreId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_shiftId_shifts_id_fk` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `barcodes_value_idx` ON `barcodes` (`value`);--> statement-breakpoint
CREATE INDEX `sales_customer_idx` ON `sales` (`customerId`);--> statement-breakpoint
CREATE INDEX `sales_shift_idx` ON `sales` (`shiftId`);