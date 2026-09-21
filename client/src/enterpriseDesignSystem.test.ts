import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("enterprise design system", () => {
  it("defines a cohesive slate, indigo, semantic-status, table, and reduced-motion system", () => {
    const source = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    expect(source).toContain("--background: #f8fafc");
    expect(source).toContain("--primary: #1d4ed8");
    expect(source).toContain("--erp-success");
    expect(source).toContain("--erp-danger");
    expect(source).toContain("main table");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("duration: .01ms");
  });

  it("standardizes cards, buttons, dialog timing, and sidebar motion", () => {
    const card = readFileSync(new URL("./components/ui/card.tsx", import.meta.url), "utf8");
    const button = readFileSync(new URL("./components/ui/button.tsx", import.meta.url), "utf8");
    const dialog = readFileSync(new URL("./components/ui/dialog.tsx", import.meta.url), "utf8");
    const sidebar = readFileSync(new URL("./components/ui/sidebar.tsx", import.meta.url), "utf8");
    expect(card).toContain("rounded-xl");
    expect(button).toContain("rounded-lg");
    expect(dialog).toContain("duration-150");
    expect(sidebar).toContain("duration-200 ease-out");
  });
});
