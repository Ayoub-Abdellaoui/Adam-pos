import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import i18n from "./i18n";

type Dictionary = Record<string, unknown>;

function flattenKeys(value: Dictionary, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null ? flattenKeys(child as Dictionary, path) : [path];
  });
}

describe("accessibility and localization system", () => {
  it("contains translated navigation, theme, and required Arabic finance labels in all supported languages", async () => {
    for (const language of ["en", "ar", "fr"] as const) {
      await i18n.changeLanguage(language);
      expect(i18n.t("nav.globalStats")).not.toBe("nav.globalStats");
      expect(i18n.t("nav.suppliers")).not.toBe("nav.suppliers");
      expect(i18n.t("theme.toggle")).not.toBe("theme.toggle");
      expect(i18n.t("common.totalAmount")).not.toBe("common.totalAmount");
      expect(i18n.t("common.registerPayment")).not.toBe("common.registerPayment");
    }
    await i18n.changeLanguage("ar");
    expect(i18n.t("common.dashboard")).toBe("لوحة التحكم");
    expect(i18n.t("common.posCheckout")).toBe("نقطة البيع");
    expect(i18n.t("common.productsInventory")).toBe("المنتجات والمخزون");
    expect(i18n.t("common.suppliersInvoices")).toBe("الموردون والفواتير");
    expect(i18n.t("common.expenses")).toBe("المصاريف");
    expect(i18n.t("common.customerDebts")).toBe("ديون الزبائن");
    expect(i18n.t("common.customOrders")).toBe("الطلبات الخاصة");
    expect(i18n.t("common.totalAmount")).toBe("السعر الإجمالي");
    expect(i18n.t("common.amountPaid")).toBe("المبلغ المدفوع");
    expect(i18n.t("common.remainingDebt")).toBe("الباقي (الدين)");
    expect(i18n.t("common.printInvoice")).toBe("طباعة الفاتورة");
    expect(i18n.t("common.addSupplier")).toBe("إضافة ممون");
    expect(i18n.t("common.registerPayment")).toBe("تسجيل دفعة");
    await i18n.changeLanguage("en");
  });

  it("keeps translation leaf keys in parity across supported languages", () => {
    const resources = i18n.options.resources as Record<string, { translation: Dictionary }>;
    const englishKeys = flattenKeys(resources.en.translation).sort();
    for (const language of ["ar", "fr"]) {
      expect(flattenKeys(resources[language].translation).sort()).toEqual(englishKeys);
    }
  });

  it("defines opaque overlay, dark-mode, RTL, and Arabic typography rules", () => {
    const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    const documentWrapper = readFileSync(new URL("./components/I18nDocument.tsx", import.meta.url), "utf8");
    const theme = readFileSync(new URL("./contexts/ThemeContext.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(new URL("./components/DashboardLayout.tsx", import.meta.url), "utf8");
    const languageSwitcher = readFileSync(new URL("./components/LanguageSwitcher.tsx", import.meta.url), "utf8");
    const themeToggle = readFileSync(new URL("./components/ThemeToggle.tsx", import.meta.url), "utf8");
    expect(css).toContain("opacity: 1 !important");
    expect(css).toContain("z-index: 100 !important");
    expect(css).toContain(".dark [data-slot=\"card\"]");
    expect(`${dashboard}${languageSwitcher}${themeToggle}`).toContain("dark:bg-gray-800");
    expect(`${dashboard}${languageSwitcher}${themeToggle}`).toContain("dark:text-white");
    expect(`${dashboard}${languageSwitcher}${themeToggle}`).toContain("dark:border-gray-600");
    expect(css).toContain("color: #9ca3af !important");
    expect(css).toContain('html[dir="rtl"] body');
    expect(css).toContain('font-family: "Cairo"');
    expect(documentWrapper).toContain("split(\"-\")[0]");
    expect(documentWrapper).toContain("document.documentElement.dir = direction");
    expect(theme).toContain('localStorage.setItem("theme", theme)');
  });
});
