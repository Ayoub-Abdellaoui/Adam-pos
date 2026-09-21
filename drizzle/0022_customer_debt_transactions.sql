CREATE TABLE `customer_debt_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`storeId` int,
	`customer_debt_transaction_type` enum('payment','manual_debt') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`note` text,
	`balanceAfter` decimal(14,2) NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_debt_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customer_debt_transactions` ADD CONSTRAINT `customer_debt_transactions_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_debt_transactions` ADD CONSTRAINT `customer_debt_transactions_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_debt_transactions` ADD CONSTRAINT `customer_debt_transactions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_debt_transactions_customer_store_created_idx` ON `customer_debt_transactions` (`customerId`,`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `customer_debt_transactions_store_created_idx` ON `customer_debt_transactions` (`storeId`,`createdAt`);