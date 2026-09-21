CREATE TABLE `invoice_exception_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`storeId` int NOT NULL,
	`sourceIndex` int NOT NULL,
	`kind` enum('missing_reference','uncertain_item','abnormal_value','unmapped_layout') NOT NULL,
	`question` varchar(500) NOT NULL,
	`decision` enum('include','exclude','edited') NOT NULL,
	`resolvedByUserId` int NOT NULL,
	`resolvedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_exception_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_review_sessions` (
	`id` varchar(64) NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`sourceFileKey` varchar(512) NOT NULL,
	`extractionPayload` longtext NOT NULL,
	`exceptionsPayload` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_review_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoice_review_sessions_source_unique` UNIQUE(`sourceFileKey`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `extractionPayload` longtext;--> statement-breakpoint
ALTER TABLE `products` ADD `reference` varchar(128);--> statement-breakpoint
ALTER TABLE `supplier_invoice_lines` ADD `reference` varchar(128);--> statement-breakpoint
ALTER TABLE `invoice_exception_decisions` ADD CONSTRAINT `invoice_exception_decisions_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_exception_decisions` ADD CONSTRAINT `invoice_exception_decisions_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_exception_decisions` ADD CONSTRAINT `invoice_exception_decisions_resolvedByUserId_users_id_fk` FOREIGN KEY (`resolvedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_review_sessions` ADD CONSTRAINT `invoice_review_sessions_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `invoice_exception_decisions_invoice_idx` ON `invoice_exception_decisions` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoice_exception_decisions_store_idx` ON `invoice_exception_decisions` (`storeId`);--> statement-breakpoint
CREATE INDEX `invoice_review_sessions_user_created_idx` ON `invoice_review_sessions` (`uploadedByUserId`,`createdAt`);