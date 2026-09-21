CREATE TABLE `return_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`returnId` int NOT NULL,
	`saleLineId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitRefund` decimal(12,2) NOT NULL,
	`lineTotal` decimal(14,2) NOT NULL,
	CONSTRAINT `return_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sale_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saleId` int NOT NULL,
	`productId` int NOT NULL,
	`storeId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal(12,2) NOT NULL,
	`unitDiscount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`lineTotal` decimal(14,2) NOT NULL,
	CONSTRAINT `sale_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sale_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saleId` int NOT NULL,
	`storeId` int NOT NULL,
	`cashierUserId` int NOT NULL,
	`reason` varchar(500),
	`totalRefund` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sale_returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`cashierUserId` int NOT NULL,
	`receiptNumber` varchar(64) NOT NULL,
	`paymentMethod` enum('cash','card','mobile','other') NOT NULL DEFAULT 'cash',
	`subtotal` decimal(14,2) NOT NULL,
	`discountTotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_receiptNumber_unique` UNIQUE(`receiptNumber`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `retailPrice` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `return_lines` ADD CONSTRAINT `return_lines_returnId_sale_returns_id_fk` FOREIGN KEY (`returnId`) REFERENCES `sale_returns`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `return_lines` ADD CONSTRAINT `return_lines_saleLineId_sale_lines_id_fk` FOREIGN KEY (`saleLineId`) REFERENCES `sale_lines`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `return_lines` ADD CONSTRAINT `return_lines_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_lines` ADD CONSTRAINT `sale_lines_saleId_sales_id_fk` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_lines` ADD CONSTRAINT `sale_lines_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_lines` ADD CONSTRAINT `sale_lines_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_returns` ADD CONSTRAINT `sale_returns_saleId_sales_id_fk` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_returns` ADD CONSTRAINT `sale_returns_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_returns` ADD CONSTRAINT `sale_returns_cashierUserId_users_id_fk` FOREIGN KEY (`cashierUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_cashierUserId_users_id_fk` FOREIGN KEY (`cashierUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `return_lines_return_idx` ON `return_lines` (`returnId`);--> statement-breakpoint
CREATE INDEX `return_lines_sale_line_idx` ON `return_lines` (`saleLineId`);--> statement-breakpoint
CREATE INDEX `sale_lines_sale_idx` ON `sale_lines` (`saleId`);--> statement-breakpoint
CREATE INDEX `sale_lines_product_idx` ON `sale_lines` (`productId`);--> statement-breakpoint
CREATE INDEX `sale_returns_store_created_idx` ON `sale_returns` (`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `sale_returns_sale_idx` ON `sale_returns` (`saleId`);--> statement-breakpoint
CREATE INDEX `sales_store_created_idx` ON `sales` (`storeId`,`createdAt`);