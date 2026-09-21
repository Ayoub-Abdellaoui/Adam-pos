import {
  boolean,
  decimal,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Retail branches are first-class entities. Every operational inventory record
 * refers to exactly one store, preventing cross-branch stock visibility.
 */
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  type: mysqlEnum("type", ["cosmetics", "bookstore", "clothing", "gifts", "other"]).notNull(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * `role` is now only a global Super Admin marker or a legacy migration value.
 * Operational roles live in `userBranchRoles`, allowing one identity to carry
 * a different role at each assigned branch.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["super_admin", "admin", "cashier", "stock_manager", "supervisor"]).default("cashier").notNull(),
    storeId: int("storeId").references(() => stores.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [index("users_store_idx").on(table.storeId)]
);

/**
 * A single staff identity can hold a different operational role at each branch.
 * Super Admin is intentionally excluded: it is a global role held on `users`.
 */
export const userBranchRoles = mysqlTable(
  "user_branch_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    role: mysqlEnum("role", ["admin", "cashier", "stock_manager", "supervisor"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("user_branch_roles_user_store_unique").on(table.userId, table.storeId),
    index("user_branch_roles_store_role_idx").on(table.storeId, table.role),
    index("user_branch_roles_user_idx").on(table.userId),
  ]
);

/**
 * Locally managed employee credentials are intentionally separate from OAuth
 * identities. Passwords are stored only as server-generated scrypt hashes.
 */
export const localCredentials = mysqlTable(
  "local_credentials",
  {
    userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("firstName", { length: 100 }).notNull(),
    lastName: varchar("lastName", { length: 100 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("local_credentials_email_unique").on(table.email)]
);

/** Suppliers are shared vendors that can supply one or many retail branches. */
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  contactName: varchar("contactName", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  /** Cached enterprise-wide payable balance, maintained only by supplier invoice/payment transactions. */
  currentDebt: decimal("currentDebt", { precision: 14, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Product catalog records are branch-specific, including the on-hand balance. */
export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 128 }),
    reference: varchar("reference", { length: 128 }),
    category: varchar("category", { length: 120 }),
    variations: text("variations"),
    description: text("description"),
    quantityOnHand: int("quantityOnHand").notNull().default(0),
    lastCostPrice: decimal("lastCostPrice", { precision: 12, scale: 2 }).notNull().default("0.00"),
    retailPrice: decimal("retailPrice", { precision: 12, scale: 2 }).notNull().default("0.00"),
    /** Current pricing policy used to derive the retail price from the most recent purchase cost. */
    profitMarginPercent: decimal("profitMarginPercent", { precision: 9, scale: 2 }).notNull().default("0.00"),
    profitMarginEnabled: boolean("profitMarginEnabled").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("products_store_name_unique").on(table.storeId, table.name),
    index("products_store_idx").on(table.storeId),
  ]
);

/** A product may have multiple supplier, packaging, or legacy scanner barcodes. */
export const barcodes = mysqlTable(
  "barcodes",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("barcodes_product_idx").on(table.productId), uniqueIndex("barcodes_product_value_unique").on(table.productId, table.value), index("barcodes_value_idx").on(table.value)]
);

/** Branch-scoped POS keyboard mappings shared across cashier devices. */
export const quickKeys = mysqlTable(
  "quick_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
    keyCharacter: varchar("keyCharacter", { length: 1 }).notNull(),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("quick_keys_store_key_unique").on(table.storeId, table.keyCharacter), uniqueIndex("quick_keys_store_product_unique").on(table.storeId, table.productId), index("quick_keys_store_idx").on(table.storeId)]
);

/** A global customer record can be recognized at every active retail branch. */
export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    firstName: varchar("firstName", { length: 120 }).notNull().default(""),
    lastName: varchar("lastName", { length: 120 }).notNull().default(""),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 64 }).notNull().unique(),
    email: varchar("email", { length: 320 }),
    loyaltyNumber: varchar("loyaltyNumber", { length: 64 }).unique(),
    totalDebt: decimal("totalDebt", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("customers_name_idx").on(table.name)]
);

/** Immutable payment and manual-debt events that reconcile the customer's live total debt. */
export const customerDebtTransactions = mysqlTable(
  "customer_debt_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customerId").notNull().references(() => customers.id, { onDelete: "restrict" }),
    storeId: int("storeId").references(() => stores.id, { onDelete: "set null" }),
    transactionType: mysqlEnum("customer_debt_transaction_type", ["payment", "manual_debt", "return_credit"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    balanceAfter: decimal("balanceAfter", { precision: 14, scale: 2 }).notNull(),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("customer_debt_transactions_customer_store_created_idx").on(table.customerId, table.storeId, table.createdAt),
    index("customer_debt_transactions_store_created_idx").on(table.storeId, table.createdAt),
  ]
);

/** Supervisors open and reconcile cashier shifts at a specific operational branch. */
export const shifts = mysqlTable(
  "shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    cashierUserId: int("cashierUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    openedByUserId: int("openedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    closedByUserId: int("closedByUserId").references(() => users.id, { onDelete: "restrict" }),
    openingCash: decimal("openingCash", { precision: 14, scale: 2 }).notNull().default("0.00"),
    expectedCash: decimal("expectedCash", { precision: 14, scale: 2 }).notNull().default("0.00"),
    declaredCash: decimal("declaredCash", { precision: 14, scale: 2 }),
    variance: decimal("variance", { precision: 14, scale: 2 }),
    status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt"),
    notes: varchar("notes", { length: 500 }),
  },
  table => [index("shifts_store_status_idx").on(table.storeId, table.status), index("shifts_cashier_status_idx").on(table.cashierUserId, table.status)]
);

/** Cash physically removed from a branch drawer during an open shift, including employee advances and petty cash. */
export const cashOuts = mysqlTable(
  "cash_outs",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    shiftId: int("shiftId").notNull().references(() => shifts.id, { onDelete: "restrict" }),
    category: mysqlEnum("category", ["employee_advance", "store_operations"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    recipientUserId: int("recipientUserId").references(() => users.id, { onDelete: "restrict" }),
    recordedByUserId: int("recordedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    notes: varchar("notes", { length: 500 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("cash_outs_store_created_idx").on(table.storeId, table.createdAt),
    index("cash_outs_shift_created_idx").on(table.shiftId, table.createdAt),
    index("cash_outs_recipient_created_idx").on(table.recipientUserId, table.createdAt),
  ]
);

/**
 * An invoice becomes permanent only at commit. The uploaded source remains in
 * managed object storage; database rows keep only its key and metadata.
 */
export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    supplierId: int("supplierId").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    sourceFileKey: varchar("sourceFileKey", { length: 512 }).notNull(),
    sourceMimeType: varchar("sourceMimeType", { length: 128 }).notNull(),
    originalFileName: varchar("originalFileName", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["committed"]).notNull().default("committed"),
    /** Inventory-cost total used for stock valuation and gross-profit calculations. */
    totalCost: decimal("totalCost", { precision: 14, scale: 2 }).notNull(),
    /** Supplier-stated payable amount, which may include freight, tax, or other invoice-level adjustments. */
    totalAmount: decimal("totalAmount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    /** Aggregate paid allocation, maintained transactionally as payments are registered. */
    amountPaid: decimal("amountPaid", { precision: 14, scale: 2 }).notNull().default("0.00"),
    /** Outstanding payable amount, maintained transactionally and used for Accounts Payable aggregation. */
    remainingDebt: decimal("remainingDebt", { precision: 14, scale: 2 }).notNull().default("0.00"),
    /** Optional supplier-issued reference maintained after receiving stock. */
    supplierReference: varchar("supplierReference", { length: 128 }),
    /** Planned settlement date used for Accounts Payable ageing; no payment state is duplicated here. */
    dueDate: timestamp("dueDate"),
    accountingNotes: varchar("accountingNotes", { length: 500 }),
    /** Immutable JSON snapshot of the schema-locked extraction and submitted staging review. */
    extractionPayload: longtext("extractionPayload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("invoices_store_created_idx").on(table.storeId, table.createdAt), index("invoices_supplier_idx").on(table.supplierId)]
);

/**
 * Immutable line snapshots preserve the received product reference, quantity,
 * unit cost, and line total even if the catalog changes later.
 */
export const supplierInvoiceLines = mysqlTable(
  "supplier_invoice_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "restrict" }),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    productName: varchar("productName", { length: 255 }).notNull(),
    reference: varchar("reference", { length: 128 }),
    quantity: int("quantity").notNull(),
    unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull(),
    /** Immutable receipt-time selling price and markup percentage for invoice auditability. */
    sellingPrice: decimal("sellingPrice", { precision: 12, scale: 2 }).notNull().default("0.00"),
    profitMarginPercent: decimal("profitMarginPercent", { precision: 9, scale: 2 }).notNull().default("0.00"),
    profitMarginEnabled: boolean("profitMarginEnabled").notNull().default(false),
    lineTotal: decimal("lineTotal", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("supplier_invoice_lines_invoice_idx").on(table.invoiceId), index("supplier_invoice_lines_product_idx").on(table.productId), index("supplier_invoice_lines_store_idx").on(table.storeId)]
);

/** Every non-standard parser result requires an explicit user decision before its invoice is committed. */
export const invoiceExceptionDecisions = mysqlTable(
  "invoice_exception_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    sourceIndex: int("sourceIndex").notNull(),
    kind: mysqlEnum("kind", ["missing_reference", "uncertain_item", "abnormal_value", "unmapped_layout"]).notNull(),
    question: varchar("question", { length: 500 }).notNull(),
    decision: mysqlEnum("decision", ["include", "exclude", "edited"]).notNull(),
    resolvedByUserId: int("resolvedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolvedAt").defaultNow().notNull(),
  },
  table => [index("invoice_exception_decisions_invoice_idx").on(table.invoiceId), index("invoice_exception_decisions_store_idx").on(table.storeId)]
);

/** Short-lived server-side extraction record used to enforce review of every detected invoice exception before commit. */
export const invoiceReviewSessions = mysqlTable(
  "invoice_review_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    sourceFileKey: varchar("sourceFileKey", { length: 512 }).notNull(),
    extractionPayload: longtext("extractionPayload").notNull(),
    exceptionsPayload: longtext("exceptionsPayload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("invoice_review_sessions_user_created_idx").on(table.uploadedByUserId, table.createdAt), uniqueIndex("invoice_review_sessions_source_unique").on(table.sourceFileKey)]
);

/**
 * Supplier-level payment ledger. A payment may be allocated across one or more
 * supplier invoices, while still remaining a single timestamped payment event.
 */
export const supplierPayments = mysqlTable(
  "supplier_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplierId").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    storeId: int("storeId").references(() => stores.id, { onDelete: "restrict" }),
    recordedByUserId: int("recordedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "bank_transfer", "mobile", "other"]).notNull().default("cash"),
    reference: varchar("reference", { length: 128 }),
    notes: varchar("notes", { length: 500 }),
    paidAt: timestamp("paidAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("supplier_payments_supplier_paid_idx").on(table.supplierId, table.paidAt), index("supplier_payments_store_paid_idx").on(table.storeId, table.paidAt)]
);

/** Allocation records make each supplier payment auditable against the paid invoice line of business. */
export const supplierPaymentAllocations = mysqlTable(
  "supplier_payment_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentId: int("paymentId").notNull().references(() => supplierPayments.id, { onDelete: "restrict" }),
    invoiceId: int("invoiceId").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("supplier_payment_allocations_payment_idx").on(table.paymentId), index("supplier_payment_allocations_invoice_idx").on(table.invoiceId)]
);

/**
 * Immutable supplier-payment events. The outstanding invoice balance is always
 * calculated from the committed invoice cost less this auditable payment ledger.
 */
export const supplierInvoicePayments = mysqlTable(
  "supplier_invoice_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    recordedByUserId: int("recordedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "bank_transfer", "mobile", "other"]).notNull().default("cash"),
    reference: varchar("reference", { length: 128 }),
    notes: varchar("notes", { length: 500 }),
    paidAt: timestamp("paidAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("supplier_invoice_payments_invoice_idx").on(table.invoiceId), index("supplier_invoice_payments_store_paid_idx").on(table.storeId, table.paidAt)]
);

/**
 * Auditable branch operating costs. Voiding preserves the ledger while removing
 * a record from True Net Profit calculations and the active expense total.
 */
export const operationalExpenses = mysqlTable(
  "operational_expenses",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    recordedByUserId: int("recordedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    category: varchar("category", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "bank_transfer", "mobile", "other"]).notNull().default("cash"),
    status: mysqlEnum("status", ["posted", "voided"]).notNull().default("posted"),
    occurredAt: timestamp("occurredAt").notNull(),
    voidedAt: timestamp("voidedAt"),
    voidedByUserId: int("voidedByUserId").references(() => users.id, { onDelete: "restrict" }),
    voidReason: varchar("voidReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("operational_expenses_store_occurred_idx").on(table.storeId, table.occurredAt), index("operational_expenses_store_status_idx").on(table.storeId, table.status)]
);

/** Every incoming line produces a stock entry and updates the product balance atomically. */
export const stockEntries = mysqlTable(
  "stock_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "restrict" }),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    quantity: int("quantity").notNull(),
    unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("stock_entries_store_created_idx").on(table.storeId, table.createdAt),
    index("stock_entries_product_idx").on(table.productId),
    index("stock_entries_invoice_idx").on(table.invoiceId),
  ]
);

/** A completed branch sale is the durable receipt used for customer returns. */
export const sales = mysqlTable(
  "sales",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    cashierUserId: int("cashierUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    customerId: int("customerId").references(() => customers.id, { onDelete: "set null" }),
    shiftId: int("shiftId").references(() => shifts.id, { onDelete: "set null" }),
    receiptNumber: varchar("receiptNumber", { length: 64 }).notNull().unique(),
    /** Stable 12-digit sales invoice number printed as a scanner-readable receipt barcode. */
    invoiceNumber: varchar("invoiceNumber", { length: 12 }).unique(),
    paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "mobile", "credit", "other"]).notNull().default("cash"),
    /** Amount received at checkout; for credit sales this may be less than total. */
    amountPaid: decimal("amountPaid", { precision: 14, scale: 2 }).notNull().default("0.00"),
    /** Immutable debt snapshot for this sale, equal to total minus amountPaid. */
    remainingDebt: decimal("remainingDebt", { precision: 14, scale: 2 }).notNull().default("0.00"),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull(),
    discountTotal: decimal("discountTotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    total: decimal("total", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("sales_store_created_idx").on(table.storeId, table.createdAt), index("sales_customer_idx").on(table.customerId), index("sales_shift_idx").on(table.shiftId)]
);

/** A completed movement transfers branch-owned stock through one auditable operation. */
export const stockTransfers = mysqlTable(
  "stock_transfers",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceStoreId: int("sourceStoreId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    targetStoreId: int("targetStoreId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    requestedByUserId: int("requestedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", ["completed", "cancelled"]).notNull().default("completed"),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("stock_transfers_source_created_idx").on(table.sourceStoreId, table.createdAt), index("stock_transfers_target_created_idx").on(table.targetStoreId, table.createdAt)]
);

/** Transfer-line snapshots preserve product, quantity, and cost at the point of branch movement. */
export const stockTransferLines = mysqlTable(
  "stock_transfer_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    transferId: int("transferId").notNull().references(() => stockTransfers.id, { onDelete: "restrict" }),
    sourceProductId: int("sourceProductId").notNull().references(() => products.id, { onDelete: "restrict" }),
    targetProductId: int("targetProductId").notNull().references(() => products.id, { onDelete: "restrict" }),
    productName: varchar("productName", { length: 255 }).notNull(),
    quantity: int("quantity").notNull(),
    unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull(),
  },
  table => [index("stock_transfer_lines_transfer_idx").on(table.transferId), index("stock_transfer_lines_source_product_idx").on(table.sourceProductId), index("stock_transfer_lines_target_product_idx").on(table.targetProductId)]
);

/** Line snapshots preserve sold unit prices and discounts independently of later product price changes. */
export const saleLines = mysqlTable(
  "sale_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    saleId: int("saleId").notNull().references(() => sales.id, { onDelete: "restrict" }),
    /** Null for custom-priced services, packaging, and other non-inventory sale lines. */
    productId: int("productId").references(() => products.id, { onDelete: "restrict" }),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    productName: varchar("productName", { length: 255 }).notNull(),
    quantity: int("quantity").notNull(),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
    /** Wholesale cost snapshot captured at checkout from the product's latest stock-entry-derived cost. */
    unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull().default("0.00"),
    unitDiscount: decimal("unitDiscount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("lineTotal", { precision: 14, scale: 2 }).notNull(),
  },
  table => [index("sale_lines_sale_idx").on(table.saleId), index("sale_lines_product_idx").on(table.productId)]
);

/** A return references its original branch receipt and records the cashier who received it. */
export const saleReturns = mysqlTable(
  "sale_returns",
  {
    id: int("id").autoincrement().primaryKey(),
    saleId: int("saleId").notNull().references(() => sales.id, { onDelete: "restrict" }),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    cashierUserId: int("cashierUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    reason: varchar("reason", { length: 500 }),
    totalRefund: decimal("totalRefund", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("sale_returns_store_created_idx").on(table.storeId, table.createdAt), index("sale_returns_sale_idx").on(table.saleId)]
);

/** Return lines enforce the original purchase linkage and make over-returns detectable. */
export const returnLines = mysqlTable(
  "return_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    returnId: int("returnId").notNull().references(() => saleReturns.id, { onDelete: "restrict" }),
    saleLineId: int("saleLineId").notNull().references(() => saleLines.id, { onDelete: "restrict" }),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "restrict" }),
    quantity: int("quantity").notNull(),
    unitRefund: decimal("unitRefund", { precision: 12, scale: 2 }).notNull(),
    lineTotal: decimal("lineTotal", { precision: 14, scale: 2 }).notNull(),
  },
  table => [index("return_lines_return_idx").on(table.returnId), index("return_lines_sale_line_idx").on(table.saleLineId)]
);

/** A direct return records stock received without requiring an original sales invoice. */
export const directReturns = mysqlTable(
  "direct_returns",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "restrict" }),
    cashierUserId: int("cashierUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    returnNumber: varchar("returnNumber", { length: 64 }).notNull().unique(),
    reason: varchar("reason", { length: 500 }),
    totalRefund: decimal("totalRefund", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("direct_returns_store_created_idx").on(table.storeId, table.createdAt)]
);

/** Direct-return line snapshots preserve the product and current refund amount used for the stock receipt. */
export const directReturnLines = mysqlTable(
  "direct_return_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    directReturnId: int("directReturnId").notNull().references(() => directReturns.id, { onDelete: "restrict" }),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "restrict" }),
    productName: varchar("productName", { length: 255 }).notNull(),
    quantity: int("quantity").notNull(),
    unitRefund: decimal("unitRefund", { precision: 12, scale: 2 }).notNull(),
    lineTotal: decimal("lineTotal", { precision: 14, scale: 2 }).notNull(),
  },
  table => [index("direct_return_lines_return_idx").on(table.directReturnId), index("direct_return_lines_product_idx").on(table.productId)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;
