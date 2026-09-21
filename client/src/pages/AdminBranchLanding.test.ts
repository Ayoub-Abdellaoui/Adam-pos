import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import i18n from "../i18n";

describe("Global Administration branch landing", () => {
  it("uses dashboard translation keys and preserves branch selection and lifecycle controls", () => {
    const source = readFileSync(new URL("./AdminBranchLanding.tsx", import.meta.url), "utf8");
    expect(source).toContain("useTranslation");
    expect(source).toContain('t("dashboard.chooseBranchWorkspace")');
    expect(source).toContain('t("dashboard.globalStatistics")');
    expect(source).toContain('t("dashboard.globalStatisticsDescription")');
    expect(source).toContain('t("dashboard.reportingPeriod")');
    expect(source).toContain('t("dashboard.addNewBranch")');
    expect(source).toContain('t("dashboard.globalTotalDebt")');
    expect(source).toContain("dark:text-white");
    expect(source).toContain("trpc.enterprise.branches.list.useQuery");
    expect(source).toContain("trpc.enterprise.branches.active.useQuery");
    expect(source).toContain("filter(branch => branch.isActive)");
    expect(source).toContain("trpc.enterprise.branches.create.useMutation");
    expect(source).toContain('error.data?.code === "CONFLICT" ? t("dashboard.branchDuplicate") : error.message');
    expect(source).toContain("trpc.enterprise.branches.remove.useMutation");
    expect(source).toContain("branchTarget(branch.id)");
    expect(source).toContain("trpc.enterprise.globalStatistics.useQuery");
    expect(source).toContain("trpc.srm.accountsPayable.globalTotal.useQuery");
    expect(source).toContain("trpc.srm.accountsPayable.supplierBalances.useQuery");
    expect(source).toContain("isSuperAdmin && <><CashOutDialog");
    expect(source).not.toContain(">Choose a branch workspace</h1>");
    expect(source).not.toContain(">Global Statistics</h2>");
  });

  it("renders the exact requested Arabic dashboard translations", async () => {
    await i18n.changeLanguage("ar");
    expect(i18n.t("dashboard.chooseBranchEyebrow")).toBe("الإدارة العامة");
    expect(i18n.t("dashboard.chooseBranchWorkspace")).toBe("اختر مساحة عمل الفرع");
    expect(i18n.t("dashboard.chooseBranchDescription")).toBe("يعمل كل فرع نشط بنفس نظام نقاط البيع، المخزون، الموردين، المصاريف، الإحصائيات، وصلاحيات الأدوار. حدد فرعاً للدخول.");
    expect(i18n.t("dashboard.addNewBranch")).toBe("إضافة فرع جديد");
    expect(i18n.t("dashboard.enterpriseReporting")).toBe("تقارير المؤسسة");
    expect(i18n.t("dashboard.globalStatistics")).toBe("الإحصائيات العامة");
    expect(i18n.t("dashboard.globalStatisticsDescription")).toBe("يعكس إجمالي الربح المبيعات التاريخية؛ يتم طرح المصاريف التشغيلية لحساب الربح الصافي الحقيقي.");
    expect(i18n.t("dashboard.reportingPeriod")).toBe("فترة التقرير");
    expect(i18n.t("dashboard.thisMonth")).toBe("هذا الشهر");
    expect(i18n.t("dashboard.branchDuplicate")).toBe("هذا الفرع أو الكود موجود مسبقاً.");
    await i18n.changeLanguage("en");
  });
});
