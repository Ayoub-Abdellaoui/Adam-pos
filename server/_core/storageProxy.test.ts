import { describe, expect, it } from "vitest";
import { canAccessInvoiceSource } from "./storageProxy";
import type { AuthenticatedUser } from "./sdk";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 7,
    openId: "staff-user",
    name: "Staff User",
    email: null,
    loginMethod: "manus",
    role: "cashier",
    storeId: null,
    branchRoles: [],
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

describe("invoice storage source authorization", () => {
  it("requires an authenticated non-cron user and a known invoice or review source", () => {
    expect(canAccessInvoiceSource(null, { invoiceStoreId: 1 })).toBe(false);
    expect(canAccessInvoiceSource(user({ isCron: true }), { invoiceStoreId: 1 })).toBe(false);
    expect(canAccessInvoiceSource(user(), {})).toBe(false);
  });

  it("permits staged review sources only to their uploader", () => {
    expect(
      canAccessInvoiceSource(user(), { reviewUploadedByUserId: 7 }),
    ).toBe(true);
    expect(
      canAccessInvoiceSource(user({ id: 8, role: "super_admin", isSuperAdmin: true }), {
        reviewUploadedByUserId: 7,
      }),
    ).toBe(false);
  });

  it("enforces inventory branch roles for committed invoice sources", () => {
    expect(
      canAccessInvoiceSource(
        user({ branchRoles: [{ storeId: 2, role: "stock_manager" }] }),
        { invoiceStoreId: 2 },
      ),
    ).toBe(true);
    expect(
      canAccessInvoiceSource(
        user({ branchRoles: [{ storeId: 3, role: "admin" }] }),
        { invoiceStoreId: 2 },
      ),
    ).toBe(false);
    expect(
      canAccessInvoiceSource(
        user({ branchRoles: [{ storeId: 2, role: "cashier" }] }),
        { invoiceStoreId: 2 },
      ),
    ).toBe(false);
    expect(
      canAccessInvoiceSource(
        user({ role: "super_admin", isSuperAdmin: true }),
        { invoiceStoreId: 2 },
      ),
    ).toBe(true);
  });
});