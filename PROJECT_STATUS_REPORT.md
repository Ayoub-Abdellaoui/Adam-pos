# Project Status & Codebase Report

**Scope of review:** This report is based only on the current workspace files, registered routes, generated migration artifacts, a read-only database table check, and the latest automated test run. No feature implementation was changed as part of this review.

## Executive Status

The **Admin Dashboard** is the route currently mounted for an authenticated Admin at `/`. That behaviour is deliberate in `client/src/App.tsx`: the root route renders `Overview` for an Admin and `CashierPOS` only for a Cashier. Consequently, an Admin will not see the cashier terminal at the root URL, even though the terminal code exists.

The **full invoice parser interface does exist** in `client/src/pages/InvoiceStaging.tsx`. It is registered at `/admin/invoice-import` and `/invoices/new`, both wrapped by an Admin guard. The current Admin navigation contains an `Invoice import` entry pointing to `/admin/invoice-import`. The separate `/invoice` route also exists, but it is intentionally a **minimal visibility page** with a heading and a link onward; it is not the full upload-and-staging UI.

> **Bottom line:** The POS and invoice code are not absent from the repository. Their visibility differs by role and route. The current Admin session is designed to show the dashboard and invoice administration, not the cashier POS.

## 1. Current Configured Tech Stack

| Layer | Actual configured technology | Evidence |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite 7, Wouter client routing | `package.json`; `client/src/App.tsx` |
| Styling and UI | Tailwind CSS 4, Radix/shadcn-style components, Lucide icons, Sonner toasts | `package.json`; `client/src/components/ui/` |
| Client data | TanStack React Query through tRPC React bindings | `@tanstack/react-query`, `@trpc/react-query` dependencies |
| Backend | Express 4 server with tRPC 11 procedures | `server/_core/index.ts`; `server/routers.ts` |
| ORM and SQL driver | Drizzle ORM with `drizzle-orm/mysql-core` and `mysql2` | `drizzle/schema.ts`; `server/db.ts` |
| Database dialect | Managed MySQL/TiDB-compatible database, **not PostgreSQL** | `drizzle.config.ts`; `mysql2`; schema imports |
| Authentication | Managed OAuth/session context with application-level Admin/Cashier roles | `server/_core/context.ts`; `drizzle/schema.ts` |
| Storage and AI | Managed object storage helper and server-side LLM helper for invoice vision extraction | `server/storage.ts`; `server/invoiceParser.ts` |
| Testing | Vitest | `vitest.config.ts`; `pnpm test` |

The workspace is therefore **not a Next.js App Router or PostgreSQL implementation**. It is a React/Vite + Express/tRPC + Drizzle/MySQL application that was initialized by the managed project template.

## 2. Database Schema and Migration Status

The codebase has three generated Drizzle SQL files: `0000_smiling_franklin_richards.sql`, `0001_conscious_living_mummy.sql`, and `0002_woozy_the_hood.sql`. A read-only `information_schema` query confirmed that all 11 expected tables currently exist in the database.

| Model/table | Purpose implemented in schema |
| --- | --- |
| `stores` | Cosmetics, Bookstore, and Clothing branch records |
| `users` | OAuth-backed user with `admin` or `cashier` role and optional `storeId` assignment |
| `suppliers` | Supplier master records |
| `products` | Branch-specific products, on-hand quantity, cost, and retail price |
| `barcodes` | Multiple globally unique barcode values per product |
| `invoices` | Committed incoming-invoice metadata and source-file reference |
| `stock_entries` | Incoming stock lines linked to invoice, product, and branch |
| `sales` | Branch receipt header, payment method, totals, and cashier |
| `sale_lines` | Sold product snapshots, quantities, prices, and discounts |
| `sale_returns` | Return/refund header linked to original sale and cashier |
| `return_lines` | Return-line linkage that supports over-return prevention |

The database verification confirms table presence. It does not independently prove every production workflow has been exercised against a real invoice document or a real cashier session.

## 3. Completed Routes, Pages, and Backend APIs

### Frontend route map

| Route | Mounted component or behavior | Role visibility | Status based on code review |
| --- | --- | --- | --- |
| `/` | `Overview` for Admin; `CashierPOS` for Cashier | Role-dependent | Registered and rendered in the preview as Admin Dashboard |
| `/invoice` | `InvoiceVisible` | Any authenticated shell user | Exists; minimal placeholder only, with heading and onward link |
| `/admin/invoice-import` | `InvoiceStaging` | Admin only | Full invoice upload/staging interface exists |
| `/invoices/new` | `InvoiceStaging` | Admin only | Legacy alias of the full invoice interface |
| `/404` | `NotFound` | Any user | Registered |
| `/pos` | None | None | **Not registered** |

### Implemented frontend modules

| Module | Actual implementation status |
| --- | --- |
| Admin dashboard (`Overview.tsx`) | Branch summaries, recent stock table, and invoice calls-to-action exist. It is the current Admin root view. |
| Invoice staging (`InvoiceStaging.tsx`) | File selection for JPEG/PNG/WebP/PDF, server parse mutation, editable staged lines, receiving-branch selector, Supplier Name/Product Name/Quantity/Cost Price columns, per-row Assign Barcode inputs, and Save to Inventory mutation exist. |
| Temporary invoice visibility page (`InvoiceVisible.tsx`) | Exists only to make `/invoice` visibly render `Invoice AI Staging Area`; it does not perform parsing. |
| Cashier POS (`CashierPOS.tsx`) | Scanner capture, manual barcode entry, five-cart queue, hold/resume/close, quantity and per-line discount controls, checkout, receipt confirmation, and return/refund modal are present in code. |
| Cart state (`posCart.tsx`) | Client context/reducer supports a maximum of five carts and cart lifecycle actions. |

### Registered backend tRPC procedures

| Router | Procedures present in code |
| --- | --- |
| `auth` | `me`, `logout` |
| `inventory` | `dashboard`, `parseInvoice`, `commitInvoice`, `cashierWorkspace` |
| `pos` | `lookupBarcode`, `checkout`, `findReceipt`, `processReturn` |

The tRPC server is mounted below `/api/trpc`; individual procedures are not separate REST endpoints. The reported API surface is taken from `server/routers.ts`, `server/routers/inventory.ts`, and `server/routers/pos.ts`.

## 4. Critical Missing-UI and Visibility Analysis

### POS interface

**The POS UI file exists:** `client/src/pages/CashierPOS.tsx` is substantial implementation, not a placeholder. It is not mounted at `/pos`; the router has no `/pos` route. Instead, `WorkspaceHome` mounts it at `/` only if `user.role === "cashier"`.

**Why it is not visible in the current Admin view:** an Admin has `role === "admin"`, so `/` renders `Overview`. The Admin navigation also deliberately contains only `Central dashboard` and `Invoice import`. It does not contain a `POS` item. A cashier, by contrast, receives the `Branch POS` navigation item and has the POS component mounted at `/`.

### Invoice parsing interface

**The full invoice upload/staging UI exists:** `client/src/pages/InvoiceStaging.tsx` includes the requested user interface and is registered at `/admin/invoice-import` and `/invoices/new` for Admin users.

**Why `/invoice` appears incomplete:** the current `/invoice` route mounts `InvoiceVisible.tsx`, which is a deliberately minimal visibility page created in the most recent update. It contains the heading `Invoice AI Staging Area` and a button to `/admin/invoice-import`, but no upload or table logic. The actual parser UI is at `/admin/invoice-import`.

**Navigation status:** the Admin sidebar contains `Invoice import` pointing to `/admin/invoice-import`. The dashboard has secondary links to the same full route. Its large hero button now points to the temporary `/invoice` page, which introduces an unnecessary two-step path to the real interface.

| User observation | Actual code-level explanation |
| --- | --- |
| “I cannot see the POS.” | Correct for an Admin session. No `/pos` route exists, and Admin root/navigation intentionally do not mount the cashier terminal. |
| “I cannot see the invoice parser UI.” | The full UI exists at `/admin/invoice-import`; `/invoice` is only a minimal placeholder that links to it. |
| “The Admin Dashboard works.” | Expected. `/` is explicitly wired to `Overview` when the authenticated user is Admin. |

## 5. Current Validation Evidence

The latest `pnpm test` run completed successfully with **5 test files and 12 passing tests**. The test files cover authentication logout, invoice extraction contract validation, invoice transaction boundaries, POS authorization/checkout/over-return safeguards, and the client cart-queue reducer.

The latest `pnpm check` TypeScript validation also completed successfully. The preview was rendered for `/`, `/invoice`, and `/admin/invoice-import` during the prior implementation work. The current preview evidence shows the Admin dashboard and the minimal `/invoice` page; it does not constitute a live, browser-driven end-to-end test of a real upload, LLM response, checkout, or cashier session.

## 6. Immediate Action Plan — No Changes Made Yet

| Priority | Exact next change | Reason |
| --- | --- | --- |
| 1 | Replace `/invoice`’s temporary `InvoiceVisible` placeholder with either the actual `InvoiceStaging` component or an automatic redirect to `/admin/invoice-import`. | Removes the confusing split between the visible `/invoice` page and the actual parser UI. |
| 2 | Change the Admin dashboard hero button back to `/admin/invoice-import`, or make `/invoice` render the full staging component directly. | Ensures the main CTA opens the real upload/staging screen in one click. |
| 3 | Decide POS access policy: add a dedicated protected `/pos` route for Cashiers, or add a read-only Admin POS preview. | A real cashier terminal should not expose branch sales access to Admin without an explicit policy. |
| 4 | Add an Admin user-assignment screen or database workflow for setting a Cashier’s `role` and `storeId`. | The current POS requires a signed-in Cashier with a branch assignment. |
| 5 | Run a manual role-based acceptance pass: sign in as an Admin for invoice import, then as an assigned Cashier for POS, scanner, checkout, and returns. | Existing tests validate contracts and transaction paths but do not replace role-specific browser verification. |

No new feature code should be written until this report is reviewed and the desired POS access policy is confirmed.

## Evidence Files

| Area | Files reviewed |
| --- | --- |
| Stack | `package.json`, `drizzle.config.ts` |
| Database | `drizzle/schema.ts`, `drizzle/0000_smiling_franklin_richards.sql`, `drizzle/0001_conscious_living_mummy.sql`, `drizzle/0002_woozy_the_hood.sql` |
| Routes and role visibility | `client/src/App.tsx`, `client/src/components/DashboardLayout.tsx`, `client/src/pages/Overview.tsx` |
| Invoice UI | `client/src/pages/InvoiceStaging.tsx`, `client/src/pages/InvoiceVisible.tsx` |
| POS UI and state | `client/src/pages/CashierPOS.tsx`, `client/src/lib/posCart.tsx`, `client/src/hooks/useBarcodeScanner.ts` |
| APIs | `server/routers.ts`, `server/routers/inventory.ts`, `server/routers/pos.ts` |
| Tests | `server/**/*.test.ts`, `client/src/lib/posCart.test.ts` |
