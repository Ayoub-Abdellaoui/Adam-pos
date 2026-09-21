import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("dropdown layout and Arabic typography contracts", () => {
  it("keeps shared menu primitives out of document flow", () => {
    expect(read("./components/ui/select.tsx")).toContain("<SelectPrimitive.Portal>");
    expect(read("./components/ui/dropdown-menu.tsx")).toContain("<DropdownMenuPrimitive.Portal>");
    expect(read("./components/ui/popover.tsx")).toContain("<PopoverPrimitive.Portal>");
    const css = read("./index.css");
    expect(css).toContain("[data-radix-popper-content-wrapper]");
    expect(css).toContain("position: fixed !important");
    expect(css).toContain("z-index: 100 !important");
  });

  it("applies Cairo and relaxed line-height to Arabic RTL surfaces", () => {
    const css = read("./index.css");
    expect(css).toContain('html[lang="ar"]');
    expect(css).toContain('html[dir="rtl"]');
    expect(css).toContain('font-family: "Cairo"');
    expect(css).toContain("line-height: 1.75");
  });
});
