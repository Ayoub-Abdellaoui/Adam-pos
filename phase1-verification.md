# Phase 1 verification

The Admin’s root route now displays the Phase 1 branch-selection landing page. Desktop verification showed the Global Administration hero, active Bookstore, Clothing, and Cosmetics cards, and a visible Add New Branch control. Mobile verification showed a single-column card layout, a large reachable Add New Branch button, and readable branch identity, type, code, product count, select, and delete controls.

The Bookstore card now opens `/branches/2/products`, which visibly labels the workspace as the Bookstore Inventory Hub and lists only Bookstore products with barcode previews, edit controls, Add Single Product, and Import Bulk Invoice actions. The linked bulk-invoice route exposes the existing AI intake interface with a return path to Bookstore products.

The role-isolation update was visually verified with an authenticated Super Admin session. The global landing sidebar shows only All Branches, Global Statistics, and Global Roles / Super Admins. A Bookstore route switches to a branch-tools sidebar with branch product, invoice, POS, statistics, operations, and staff entries. The Bookstore staff screen explicitly states that assignments apply only to the active branch, while the global role screen lists only Super Admin identities.

The role-edit update was visually verified at both levels. The Bookstore employee list now displays an Edit action beside the Cashier badge and remove action, and the Global Super Admin directory displays Edit Role beside each Super Admin identity. Both surfaces retain the contextual sidebar and the scope explanation for their respective permission model.

At the mobile branch-staff viewport, the branch-only role explanation, Assign branch role control, existing role badge, Edit action, and removal action all remain readable and available without horizontal overflow.

The credential-based employee management update was visually verified at desktop width. Bookstore branch staff management now displays Add Employee beside branch-only role guidance and retains per-employee Edit controls. The Global Super Admin directory independently displays Add Employee for global staff creation and retains Edit Role controls, preserving the two management contexts.

The local credential migration was verified in the database. It provides a per-user primary key, unique employee email, required first and last names, and a required password-hash column in a separate `local_credentials` record rather than storing passwords on the primary user profile.

The approved Phase 2 Global Statistics module was visually verified for a Super Admin at desktop and mobile widths. The global landing now presents a period selector above Total Sales and Total Net Profit cards, branch sales/profit contribution bars, and separate Top 5 best-selling and most-profitable rankings before the unchanged branch-card grid. The single-column mobile view keeps the reporting period, KPI values, contribution labels, rankings, and branch entry cards readable without horizontal overflow.
