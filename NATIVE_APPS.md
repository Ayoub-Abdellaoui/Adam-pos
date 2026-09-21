# Cloud POS Native App Packaging

The native clients are secure wrappers around the published Cloud POS web application. They load `https://cloudposinv-uew3onk4.manus.space` and communicate with the existing HTTPS `/api/trpc` API. The TiDB Cloud `adam_pos` credentials remain exclusively on the server and are never bundled into Electron, Android, or iOS artifacts.

## Windows desktop

Install dependencies with `pnpm install`, then build the Windows installer with `pnpm desktop:win`. Electron Builder writes an NSIS installer and a portable executable under `artifacts/desktop/`. Use `pnpm desktop:dir` to create an unpacked local test build. The optional `CLOUD_POS_APP_URL` environment variable can point a development build at another HTTPS deployment; production defaults to the published Cloud POS URL.

Windows artifacts require a Windows-compatible Electron Builder environment. On a Windows machine, run `pnpm desktop:win` and distribute the generated `.exe` files. Code signing can be added through the standard Electron Builder certificate environment variables before public distribution.

## Android

The repository contains `capacitor.config.ts` with HTTPS-only navigation to the published app. Install the Android platform once with `pnpm mobile:add:android`, then synchronize with `pnpm mobile:sync`. Open the native project with `pnpm mobile:open:android`; Android Studio can then produce a signed APK or AAB. A configured Android SDK, Gradle, and signing keystore are required for release builds.

## iOS

Install the iOS platform once with `pnpm mobile:add:ios`, synchronize with `pnpm mobile:sync`, and open the native project with `pnpm mobile:open:ios`. iOS builds require macOS, Xcode, an Apple Developer account, and a provisioning profile. The Linux build environment cannot produce a signed `.ipa` because Apple requires Xcode for that step.

## Cloud synchronization and security

All clients use the same hosted tRPC API and authentication flow. Inventory, sales, customer credit, shifts, cash-outs, suppliers, and role checks therefore remain centralized and branch-scoped in the server and TiDB Cloud database. Do not place `DATABASE_URL`, `EXTERNAL_DATABASE_URL`, JWT secrets, OAuth secrets, or any API credential in client-side environment files or native resources.
