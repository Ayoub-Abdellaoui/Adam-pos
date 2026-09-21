CREATE TABLE `quick_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`keyCharacter` varchar(1) NOT NULL,
	`productId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quick_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `quick_keys_store_key_unique` UNIQUE(`storeId`,`keyCharacter`),
	CONSTRAINT `quick_keys_store_product_unique` UNIQUE(`storeId`,`productId`)
);
--> statement-breakpoint
ALTER TABLE `quick_keys` ADD CONSTRAINT `quick_keys_storeId_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quick_keys` ADD CONSTRAINT `quick_keys_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `quick_keys_store_idx` ON `quick_keys` (`storeId`);