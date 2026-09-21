ALTER TABLE `products` ADD `profitMarginPercent` decimal(9,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier_invoice_lines` ADD `sellingPrice` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier_invoice_lines` ADD `profitMarginPercent` decimal(9,2) DEFAULT '0.00' NOT NULL;