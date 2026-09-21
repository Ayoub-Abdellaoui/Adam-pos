CREATE TABLE `operational_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`recordedByUserId` int NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` varchar(500) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`paymentMethod` enum('cash','card','bank_transfer','mobile','other') NOT NULL DEFAULT 'cash',
	`status` enum('posted','voided') NOT NULL DEFAULT 'posted',
	`occurredAt` timestamp NOT NULL,
	`voidedAt` timestamp,
	`voidedByUserId` int,
	`voidReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operational_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_invoice_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`storeId` int NOT NULL,
	`recordedByUserId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`paymentMethod` enum('cash','card','bank_transfer','mobile','other') NOT NULL DEFAULT 'cash',
	`reference` varchar(128),
	`notes` varchar(500),
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_invoice_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `supplierReference` varchar(128);--> statement-breakpoint
ALTER TABLE `invoices` ADD `dueDate` timestamp;--> statement-breakpoint
ALTER TABLE `invoices` ADD `accountingNotes` varchar(500);--> statement-breakpoint
ALTER TABLE `operational_expenses` ADD CONSTRAINT `operational_expenses_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_expenses` ADD CONSTRAINT `operational_expenses_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_expenses` ADD CONSTRAINT `operational_expenses_voidedByUserId_users_id_fk` FOREIGN KEY (`voidedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_invoice_payments` ADD CONSTRAINT `supplier_invoice_payments_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_invoice_payments` ADD CONSTRAINT `supplier_invoice_payments_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_invoice_payments` ADD CONSTRAINT `supplier_invoice_payments_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `operational_expenses_store_occurred_idx` ON `operational_expenses` (`storeId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `operational_expenses_store_status_idx` ON `operational_expenses` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `supplier_invoice_payments_invoice_idx` ON `supplier_invoice_payments` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `supplier_invoice_payments_store_paid_idx` ON `supplier_invoice_payments` (`storeId`,`paidAt`);--> statement-breakpoint
CREATE INDEX `invoices_supplier_idx` ON `invoices` (`supplierId`);