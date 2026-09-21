import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local employee sign-in UI", () => {
  it("offers credential login without Manus OAuth sign-in", () => {
    const source = readFileSync(new URL("./DashboardLayout.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.auth.localLogin.useMutation");
    expect(source).toContain("autoComplete=\"username\"");
    expect(source).toContain("autoComplete=\"current-password\"");
    expect(source).not.toContain("startLogin");
  });

  it("keeps supplier and expense navigation inside the Admin/Supervisor-only global and branch menu paths", () => {
    const source = readFileSync(new URL("./DashboardLayout.tsx", import.meta.url), "utf8");
    expect(source).toContain('path: "/global/suppliers"');
    expect(source).toContain('path: "/global/expenses"');
    expect(source).toContain('can("admin", "supervisor") ? [{ icon: BarChart3');
    expect(source).toContain('path: `/branches/${branchId}/suppliers`');
    expect(source).toContain('path: `/branches/${branchId}/expenses`');
    expect(source).not.toContain('can("admin", "cashier", "supervisor") ? [{ icon: Landmark');
    expect(source).toContain('t("nav.operations")');
    expect(source).toContain('t("nav.inventory")');
    expect(source).toContain('t("nav.finance")');
    expect(source).toContain('t("nav.administration")');
    expect(source).toContain("SidebarGroupLabel");
  });
});
