import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("portal and modal contrast contracts", () => {
  it("keeps all primary floating primitives in body-level Radix portals", () => {
    expect(read("./components/ui/select.tsx")).toContain("<SelectPrimitive.Portal>");
    expect(read("./components/ui/dropdown-menu.tsx")).toContain("<DropdownMenuPrimitive.Portal>");
    expect(read("./components/ui/popover.tsx")).toContain("<PopoverPrimitive.Portal>");
    expect(read("./components/ui/hover-card.tsx")).toContain("<HoverCardPrimitive.Portal data-slot=\"hover-card-portal\">");
    expect(read("./components/ui/dialog.tsx")).toContain("<DialogPortal");
    expect(read("./components/ui/alert-dialog.tsx")).toContain("<AlertDialogPortal>");
    expect(read("./components/ui/sheet.tsx")).toContain("<SheetPortal>");
  });

  it("keeps modal surfaces and controls readable in dark mode", () => {
    const dialog = read("./components/ui/dialog.tsx");
    const alert = read("./components/ui/alert-dialog.tsx");
    const sheet = read("./components/ui/sheet.tsx");
    const custom = read("./components/ManusDialog.tsx");
    const css = read("./index.css");
    expect(dialog).toContain("dark:bg-slate-900");
    expect(dialog).toContain("dark:text-gray-300");
    expect(alert).toContain("dark:bg-slate-900");
    expect(sheet).toContain("dark:bg-slate-900");
    expect(custom).toContain("dark:border-gray-700");
    expect(css).toContain('[data-slot="alert-dialog-content"]');
    expect(css).toContain("background-color: var(--input) !important");
  });
});
