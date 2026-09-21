CREATE TABLE `barcodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`value` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `barcodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `barcodes_value_unique` UNIQUE(`value`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`supplierId` int NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`sourceFileKey` varchar(512) NOT NULL,
	`sourceMimeType` varchar(128) NOT NULL,
	`originalFileName` varchar(255) NOT NULL,
	`status` enum('committed') NOT NULL DEFAULT 'committed',
	`totalCost` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`sku` varchar(128),
	`description` text,
	`quantityOnHand` int NOT NULL DEFAULT 0,
	`lastCostPrice` decimal(12,2) NOT NULL DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_store_name_unique` UNIQUE(`storeId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `stock_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`productId` int NOT NULL,
	`storeId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitCost` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('cosmetics','bookstore','clothing') NOT NULL,
	`code` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_type_unique` UNIQUE(`type`),
	CONSTRAINT `stores_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`contactName` varchar(255),
	`phone` varchar(64),
	`email` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','cashier') NOT NULL DEFAULT 'cashier';--> statement-breakpoint
UPDATE `users` SET `role` = 'cashier' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','cashier') NOT NULL DEFAULT 'cashier';--> statement-breakpoint
ALTER TABLE `users` ADD `storeId` int;--> statement-breakpoint
ALTER TABLE `barcodes` ADD CONSTRAINT `barcodes_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_entries` ADD CONSTRAINT `stock_entries_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_entries` ADD CONSTRAINT `stock_entries_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_entries` ADD CONSTRAINT `stock_entries_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `barcodes_product_idx` ON `barcodes` (`productId`);--> statement-breakpoint
CREATE INDEX `invoices_store_created_idx` ON `invoices` (`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `products_store_idx` ON `products` (`storeId`);--> statement-breakpoint
CREATE INDEX `stock_entries_store_created_idx` ON `stock_entries` (`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `stock_entries_product_idx` ON `stock_entries` (`productId`);--> statement-breakpoint
CREATE INDEX `stock_entries_invoice_idx` ON `stock_entries` (`invoiceId`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `users_store_idx` ON `users` (`storeId`);
