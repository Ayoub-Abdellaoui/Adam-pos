# Adam POS

Adam POS is a React/Vite frontend with an Express/tRPC backend, Drizzle ORM, MySQL/TiDB persistence, local email/password authentication, branch-scoped authorization, POS operations, inventory, sales, returns, supplier invoices, OCR-assisted invoice processing, reporting, and native packaging configuration.

This archive is a source export of the current project state. It excludes only generated dependencies and deployment-local metadata: `node_modules/`, `dist/`, `.git/`, `.manus-logs/`, and `.project-config.json`. The source tree, configuration, migrations, tests, scripts, documentation, frontend, backend, shared code, and native-platform files are included.

## Runtime requirements

The project was validated with **Node.js 22.13.0** and **pnpm 10.4.1**. Use Node.js 22.x and pnpm 10.x for the closest match. The `package.json` package manager declaration is retained in the export.

## Installation

```bash
pnpm install --frozen-lockfile
```

Copy the environment template and provide values through the shell, a local environment manager, or the deployment platform’s secret store:

```bash
cp ENV.example .env
```

Do not commit `.env` or any file containing credentials.

## Required environment variables

The production server validates these variables before starting:

| Variable | Required | Purpose |
|---|---:|---|
| `JWT_SECRET` | Yes | Signs the existing HttpOnly session cookie. Use at least 32 random characters and keep it stable for the deployment. |
| `EXTERNAL_DATABASE_URL` | Yes | TLS-enabled MySQL/TiDB connection string for the Adam POS database. |
| `OWNER_OPEN_ID` | Yes | Existing internal identity used by the current Owner/Super Admin protection mechanism. |
| `BUILT_IN_FORGE_API_URL` | Yes | Base URL for the existing Manus Forge service. |
| `BUILT_IN_FORGE_API_KEY` | Yes | Server-side credential for the existing Manus Forge service. |
| `NODE_ENV` | Runtime | Set to `development` for local development or `production` for a production start. |
| `PORT` | Optional | Listening port; the server defaults to its configured runtime port when omitted. |
| `VITE_FRONTEND_FORGE_API_URL` | Optional | Forge URL used by the frontend Google Maps proxy component when enabled. |
| `VITE_FRONTEND_FORGE_API_KEY` | Optional | Frontend Forge credential used by the Maps component when enabled. |
| `VITE_ANALYTICS_ENDPOINT` | Optional | Analytics endpoint referenced by `client/index.html`. |
| `VITE_ANALYTICS_WEBSITE_ID` | Optional | Analytics website identifier referenced by `client/index.html`. |

`ENV.example` contains names and safe placeholders only. Never put a database password, API key, JWT secret, token, or OAuth credential in source control.

## Local development

Start the development server with:

```bash
NODE_ENV=development pnpm run dev
```

The server starts the Vite frontend and Express/tRPC backend together. Local authentication uses the existing email/password flow backed by `users` and `local_credentials`; it does not require Manus OAuth. Database-backed pages require a reachable `EXTERNAL_DATABASE_URL`.

## Production build and start

Build the frontend and bundled backend:

```bash
pnpm run build
```

Start the built application:

```bash
NODE_ENV=production pnpm start
```

The production validator fails closed when `JWT_SECRET`, `EXTERNAL_DATABASE_URL`, `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL`, or `BUILT_IN_FORGE_API_KEY` is missing or malformed.

## TiDB Cloud connection

Create or use the existing Adam POS TiDB Cloud database and obtain a connection string from the TiDB Cloud SQL editor or connection dialog. Set it only as `EXTERNAL_DATABASE_URL` in the runtime secret store. The application parses the URL with `mysql2`, connects with TLS certificate verification enabled, and uses the database named in the URL path.

Example shape, with no real value:

```text
EXTERNAL_DATABASE_URL=mysql://USERNAME:PASSWORD@HOST:4000/DATABASE
```

The current project contains Drizzle schema declarations and migration SQL under `drizzle/`. Do not run migrations or `db:push` against an existing production database unless the migration has been reviewed and explicitly approved. A read-only readiness check uses `SELECT 1`.

## Tests and validation

Run TypeScript validation:

```bash
pnpm run check
```

Run the complete Vitest suite:

```bash
pnpm test
```

Focused authentication, authorization, enrollment, POS, invoice-parser, database-connection, and workflow-readiness tests are located under `server/` and `server/routers/`. Tests use mocks or read-only checks where appropriate; review any test before pointing it at production data.

## External services and Manus dependencies

### TiDB Cloud

TiDB Cloud is the external relational database used through `EXTERNAL_DATABASE_URL`. Database access is implemented in `server/db.ts` and the Drizzle schema is in `drizzle/schema.ts`.

### Manus Forge

The application still depends on the existing Manus Forge service and it has intentionally not been removed. The server-side Forge base URL and credential are `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY`.

Forge-backed integrations are implemented in:

- `server/_core/dataApi.ts` for external data API calls;
- `server/_core/llm.ts` for invoice/OCR-related vision and language-model operations;
- `server/_core/imageGeneration.ts` for image-generation capabilities;
- `server/_core/voiceTranscription.ts` for audio transcription;
- `server/_core/notification.ts` and `server/_core/heartbeat.ts` for notification/heartbeat operations;
- `server/_core/map.ts` and `client/src/components/Map.tsx` for the Maps proxy integration;
- `server/storage.ts` and `server/_core/storageProxy.ts` for managed storage-related behavior;
- `server/invoiceParser.ts` and `server/routers/inventory.ts` for OCR-assisted invoice processing.

Some frontend map behavior can use `VITE_FRONTEND_FORGE_API_URL` and `VITE_FRONTEND_FORGE_API_KEY`. Keep server-only Forge credentials out of frontend code.

### Manus OAuth

The current authentication implementation uses local email/password credentials, scrypt password hashing, JWT sessions, HttpOnly/Secure/SameSite cookies, CSRF/same-origin protections, and the existing rate limiting. The active local-auth source is in `server/localAuth.ts`, `server/_core/sdk.ts`, `server/_core/context.ts`, and the authentication procedures in `server/routers.ts` and `server/routers/users.ts`. Manus OAuth is not required for the current local login flow.

### Making the application fully independent of Manus

To remove the remaining Manus dependency, replace each Forge-backed integration with independently hosted or separately contracted equivalents, then remove the Forge environment variables and adapt the corresponding modules and tests. OCR/vision, LLM, image generation, voice transcription, maps proxying, notifications, heartbeat behavior, and storage need separate replacement decisions. Authentication can remain independent using the current local credential and session infrastructure, but any deployment-specific Owner identity and secret-management process must be preserved securely.

## Native packaging

The export retains Capacitor and Electron configuration, including `android/`, `ios/`, `desktop/`, `capacitor.config.ts`, and `electron-builder.yml`. Native builds require the corresponding Android SDK, Xcode, or Electron packaging toolchain in addition to Node.js and pnpm.

## Data-safety notes

This source export does not perform database migrations, `db:push`, resets, seeds, or data writes. Do not run those commands automatically when deploying the archive. Preserve the existing database, user IDs, branch relationships, roles, and business records.
