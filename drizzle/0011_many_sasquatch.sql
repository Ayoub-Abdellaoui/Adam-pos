CREATE TABLE `supplier_invoice_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`productId` int NOT NULL,
	`storeId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unitCost` decimal(12,2) NOT NULL,
	`lineTotal` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_invoice_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_payment_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_payment_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`storeId` int,
	`recordedByUserId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`paymentMethod` enum('cash','card','bank_transfer','mobile','other') NOT NULL DEFAULT 'cash',
	`reference` varchar(128),
	`notes` varchar(500),
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `totalAmount` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `amountPaid` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `remainingDebt` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `currentDebt` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier_invoice_lines` ADD CONSTRAINT `supplier_invoice_lines_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_invoice_lines` ADD CONSTRAINT `supplier_invoice_lines_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_invoice_lines` ADD CONSTRAINT `supplier_invoice_lines_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payment_allocations` ADD CONSTRAINT `supplier_payment_allocations_paymentId_supplier_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `supplier_payments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payment_allocations` ADD CONSTRAINT `supplier_payment_allocations_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_invoice_lines_invoice_idx` ON `supplier_invoice_lines` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `supplier_invoice_lines_product_idx` ON `supplier_invoice_lines` (`productId`);--> statement-breakpoint
CREATE INDEX `supplier_invoice_lines_store_idx` ON `supplier_invoice_lines` (`storeId`);--> statement-breakpoint
CREATE INDEX `supplier_payment_allocations_payment_idx` ON `supplier_payment_allocations` (`paymentId`);--> statement-breakpoint
CREATE INDEX `supplier_payment_allocations_invoice_idx` ON `supplier_payment_allocations` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `supplier_payments_supplier_paid_idx` ON `supplier_payments` (`supplierId`,`paidAt`);--> statement-breakpoint
CREATE INDEX `supplier_payments_store_paid_idx` ON `supplier_payments` (`storeId`,`paidAt`);