# Project TODO

- [x] Document the scaffold-to-target architecture decision and production integration boundaries.
- [x] Define Drizzle models for branch-scoped stores, users, suppliers, products, multi-barcodes, invoices, stock entries, and inventory balances.
- [x] Generate and apply a database migration for the POS inventory schema.
- [x] Implement backend authorization guards for Admin and branch-scoped Cashier access.
- [x] Implement secure invoice upload to managed object storage with image/PDF validation.
- [x] Implement a real server-side LLM vision call returning the exact invoice JSON contract.
- [x] Implement editable invoice staging and USB barcode scanner capture.
- [x] Implement a fully transactional stock commit that updates inventory and barcodes atomically.
- [x] Build an Admin dashboard with cross-branch inventory, stock-entry, and branch summaries.
- [x] Build protected navigation that limits Cashiers to their assigned branch POS placeholder.
- [x] Add automated tests for roles, parsing contract, barcode logic, and transactional commit behaviour.
- [x] Verify type checks, migration integrity, tests, and responsive UI states.
- [x] Save a final implementation checkpoint and provide POS integration guidance.
- [x] Add sales, receipt, sale-line, and return data models with branch integrity constraints.
- [x] Generate and apply the POS sales and returns migration.
- [x] Implement branch-scoped product barcode lookup for scanner-driven cart additions.
- [x] Implement atomic checkout that records a receipt, sale lines, discounts, and inventory deductions.
- [x] Implement atomic return processing that restores inventory and prevents over-returns.
- [x] Build client-side five-cart queue state with hold, switch, resume, and close behavior.
- [x] Build the high-throughput cashier POS screen with global barcode capture, cart editing, and checkout.
- [x] Build protected receipt lookup and return-processing interface for the assigned branch.
- [x] Add and run POS tests for barcode lookup, cart state, checkout, and return integrity.
- [x] Verify POS layout on desktop and mobile breakpoints.
- [x] Save the completed cashier POS extension checkpoint and provide workflow guidance.
- [x] Add the explicit `/admin/invoice-import` admin route to the invoice staging workspace.
- [x] Add a prominent main-navigation entry that opens the admin invoice import page.
- [x] Verify the visible invoice upload, editable staging table, barcode inputs, and inventory-save controls.
- [x] Save the dedicated invoice-import access update and provide workflow guidance.
- [x] Add a minimal visible `/invoice` page with the exact requested heading.
- [x] Add the exact home-page button label `GO TO INVOICE UPLOAD` linking to `/invoice`.
- [x] Render and verify the `/invoice` preview immediately.
- [x] Save the minimal invoice visibility fix checkpoint and report the preview result.
- [x] Deliver an evidence-based Project Status & Codebase Report before any further feature development.
- [x] Make `/invoice` render the full Admin invoice staging interface.
- [x] Add an Admin POS preview route at `/pos` without weakening cashier-only backend rules.
- [x] Add a POS Preview link to the Admin navigation.
- [x] Verify the `/invoice` and `/pos` interfaces in the Admin preview.
- [x] Save the Admin visibility-test update and provide testing guidance.
- [x] Add server-side Admin product-label data access scoped to inventory products and barcodes.
- [x] Add barcode rendering support for label previews.
- [x] Add the Admin `/admin/labels` route and navigation link.
- [x] Add receipt data capture and a Print Receipt action after POS checkout.
- [x] Build printable barcode label selection and Print Labels action.
- [x] Add isolated 80mm receipt and sticker-label `@media print` styles.
- [x] Test print data contracts and verify receipt and label previews.
- [x] Save the thermal-printing integration checkpoint and provide hardware testing guidance.
- [x] Define real revenue, cost, and profit calculations for branch-filtered analytics.
- [x] Add an Admin analytics tRPC procedure for KPIs, branch performance, sales trends, low stock, and recent sales.
- [x] Build branch filter controls and Financial KPI cards using live aggregates.
- [x] Build Revenue-vs-Profit and sales-trend charts using Recharts.
- [x] Build low-stock alert and unified transaction-ledger tables.
- [x] Add analytics calculation tests and verify dashboard layout across breakpoints.
- [x] Save the financial analytics dashboard checkpoint and provide reporting guidance.
- [x] Install and configure persistent English, Arabic, and French i18n resources.
- [x] Add a shared language switcher available to Admin and Cashier workspaces.
- [x] Implement dynamic `lang` and `dir` document changes with Arabic RTL styling.
- [x] Translate principal sidebar, dashboard, and POS controls using the shared translation function.
- [x] Refine dashboard and POS visual hierarchy, action contrast, spacing, and responsive RTL behavior.
- [x] Test language persistence, Arabic RTL, and responsive UI layouts.
- [x] Save the multilingual UX overhaul checkpoint and provide rollout guidance.
- [x] Upgrade global palette, typography, surfaces, and interactive transition standards.
- [x] Redesign POS cart tabs, scanner input, cart table density, and checkout action hierarchy.
- [x] Upgrade dashboard KPI grid, analytics cards, and data-table readability and hover behavior.
- [x] Standardize loading, disabled, and success-feedback states for high-frequency actions.
- [x] Verify desktop, mobile, and Arabic RTL experiences across dashboard and POS.
- [x] Save the commercial UI/UX overhaul checkpoint and summarize the design upgrade.
- [x] Apply Inter for LTR and Cairo for Arabic RTL typography across the interface.
- [x] Replace global color tokens with a neutral slate and modern indigo design system.
- [x] Standardize premium card, modal, button, and table surface treatments.
- [x] Increase POS touch targets, action contrast, quantity control readability, and total emphasis.
- [x] Verify desktop, mobile, and Arabic RTL rendering of the new design system.
- [x] Save the typography and visual-theme upgrade checkpoint and summarize the changes.
- [x] Install and configure a browser camera barcode scanning library.
- [x] Build a shared responsive camera scanner dialog with permission and lifecycle handling.
- [x] Add per-row camera barcode assignment to invoice staging.
- [x] Add POS mobile scanner control with continuous scanning mode and active-cart lookup.
- [x] Verify camera and USB scanner flows coexist without event-listener conflicts.
- [x] Test camera dialog responsive, permission-denied, and scan-success states.
- [x] Save the dual camera-and-USB barcode scanning checkpoint and provide device testing guidance.
- [x] Deliver a technical diagnostic report for the granted-permission blank camera-preview issue.
- [x] Deliver a race-safe isolated React camera preview correction for the provided MediaDevices failure path.
- [x] Apply the race-safe MediaDevices preview lifecycle fix to the active camera scanner component.
- [x] Validate metadata-gated playback and stream cleanup behavior in the deployed scanner code.
- [x] Save the deployed camera preview fix checkpoint and confirm the implementation.
- [x] Relax active camera constraints to tolerant rear-camera preferences only.
- [x] Add explicit getUserMedia and video.play failure logging and non-loading error transitions.
- [x] Test camera startup failure handling and validate the scanner bundle.
- [x] Save the camera startup reliability fix checkpoint and confirm the applied changes.
- [x] Display the exact camera error name and message in the scanner modal on mobile.
- [x] Test diagnostic formatting for acquisition and playback error paths.
- [x] Save the mobile-visible camera diagnostic update and confirm the deployment.
- [x] Remove automatic modal camera startup and add an explicit Start Camera action.
- [x] Ensure the manual start action visibly renders exact acquisition or playback errors.
- [x] Test manual-start lifecycle behavior and validate the scanner bundle.
- [x] Save the manual camera-start update and confirm the deployment.
- [x] Confirm whether the POS mobile scanner reuses the shared camera dialog and identify any POS-specific startup code.
- [x] Apply the proven manual Start Camera behavior to the POS scanning entry point.
- [x] Validate the POS scanner behavior, shared diagnostics, and USB-scanner independence.
- [x] Save the POS camera scanner update and confirm the deployment.
- [x] Place the POS mobile camera scanner control directly beside the manual barcode input.
- [x] Route camera-detected barcodes through the same POS callback as physical scanner input.
- [x] Verify matching products add to the active cart and unregistered barcodes show a clear error.
- [x] Save the unified POS camera-and-hardware scan workflow and confirm the deployment.
- [x] Audit existing product schema, product-management interface, and barcode lookup paths.
- [x] Add admin product create and edit data operations for barcode arrays, purchase price, selling price, and stock quantity.
- [x] Build dynamic barcode list controls with add and delete actions in product create and edit interfaces.
- [x] Verify every POS and inventory barcode lookup resolves any barcode assigned to the branch product.
- [x] Test and save the multi-barcode product-management update.
- [x] Add the shared manual-start camera scanner beside product barcode entry and append detected codes to the list.
- [x] Convert invoice staging barcode assignment from one barcode per row to a managed barcode list per row.
- [x] Support repeated camera and USB scanner submissions that append unique barcodes to the active invoice row.
- [x] Test and save the product and invoice multi-barcode camera workflow.
- [x] Trace and repair the invoice row camera button state-to-modal render path.
- [x] Normalize every staged invoice row to a safe barcode array before list operations.
- [x] Add regression coverage for invoice camera modal launch and barcode-list safety.
- [x] Test and save the invoice camera-modal opening repair.
- [x] Audit currency formatting, receipt printing, finalized sale records, and current return procedures.
- [x] Replace USD display formatting with Algerian Dinar formatting across operational interfaces and printed documents.
- [x] Add a printable scannable 12-digit invoice barcode tied to each finalized sale number.
- [x] Confirm finalized payments persist sale headers, line items, prices, quantities, and totals atomically.
- [x] Add invoice-scanned full and partial return handling with USB and manual-camera scan entry.
- [x] Add direct multi-product return handling with USB and manual-camera barcode scan entry.
- [x] Test and save the DZD invoicing and expanded returns update.
- [x] Roll back to the last stable checkpoint before receipt-print and quantity-sold modifications.
- [x] Verify the restored version builds and serves the POS route locally and in production.
- [x] Reapply frontend component-level mobile receipt delivery and invoice Quantity Sold UI improvements, with a clear no-invoice limitation for direct returns.
- [x] Reapply component-only mobile receipt delivery and invoice-based Quantity Sold UI improvements.
- [x] Confirm no server, routing, deployment, or global-wrapper files are changed after rollback.
- [x] Close the potential direct-return original-quantity enhancement under the approved no-server policy; retain the no-invoice notice and manual quantity input.
- [x] Test and save the stable component-only release.
- [x] Retain the explicit no-invoice notice and manual return quantity control for direct product returns.
- [x] Audit Android detection and the receipt action to ensure Android never invokes the native print spooler.
- [x] Harden the component-local PDF receipt output for data, barcode, and layout readiness on mobile.
- [x] Add behavioral component coverage proving mobile-risk devices cannot expose native printing and that PDF preparation failures remain visible.
- [x] Add rendered UI coverage proving direct returns use a manual quantity entry field without inventing Quantity Sold.
- [x] Test and save the Android-safe receipt release.
- [x] Audit the mobile receipt PDF geometry and identify overlapping layout paths.
- [x] Replace receipt line-item flex rows with a semantic thermal-safe table layout.
- [x] Rebuild PDF command spacing for a centered header, readable rows, right-aligned totals, and separated barcode.
- [x] Add regression coverage for table-based receipt structure and non-overlapping PDF spacing.
- [x] Test and save the clean Android-safe thermal receipt layout.
- [x] Audit the current receipt width, font scale, labels, and device-specific output controls.
- [x] Apply compact 80 mm receipt dimensions, Adam Stores heading, dashed dividers, and bilingual footer copy.
- [x] Rename the desktop receipt action to Print Receipt / طباعة الفاتورة while retaining Android-safe PDF output.
- [x] Add regression coverage for the compact receipt layout and platform-aware action labels.
- [x] Test and save the compact thermal receipt refinement.
- [x] Audit the checkout completion path and receipt print control for download dependencies.
- [x] Replace receipt download/PDF logic with barcode-ready native printing.
- [x] Auto-trigger one native print dialog after each successful finalized checkout.
- [x] Add regression coverage for manual native printing and delayed checkout auto-printing.
- [x] Test and save the native auto-print receipt workflow.
- [x] Inspect POS cart, checkout, and sale-line persistence constraints for non-inventory entries.
- [x] Support database-backed custom-price sale lines without deducting inventory.
- [x] Add Custom Amount / مبلغ مخصص POS input and append its item to the active cart.
- [x] Verify custom-price amounts in totals, native receipt output, checkout logging, and regression coverage.
- [x] Test and save the custom-price POS workflow.
- [x] Audit receipt DOM and current print helper dependencies for main-layout coupling.
- [x] Render only the receipt markup and 80 mm base styles into a temporary isolated iframe.
- [x] Route manual and checkout auto-print through the isolated iframe after barcode readiness.
- [x] Add regression coverage for iframe content, isolated print timing, cleanup, and release validation.
- [x] Test and save the isolated thermal receipt print workflow.
- [x] Audit product management barcode data and existing label print utilities.
- [x] Generate isolated 50 mm × 30 mm barcode label documents with exact quantity duplication.
- [x] Add barcode previews, Print Quantity controls, and Print Barcode actions to product management.
- [x] Test barcode label markup, duplication count, isolated frame printing, and responsive controls.
- [x] Test and save the barcode label printing workflow.
- [x] Audit the existing direct product creation contract and product management entry controls.
- [x] Add a dedicated Add Single Product modal with branch, name, purchase price, DZD selling price, stock, primary barcode, and additional barcodes.
- [x] Reuse secure direct product persistence and refresh the catalog after a successful single-product save.
- [x] Add rendered modal coverage for the single-product fields, primary barcode requirement, and save action.
- [x] Verify the single-product entry trigger at desktop and mobile widths and the opened form through rendered interaction coverage.
- [x] Test and save the dedicated single-product inventory entry workflow.
- [x] Audit Invoice Import, finalized sale records, and admin navigation for reusable product and invoice contracts.
- [x] Add a complete single-product entry path inside Invoice Import with branch, prices, stock, primary barcode, and additional barcodes.
- [x] Reuse admin-protected inventory persistence for Invoice Import single-item saves.
- [x] Add secure database queries for finalized sales invoice archive lists and complete invoice detail records.
- [x] Add administrative Sales History navigation, invoice search, and granular historical invoice review UI.
- [x] Test single-item entry, sales archive persistence/query behavior, details, and responsive interface rendering.
- [x] Test and save the invoice import and sales archive update.
- [x] Audit existing user roles, route guards, server procedures, and sensitive product/financial data exposure.
- [x] Add Admin, Cashier, Stock Manager, and Supervisor role definitions with a safe database migration.
- [x] Implement reusable server-side authorization guards for POS, stock, reports, archive, returns, and user administration.
- [x] Restrict sensitive server responses and mutations so cashiers cannot receive costs/profits/history and stock managers cannot access POS or financial data.
- [x] Add role-specific protected routes, navigation, login presentation, and Admin user management.
- [x] Add Supervisor daily-shift summary access while preserving restrictions on long-term analytics and account administration.
- [x] Test four-role authorization boundaries, UI visibility, database migration, and production build.
- [x] Test and save the four-role RBAC update.
- [x] Audit Sales History data contracts, current filters, and isolated receipt printing interfaces.
- [x] Add secure quick-period and custom date-range archive filtering.
- [x] Group archive invoices by clear date periods and display exact transaction date/time.
- [x] Add a historical Reprint Receipt action that uses the isolated 80 mm iframe print workflow.
- [x] Test archive filtering, grouping, historical receipt content, isolated print invocation, and responsive rendering.
- [x] Test and save the enhanced Sales History archive.
- [x] Audit current branch-scoped records, role guards, analytics, and operational workflow gaps.
- [x] Add non-destructive enterprise schema support for branch lifecycle, shifts, globally shared customers, and stock-transfer history.
- [x] Add server-enforced branch tenancy and role guards for branch administration, shifts, customers, inventory movements, POS, reporting, and archive actions.
- [x] Add Global Admin branch controls and aggregate multi-branch analytics to the primary admin dashboard.
- [x] Build supervisor shift open/close reconciliation and secure branch-to-branch stock transfer workflows.
- [x] Add a shared customer registry with cross-branch purchase recognition.
- [x] Apply role-specific routes, navigation, and restricted response shapes for Cashier, Stock Manager, and Supervisor.
- [x] Test multi-tenant isolation, four-role permissions, transfers, shifts, customer visibility, migration, and responsive interfaces.
- [x] Test and save the multi-branch enterprise architecture update.

## Phased Admin UI roadmap

- [x] Phase 1: Audit the current Admin landing route, branch administration controls, and feature-parity scoping contract.
- [x] Phase 1: Replace the Admin’s first authenticated view with a dedicated active-branch selection landing page.
- [x] Phase 1: Render each active branch as a clear, responsive entry card without adding branch analytics or branch-dashboard features.
- [x] Phase 1: Provide Admin-only Add New Branch and Delete Branch lifecycle controls on the landing page.
- [x] Phase 1: Add focused regression coverage, verify responsive rendering, and save the approved Phase 1-only release.
- [x] Phase 1 clarification: Route an Admin’s selected branch card directly to that branch’s Inventory & Product Management Hub.
- [x] Phase 1 clarification: Ensure the routed hub loads the selected branch catalog and exposes single-product entry, AI invoice import, and barcode editing under that branch scope.
- [x] Phase 1 clarification: Add route-scope regression coverage, verify the product hub visually, and save the amended Phase 1 release without starting Phase 2 analytics.
- [x] Phase 3: Replace the global landing sidebar with global-only modules and hide branch tools outside a selected branch context.
- [x] Phase 3: Switch to a branch-specific sidebar inside a selected branch, showing only branch-scoped product, invoice, POS, statistics, and staff actions.
- [x] Phase 3: Move staff assignment into the selected branch dashboard and enforce branch-bound role authority for Admin, Supervisor, Cashier, and Stock Manager.
- [x] Phase 3: Add regression coverage proving staff cannot gain cross-branch visibility or administrative rights through branch-scoped assignments.

## Branch-scoped role isolation and contextual navigation repair

- [x] Audit the current global user-role schema, authorization procedures, staff UI, and context-aware sidebar behavior.
- [x] Add a non-destructive `user_branch_roles` role-assignment model and safely migrate existing branch staff access.
- [x] Introduce and protect a global Super Admin identity that alone can access all branches, global modules, and Super Admin management.
- [x] Update server authorization so normal branch roles are derived from the active branch assignment and cannot grant cross-branch access.
- [x] Build branch-level role management that assigns Cashier, Stock Manager, Supervisor, or branch Admin only for the active branch.
- [x] Build a global Super Admin management interface separate from branch roles.
- [x] Make sidebar navigation minimal on global routes and branch-specific within a selected branch context.
- [x] Add regression coverage for role isolation, Super Admin guards, branch UI, and contextual sidebar menus.
- [x] Verify migration, responsive flows, TypeScript, tests, and production build; then save the release.

## Context-aware role editing

- [x] Audit existing global Super Admin and branch staff action contracts for safe in-place role changes.
- [x] Add a Super Admin-protected global access update procedure and a branch Admin-protected branch-role update procedure.
- [x] Add Edit Role controls and save dialogs beside existing employee actions in global and branch management lists.
- [x] Ensure a branch edit updates only the active `branch_id`, while a global edit updates only Super Admin access.
- [x] Add and run regression coverage for instant server-enforced role changes, scope isolation, responsive UI, and production build.

## Secure context-aware employee management

- [x] Audit the current login provider and determine whether local email/password credentials can be supported without weakening the existing authentication system.
- [x] Add secure employee creation with first name, last name, email, password handling, and role validation only if a supported authentication path exists.
- [x] Bind branch-created employees and their roles to the active branch only; bind global-created employees to Super Admin authority only.
- [x] Extend the global and branch management forms with complete Add Employee flows while preserving contextual Edit Role actions.
- [x] Test credential sign-in behavior or document the secure provider constraint, then verify scope isolation, role refresh, responsive UI, and production build.

## Phase 2: Global Statistics Module

- [x] Audit existing sales, costs, product, branch, and analytics contracts for global date-filtered aggregation.
- [x] Add a Super Admin-protected global statistics procedure with Today, Last Week, This Month, and custom date-range support.
- [x] Add Total Sales and Total Net Profit KPI cards on the global landing page.
- [x] Add branch contribution visualization for enterprise sales and net-profit percentages.
- [x] Add enterprise-wide Top 5 Best-Selling and Top 5 Most Profitable product rankings.
- [x] Add regression coverage, verify responsive global statistics rendering, validate production build, and save the Phase 2-only release.

## Secure product details and branch inventory search

- [x] Audit product catalog, barcode/reference data, analytics rankings, and existing role-filtered product responses.
- [x] Add a branch-authorized product detail contract that exposes costs and margins only to roles permitted to see financial data.
- [x] Add a branch-scoped multi-criteria product search contract covering product name, barcode, and reference/SKU values.
- [x] Make global and branch analytics product rankings link to the selected product’s authorized detail or edit view.
- [x] Add an instant branch inventory search bar compatible with typed input and hardware barcode scanner text entry.
- [x] Add regression coverage, verify role visibility and responsive flows, validate the production build, and save the release.

## Approved Phase 3 validation pass

- [x] Audit the current branch-card destination, branch-specific sidebar, inventory search, analytics deep links, and cashier financial redaction.
- [x] Apply only missing Phase 3 corrections while preserving the approved Phase 2 behavior.
- [x] Run Phase 3 regression, responsive, and production validation, then stop before Phase 4.

## Phase 3 implementation audit findings

- [x] Existing branch-card navigation, contextual branch sidebar, multi-criteria product search, analytics deep links, and branch-authorized product detail are present in the current release.
- [x] Existing server response redaction prevents Cashiers from receiving purchase cost and profit margin fields.
- [x] Complete final Phase 3 validation and save the Phase 3-only checkpoint.

## Phase 4: Advanced Features and Role Management

- [x] Audit existing AI invoice import, employee management, stock transfer, and shift workflows against the approved Phase 4 requirements.
- [x] Complete functional branch-scoped AI bulk invoice parsing and transactional product/quantity registration.
- [x] Complete global and branch Add Employee, Edit Role, and deletion-safeguard workflows with strict scope enforcement.
- [x] Complete secure Supervisor/Admin stock transfers with movement-history visibility.
- [x] Complete Supervisor shift open, close, and cash-reconciliation workflows.
- [x] Test Phase 4 isolation, permissions, imports, transfers, shifts, responsive UI, TypeScript, tests, and production build.
- [x] Save the Phase 4-only release and stop after reporting the finalized core phases.

## Phase 5.1 Suppliers, Accounts Payable, Expenses & True Net Profit

- [x] Define and apply non-destructive schema support for supplier branch invoices, payable balances/payments, and operational expenses.
- [x] Build role-protected backend procedures for supplier records, supply invoices, payable tracking/payments, and expense lifecycle management.
- [x] Update global and branch analytics to calculate Gross Profit, recorded operating expenses, and expense-adjusted True Net Profit.
- [x] Build functional global and branch Suppliers & Invoices views with supplier creation, invoice costs, payable balance, and payment history workflows.
- [x] Build functional global and branch Expenses Management views with date-filtered expense overview, logging, and controlled deletion.
- [x] Register protected global and branch routes and add functional sidebar links only after feature views are available.
- [x] Enforce that Super Admin, branch Admin, and Supervisor access is scoped correctly, while Cashiers have no API, route, UI, or True Net Profit access.
- [x] Add regression tests and verify calculations, branch isolation, responsive UI, TypeScript, test suite, and production build.
- [x] Publish the complete Phase 5.1 release and stop for user testing.

## Phase 5.1 SRM & Automated Accounts Payable — Backend Only

- [x] Audit the current supplier, invoice, parser, payment, and financial-role contracts without altering any frontend surface.
- [x] Add non-destructive supplier current-debt, invoice total/paid/remaining, invoice-line snapshot, and supplier-payment schema support.
- [x] Extend AI invoice parsing to return supplier name, total invoice amount, and detected upfront payment amount.
- [x] Implement transactional supplier recognition and invoice synchronization that calculates remaining debt and maintains supplier current debt exactly once.
- [x] Implement a role-protected payment-registration procedure that records timestamped supplier payments and reduces supplier debt without permitting overpayment.
- [x] Implement role-protected supplier debt and global Accounts Payable aggregation procedures with explicit Cashier 403 denial.
- [x] Add backend-only tests for parsing fields, invoice/payment debt invariants, branch isolation, and Cashier denial; run migration, tests, type checks, and production build.
- [x] Publish the backend-only SRM foundation and stop pending explicit frontend approval.

## Phase 5.1 SRM & Automated Accounts Payable — Frontend

- [x] Audit the verified SRM contracts and existing invoice intake, financial-management, dashboard, role, and isolated-print UI patterns.
- [x] Extend AI invoice intake with detected supplier matching/inline creation, editable total and paid values, and calculated remaining debt.
- [x] Build a protected Supplier Profile view with contact details, total debt, invoice/payment history, payment registration, and deep invoice detail.
- [x] Add isolated print actions for supplier invoices and payment receipts using the established mobile-safe iframe architecture.
- [x] Add a protected clickable Global Total Debt dashboard widget with authorized supplier-balance breakdown.
- [x] Register protected supplier profile routes/navigation and ensure Cashier financial UI elements are not rendered in the DOM.
- [x] Add UI/RBAC/print regression tests and verify responsive layouts, TypeScript, test suite, and production build.
- [x] Publish the SRM frontend and stop for user testing.

## Global ERP/POS UI & UX Refactor

- [x] Audit the current theme tokens, typography, motion styles, shared components, navigation, dashboard, POS, inventory, finance, and supplier workspace layouts.
- [x] Establish a cohesive light enterprise design system with slate-neutral surfaces, indigo primary actions, semantic status colors, readable typography, and consistent spacing.
- [x] Remove distracting motion and standardize subtle 150–200 ms transitions with reduced-motion support.
- [x] Reorganize global and branch sidebars into clear Operations, Inventory, Finance, and Administration groups while preserving existing RBAC visibility.
- [x] Standardize cards, buttons, inputs, dialogs, tables, page headers, and section dividers across high-traffic workspaces.
- [x] Improve data tables with sticky headers, zebra rows, clear borders, responsive overflow, and aligned financial values.
- [x] Verify functionality, RBAC, responsive desktop/mobile layouts, type safety, tests, and production build; publish the polished UI and stop for testing.

## Global Accessibility, Dark Mode & Full Localization Upgrade

- [x] Audit current theme tokens, overlay primitives, i18n resources, header switcher, and RTL layout behavior.
- [x] Harden all dropdowns, selects, popovers, dialogs, sheets, and menus with opaque surfaces, elevated stacking, and clear shadows.
- [x] Implement persistent system-wide Light/Dark mode with semantic adaptation for every shared and page-level surface.
- [x] Complete English, Arabic, and French translation coverage across POS, inventory, suppliers, expenses, analytics, navigation, forms, and modals.
- [x] Implement Arabic RTL shell movement, text alignment, icon mirroring, and Cairo typography with appropriate line heights.
- [x] Add regression coverage and verify overlay rendering, theme persistence, translations, RTL, responsive layouts, type safety, tests, and production build.
- [x] Publish the accessibility and localization upgrade and stop for user testing.

## Localization Correction — Isolated Language Output

- [x] Scan the entire client for mixed bilingual literals and hardcoded visible UI strings.
- [x] Build complete isolated EN/AR/FR translation namespaces for shared shell and active operational modules.
- [x] Replace mixed-language and hardcoded visible strings with dynamic translation keys across the client.
- [x] Verify the header Light/Dark toggle visibly changes the root theme class and persists across routes.
- [x] Add source-scan and runtime tests proving active-language isolation and absence of bilingual UI literals.
- [x] Run responsive checks, TypeScript, full tests, production build, and publish the localization correction.

## Dark Mode Contrast & Arabic Localization Correction

- [x] Audit all client components for dark-mode text, surface, input, dropdown, modal, table, and button contrast gaps.
- [x] Populate concrete Arabic values for every application translation key and remove English fallbacks from Arabic UI output.
- [x] Apply explicit dark-mode classes to shared layouts and page-level components without weakening existing RBAC or functionality.
- [x] Verify language switching updates html lang and dir between Arabic RTL and English/French LTR.
- [x] Add regression coverage for Arabic dictionary completeness, dark-mode contrast contracts, and direction switching.
- [x] Run responsive visual checks, TypeScript, full tests, production build, and publish the correction.

## Global Administration Dashboard Text & Contrast Correction

- [x] Replace every visible hardcoded label in the branch-selection dashboard with translation keys.
- [x] Add the exact requested English, Arabic, and French dashboard translations.
- [x] Add explicit dark-mode text classes to dashboard headings, paragraphs, spans, and controls.
- [x] Add dashboard regression coverage for Arabic output and dark-mode contrast classes.
- [x] Run tests, TypeScript, production build, visual verification, and publish the dashboard correction.

## Read-Only i18n & Dark-Mode Root-Cause Diagnostic

- [x] Audit i18n initialization, provider wrapping, language switching, document direction, and Arabic resource completeness.
- [x] Audit Tailwind/build configuration, theme state, root dark-class injection, and computed-style risks.
- [x] Inventory production hardcoded English strings, bypassed translation hooks, and dark-mode class gaps.
- [x] Deliver a structured diagnostic report without changing code or publishing.

## Full i18n & Dark-Mode Remediation

- [x] Wrap the application in an explicit I18nextProvider using the initialized singleton.
- [x] Migrate identified production pages and shared workflows from hardcoded English to translation keys and populate Arabic resources.
- [x] Replace fixed light-only global and component styling with semantic dark-aware theme contracts.
- [x] Add route-level Arabic and dark-mode verification, run tests/build/visual checks, and publish.

## Dropdown Layout & Arabic Typography Correction

- [x] Audit shared select/dropdown/popover primitives and Branch Statistics filter rendering.
- [x] Enforce absolute floating high-z-index panels with stable relative anchors across all dropdown controls.
- [x] Apply Cairo loading and RTL Arabic typography with readable line-height globally.
- [x] Add regression coverage, run tests/build, verify responsive dropdowns, and publish.

## Portal Dropdowns & Dark-Mode Modal Correction

- [x] Audit shared portal wrappers and Branch Statistics dropdown composition.
- [x] Restore explicit body-level portals for all dropdown, select, popover, and hover-card content.
- [x] Harden dialog, alert-dialog, sheet, drawer, and modal surfaces and internal controls for dark mode.
- [x] Add portal/modal regression coverage, verify responsive layouts, run tests/build, and publish.

## Global User Management Hub

- [x] Audit user schema, Super Admin guards, global staff procedures, branches, and current management UI.
- [x] Add a Super Admin-only all-account query and universal role/branch assignment mutation.
- [x] Build a paginated all-user table and portal-based Edit Role & Permissions modal.
- [x] Add RBAC, pagination, visibility, edit, and self-protection regression coverage; verify and publish.

## POS Cashier Speed Enhancements

- [x] Audit POS cart state, checkout/payment modal, held-cart workflow, custom amount flow, and barcode listener.
- [x] Implement conflict-safe F2, F4, and F8 shortcuts with visible POS key hints.
- [x] Add single-letter product quick keys and custom-service item insertion with automatic price focus.
- [x] Add shortcut behavior tests, verify responsive POS interaction, run tests/build, and publish.

## Customer Credit & Debt System

- [x] Audit customer, sales, invoice, checkout, search, and route foundations.
- [x] Add customer debt and invoice payment/debt snapshots with safe transactional backend logic and migration.
- [x] Integrate Credit payment flow, customer selection/creation, and Amount Paid Now into POS checkout.
- [x] Build protected Customers directory and Customer Profile with credit invoice history.
- [x] Add debt/RBAC/checkout/profile regression coverage, verify tests/build/responsive UI, and publish.

## POS Inventory Validation & Draft Persistence

- [x] Audit POS cart provider, inventory stock fields, navigation lifecycle, product grid, and cart quantity controls.
- [x] Add stock-safe quantity validation with insufficient-stock feedback and checkout protection.
- [x] Persist active cart and selected customer across navigation with explicit clear/delete and hold actions.
- [x] Add high/low/zero stock indicators and disable zero-stock products in POS surfaces.
- [x] Add regression coverage, run tests/build, verify responsive POS behavior, and publish.

## Product Catalog Search & Database Quick Keys

- [x] Audit catalog schema/query/UI and current local Quick Key state, backend scope, and POS shortcut behavior.
- [x] Add branch-scoped QuickKeys schema, migration, secure read/write procedures, unique key validation, and reserved-key protection.
- [x] Add sticky debounced Product Catalog search across name, barcode/SKU, category, and variations/modifiers.
- [x] Replace local Quick Key mappings with unrestricted database-backed A-Z/0-9 assignment and POS initialization.
- [x] Add sync/RBAC/search regression coverage, run migration/tests/build, verify responsive UI, and publish.

- [x] Add debounced Product Catalog search across product name, barcode, SKU/reference, category, and variations/modifiers.
- [x] Persist product category and variations through Product Editor create/update flows.
- [x] Add branch-scoped database Quick Key schema and migrations with unique key/product constraints.
- [x] Load Quick Key mappings from the database in POS and persist Admin assignments for A-Z and 0-9.
- [x] Enforce reserved system-key and duplicate Quick Key validation with branch-scoped RBAC.
- [x] Add regression coverage for catalog search and database-backed Quick Key synchronization.
- [x] Verify Product Catalog and POS Quick Key layouts, tests, TypeScript, and production build.
- [x] Save and publish the completed Product Catalog and Quick Key release.

## Dynamic Quick Keys Management Refinement

- [x] Audit current Quick Keys UI and product lookup capability for scalable mapping management.
- [x] Replace pre-populated A-Z/0-9 controls with an active-mappings list and Add New Shortcut workflow.
- [x] Add an admin mapping dialog with single-character validation, real-time duplicate feedback, and individual delete controls.
- [x] Implement a searchable product combobox that queries products by name or barcode as the admin types.
- [x] Add regression coverage and verify the refined Quick Keys experience.
- [x] Publish the refined Quick Keys experience.

## Cash Out: Petty Cash & Employee Withdrawals

- [x] Audit active shifts, employee management, POS, dashboard, and existing ledger contracts.
- [x] Add a branch-scoped cash-out ledger schema and migration for employee advances and operational withdrawals.
- [x] Implement secured cash-out, employee search/history, active-shift reconciliation, and ledger procedures.
- [x] Build shared Cash Out form access from POS and Dashboard with conditional employee selection.
- [x] Add employee advances history and a chronological Expenses & Withdrawals ledger.
- [x] Add regression coverage, verify responsive screens, and publish the Cash Out module.

## Repository Architecture Review

- [x] Inspect the current frontend, backend, data layer, and build configuration.
- [x] Deliver the verified technology stack and architecture summary.

## Source-Code Backup Archive

- [x] Create a clean repository archive excluding dependencies, generated output, logs, and all secret files.
- [x] Verify archive contents and deliver the downloadable source-code backup artifact.

## TiDB Cloud Database Connection

- [x] Review the current schema and migration state before changing the database connection.
- [x] Set the supplied TiDB Cloud `DATABASE_URL` through managed project secrets (implemented via the exclusive managed `EXTERNAL_DATABASE_URL` secret because the built-in key is immutable).
- [x] Apply the current Drizzle migration set and verify required operational tables.
- [x] Validate the application database connection and publish the verified configuration update.

## External TiDB Runtime Configuration Retry

- [x] Apply the supplied TiDB Cloud connection through the managed runtime configuration.
- [x] Run and verify the current Drizzle migration set against the external TiDB database.

## Custom TiDB Runtime Transition

- [x] Update database resolution to require a managed external TiDB connection rather than the platform `DATABASE_URL`.
- [x] Store the supplied TiDB connection string as the managed custom database secret.
- [x] Initialize the external TiDB schema from the current Drizzle definitions and verify all core tables.
- [x] Verify application startup against TiDB, add regression coverage, and publish the transition.

## Cross-Platform Desktop and Mobile Packaging

- [x] Audit the existing web app, deployment URL, API boundary, and native packaging constraints.
- [x] Add a desktop packaging configuration for Windows without exposing database credentials.
- [x] Add a mobile packaging configuration for Android/iOS using the existing server API.
- [x] Build and validate packaging artifacts and cloud synchronization behavior.
- [x] Deliver installers, build artifacts, and platform-specific setup instructions.


## Cross-Platform Desktop and Mobile Packaging

- [x] Audit the web app, hosted API boundary, and native packaging constraints for Windows, Android, and iOS.
- [x] Add secure Windows desktop packaging without embedding TiDB credentials.
- [x] Add secure Android and iOS packaging configuration using the hosted HTTPS API.
- [x] Validate cloud synchronization and produce available platform build artifacts.
- [x] Deliver platform setup instructions and downloadable artifacts or build-ready packages.

## Android APK Delivery

- [x] Rebuild Android web assets and synchronize the Capacitor project against the hosted HTTPS API.
- [x] Compile and validate an installable Android debug APK.
- [x] Deliver the APK artifact with secure cloud-sync installation guidance.

## Native Android Lifecycle Enhancement

- [x] Audit the generated Android project and existing Capacitor API boundary.
- [x] Add native Capacitor lifecycle, connectivity, and Android back-navigation integration without exposing TiDB credentials.
- [x] Rebuild, validate, and deliver the enhanced installable Android APK.

## OAuth, Super Admin, and E-Commerce

- [x] Audit OAuth state handling, redirect-origin propagation, primary-owner Super Admin protections, and TiDB user/session mapping.
- [x] Fix the invalid OAuth state flow and add regression coverage for nonce, origin, and callback cookie behavior.
- [x] Harden the primary-owner Super Admin hierarchy and global staff-permission controls.
- [x] Verify login and authorization against TiDB, then publish the authentication and role update.
- [x] Deferred by user instruction: Do not add an e-commerce storefront, product catalog, cart, checkout, or inventory-synchronized online orders in this release.

## TiDB Interactive Workflow Restoration

- [x] Inventory every user-facing button, form submission, modal action, and route transition across global and branch workspaces.
- [x] Reproduce and trace failed actions through browser requests, tRPC procedures, authorization guards, and TiDB queries without altering business data.
- [x] Compare the deployed TiDB `adam_pos` schema against the current Drizzle definitions and restore any missing compatibility required by existing workflows.
- [x] Restore idempotent initialization of the required operational branches when a fresh TiDB database contains no branch records.
- [x] Repair broken UI action handlers, server procedures, and user-visible success/error states while preserving RBAC and branch isolation.
- [x] Add regression coverage for restored critical workflows, run the full test/build suite, visually validate key actions, and publish the verified restoration.

## Branch Creation Duplicate Validation

- [x] Trace branch form input normalization, server duplicate checks, and TiDB unique constraints for name, code, and branch type.
- [x] Reconcile duplicate default branch records created during the schema transition while preserving every existing reference and business record.
- [x] Preserve legitimate branch creation while returning clear localized Arabic feedback for duplicate name, code, type, and repeat submissions.
- [x] Add duplicate and successful-creation regression coverage, verify immediate form feedback, and publish the fix without changing the UI design.

## Invoice Extraction Performance and Exception Control

- [x] Audit the existing invoice upload, parser, staging, commit, and TiDB persistence paths against the historical product-field contract.
- [x] Optimize the server-side extraction path with a strict structured schema while accepting diverse invoice layouts and preserving existing extracted fields.
- [x] Add a persisted per-product alphanumeric Reference field through staging, commit, inventory records, and historical invoice details.
- [x] Detect abnormal or unmapped extracted items, pause them for explicit user confirmation, and persist the decision/audit detail before commit.
- [x] Add targeted extraction, reference, anomaly, and TiDB persistence coverage; validate the optimized path; run full validation and publish.

## Product Reference Form and Detection Enhancement

- [x] Audit invoice staging, manual product creation/edit forms, and product synchronization to locate all reference-field gaps.
- [x] Strengthen structured extraction instructions and validation so short unlabeled Latin alphanumeric supplier codes are recognized as product references without changing the historical fields.
- [x] Display and persist the Reference field in invoice staging and manual product-add/edit workflows while preserving the current UI design.
- [x] Verify reference detection, product creation, exception confirmation, and external TiDB persistence with regression and visual checks, then publish.

## Invoice Review Reference Visibility Fix

- [x] Audit the extracted-item review table, inline edit state, and commit payload for the missing visible Reference field.
- [x] Add an editable Reference column to every extracted invoice review row while preserving the existing table design and anomaly confirmation controls.
- [x] Verify reference edits flow through commit to TiDB product and invoice-line records, add regression coverage, and publish the fix.

## Invoice Review Full-Field Restoration

- [x] Compare the current review screen with its original supplier, product, quantity, purchase cost, selling price, barcode, and scanner-control contract.
- [x] Restore every missing original review field, input, and TiDB-connected product/stock workflow without removing or hiding any existing control.
- [x] Keep the editable alphanumeric Reference field additive in the full review table and manual product-entry form.
- [x] Add restoration regression coverage, run full UI/API/TiDB validation, and publish the verified workflow.

## Invoice Barcode, Margin, and Extraction Reliability Upgrade

- [x] Audit existing multi-barcode review controls, product price fields, parsing fallback behavior, and TiDB schema/contracts.
- [x] Restore per-line multi-barcode/QR management in the invoice review without removing USB or camera scanner controls.
- [x] Add editable profit-margin percentage with deterministic selling-price calculation and preserve manual selling-price overrides.
- [x] Persist barcode arrays, reference, selling price, and profit margin through transactional invoice commit to TiDB.
- [x] Strengthen vision extraction validation and fallback handling for diverse layouts without promising an unverified success rate.
- [x] Add regression coverage, validate build and TiDB connectivity, then publish the verified upgrade.

## Primary Invoice Review Reference Column

- [x] Audit the original review-and-barcode table and its existing Reference commit path.
- [x] Add a dedicated editable Reference input column adjacent to each row’s barcode assignment controls without removing existing columns.
- [x] Add regression coverage and validate the review payload, TiDB reference persistence, build, and published route.

## Optional Primary Review Profit Margin

- [x] Audit current primary-table pricing state, automatic margin calculation, and TiDB persistence fields.
- [x] Add an optional per-row margin toggle with editable percentage while retaining a visible manual selling-price input.
- [x] Verify margin-on calculation, margin-off manual prices, commit payload, TiDB persistence, build, and published route.

## Consolidated Primary Invoice Review

- [x] Audit redundant invoice review cards and confirm all required inputs are already available in the primary table.
- [x] Remove the separate complete-review and margin-review cards while retaining supplier, product, quantity, cost, margin, selling-price, Reference, and multi-barcode controls in the primary table.
- [x] Add regression coverage and validate the consolidated layout, TiDB commit payload, build, and published route.

## POS Instant Barcode Auto-Add

- [x] Audit the POS scan-field keyboard listener, TiDB product lookup, cart mutation, and focus behavior.
- [x] Submit manual and external-scanner barcode input immediately on Enter without an Add button and restore focus for continuous scans.
- [x] Add regression coverage and validate POS lookup, stock/price cart updates, build, and published route.

## POS Barcode Auto-Add and Reference Lookup

- [x] Audit scanner timing, existing barcode contracts, Reference search support, and branch-scoped TiDB lookup behavior.
- [x] Auto-submit rapid barcode/scanner input without Enter while keeping Enter as the explicit Reference-search trigger.
- [x] Add branch-scoped Reference lookup with clear not-found feedback and reuse existing cart, price, and stock validation.
- [x] Add regression coverage and validate POS barcode/Reference behavior, TiDB queries, build, and published route.

## POS Credit Navigation Shortcut

- [x] Audit existing POS dropdown/navigation controls and the customer Credit/Debt management route.
- [x] Add a styled الكريدي menu option that routes directly to Credit/Debt management without altering POS shortcuts or controls.
- [x] Add regression coverage and validate direct Credit navigation, build, and published route.

## POS Credit Action Visibility Repair

- [x] Inspect the active POS menu surface and identify why the prior Credit dropdown item was not visible to the user.
- [x] Render a visibly accessible الكريدي action alongside existing POS header/menu controls with direct Credit/Debt routing.
- [x] Add rendered UI regression coverage and verify the visible action, direct route, build, and published page.

## Customer Credit Transaction Actions

- [x] Audit customer debt schema, profile queries, invoice history, existing permissions, and transaction-log support.
- [x] Add secure TiDB-backed customer payment and manual-debt transaction procedures with balance updates and immutable ledger entries.
- [x] Add localized Make Payment and Add Debt actions with amount/note modal inputs and immediate profile refresh.
- [x] Add regression coverage and validate role security, balance calculation, ledger updates, TiDB schema, build, and published route.

## Customer Credit Invoice Detail and Returns

- [x] Audit existing sales invoice detail, return processing, stock restoration, and customer debt update contracts.
- [x] Extend authorized credit-invoice returns to select line quantities, restore stock, and reconcile customer debt safely.
- [x] Add compact responsive View Invoice and Return Product actions with detail and return modals in Credit Invoices History.
- [x] Add regression coverage and validate invoice detail, return inventory/debt effects, TiDB synchronization, build, and published route.

## Downloadable Source Archive

- [x] Audit repository contents and define safe exclusions for the complete source backup.
- [x] Create a complete source archive excluding dependencies, build outputs, logs, secrets, and temporary migration runners.
- [x] Verify archive contents and provide the archive with an accurate directory tree and setup notes.

<!-- Packaging request is tracked outside application feature history. -->

- [x] Package the latest source workspace as a downloadable archive with secrets and generated artifacts excluded.
- [x] Verify archive contents and provide the archive with an accurate directory tree and setup notes.

<!-- End packaging task -->

- [x] Deliver source backup archive and file tree.
