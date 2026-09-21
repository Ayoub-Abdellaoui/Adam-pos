import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { invoiceReviewSessions, invoices } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";
import { sdk, type AuthenticatedUser } from "./sdk";
import { isSuperAdmin, requireBranchRole } from "./trpc";

export type InvoiceSourceRecord = {
  invoiceStoreId?: number;
  reviewUploadedByUserId?: number;
};

/**
 * A staged source has no branch yet, so only its uploader can retrieve it.
 * A committed source follows the same inventory-branch access boundary as
 * supplier invoice operations.
 */
export function canAccessInvoiceSource(
  user: AuthenticatedUser | null,
  source: InvoiceSourceRecord,
): boolean {
  if (!user) return false;
  if (source.reviewUploadedByUserId === user.id) return true;
  if (source.invoiceStoreId === undefined) return false;
  if (isSuperAdmin(user)) return true;

  try {
    requireBranchRole(user, source.invoiceStoreId, ["admin", "stock_manager"]);
    return true;
  } catch {
    return false;
  }
}

function isInvoiceSourceKey(key: string): boolean {
  return key.startsWith("invoice-sources/") && key.length <= 512 && !key.includes("\0");
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key || !isInvoiceSourceKey(key)) {
      res.status(404).send("Storage source not found");
      return;
    }

    let user: AuthenticatedUser;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).send("Authentication required");
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).send("Storage authorization unavailable");
      return;
    }

    try {
      const [[invoice], [reviewSession]] = await Promise.all([
        db
          .select({ storeId: invoices.storeId })
          .from(invoices)
          .where(eq(invoices.sourceFileKey, key))
          .limit(1),
        db
          .select({ uploadedByUserId: invoiceReviewSessions.uploadedByUserId })
          .from(invoiceReviewSessions)
          .where(
            and(
              eq(invoiceReviewSessions.sourceFileKey, key),
              eq(invoiceReviewSessions.uploadedByUserId, user.id),
            ),
          )
          .limit(1),
      ]);

      if (
        !canAccessInvoiceSource(user, {
          invoiceStoreId: invoice?.storeId,
          reviewUploadedByUserId: reviewSession?.uploadedByUserId,
        })
      ) {
        // Use one response for absent and unauthorized keys to avoid turning
        // the proxy into an invoice-source discovery endpoint.
        res.status(404).send("Storage source not found");
        return;
      }
    } catch (err) {
      console.error("[StorageProxy] authorization lookup failed:", err);
      res.status(503).send("Storage authorization unavailable");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
        signal: AbortSignal.timeout(30_000),
      });

      if (!forgeResp.ok) {
        console.error(`[StorageProxy] forge error: ${forgeResp.status}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
