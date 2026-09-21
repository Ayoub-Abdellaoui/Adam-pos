import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("localization and dark-mode remediation contracts", () => {
  it("wraps the application with the initialized i18next provider", () => {
    const source = read("./main.tsx");
    expect(source).toContain("I18nextProvider");
    expect(source).toContain("i18n={i18n}");
    expect(source).toContain("<App />");
  });

  it("uses translated controls in priority enterprise and product views", () => {
    const enterprise = read("./pages/EnterpriseOperations.tsx");
    const finance = read("./pages/FinancialManagement.tsx");
    const product = read("./pages/ProductDetails.tsx");
    expect(enterprise).toContain('t("common.globalBranchAdministration")');
    expect(enterprise).toContain('t("common.branchOperations")');
    expect(finance).toContain('t("common.supplierName")');
    expect(finance).toContain('t("common.createSupplier")');
    expect(product).toContain('t("common.sellingPrice")');
    expect(product).toContain('t("common.purchasePrice")');
  });

  it("keeps shared controls and surfaces on semantic dark-aware tokens", () => {
    const css = read("./index.css");
    const enterprise = read("./pages/EnterpriseOperations.tsx");
    const finance = read("./pages/FinancialManagement.tsx");
    expect(css).toContain("@custom-variant dark");
    expect(enterprise).toContain("dark:bg-gray-800");
    expect(finance).toContain("dark:bg-gray-800");
    expect(finance).toContain("dark:text-gray-300");
  });
});
