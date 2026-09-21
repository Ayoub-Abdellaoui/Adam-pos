# Cloud POS Architecture

## Runtime Decision

This project uses the managed full-stack runtime supplied at initialization: **React with Vite**, **Express with tRPC**, **Tailwind CSS**, **Drizzle ORM**, and a managed **MySQL/TiDB-compatible** database. The originally requested Next.js App Router, Next Route Handlers, and PostgreSQL stack cannot be used directly in this managed template without replacing the supported authentication, storage, database, and deployment foundation. The functional requirements are implemented within the supported runtime rather than partially emulating an unsupported stack.

| Target concern | Current implementation | Migration boundary |
| --- | --- | --- |
| UI routes | Wouter client routes and page components | Replace route composition with Next App Router pages. |
| API transport | Typed, protected tRPC procedures | Map procedures to Next Route Handlers or server actions. |
| Persistence | Drizzle MySQL schema and transaction boundary | Recreate schema with `drizzle-orm/pg-core`; retain domain naming and transaction flow. |
| Authentication | Managed OAuth user context | Replace context adapter while preserving `Admin` and `Cashier` policy checks. |
| Invoice file storage | Managed object storage helper | Replace only the storage adapter; invoices keep a source-file key. |
| Vision extraction | Server-only LLM helper with strict JSON schema | Retain the extraction service interface and substitute the provider adapter if needed. |

## Domain Safety Boundaries

All operational records refer to a `storeId`. Product catalog records, inventory balances, invoices, and stock entries are branch-scoped; a barcode points to one product globally. The three fixed branch records—Cosmetics, Bookstore, and Clothing—are provisioned idempotently by the data layer without creating synthetic products, invoices, sales, or reviews.

> **Authorization is enforced at the server boundary.** Admin procedures are checked before invoice parsing, dashboard access, and transactional commits. Cashier procedures require a store assignment and return only that store’s workspace context.

## Invoice Intake Contract

Invoice uploads permit JPEG, PNG, WebP, and PDF documents up to 8 MB. The source is uploaded to managed object storage, then a production vision model is called server-side with strict JSON-schema output. The public extraction contract is exactly `Supplier Name`, `Product Names`, `Quantities`, and `Cost Prices`; the user interface derives editable table rows from those aligned arrays. The reviewing administrator selects the receiving branch and captures barcodes before committing.

The commit routine performs supplier resolution, invoice creation, product creation or balance update, barcode linking, and stock-entry creation inside one database transaction. A collision in barcode ownership or any other step aborts the complete transaction so inventory balances cannot become partially updated.

