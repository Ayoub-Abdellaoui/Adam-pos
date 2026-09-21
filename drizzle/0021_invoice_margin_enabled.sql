ALTER TABLE `products` ADD `profitMarginEnabled` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `supplier_invoice_lines` ADD `profitMarginEnabled` boolean NOT NULL DEFAULT false;
