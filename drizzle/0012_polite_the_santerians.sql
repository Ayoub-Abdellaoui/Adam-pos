ALTER TABLE `sales` MODIFY COLUMN `paymentMethod` enum('cash','card','mobile','credit','other') NOT NULL DEFAULT 'cash';--> statement-breakpoint
ALTER TABLE `customers` ADD `firstName` varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `lastName` varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `totalDebt` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `amountPaid` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `remainingDebt` decimal(14,2) DEFAULT '0.00' NOT NULL;