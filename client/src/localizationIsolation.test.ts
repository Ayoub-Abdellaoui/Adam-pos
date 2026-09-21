import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function productionClientFiles(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap(entry => {
    const path = join(root, entry);
    if (entry === "i18n.ts" || entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) return [];
    if (statSync(path).isDirectory()) return productionClientFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("isolated language output", () => {
  it("keeps Arabic literals inside the translation dictionary only", () => {
    const source = productionClientFiles(join(process.cwd(), "client/src"))
      .map(path => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/[\u0600-\u06ff]/u);
    expect(source).not.toMatch(/Miscellaneous\s*\/\s*عنصر متنوع/u);
    expect(source).not.toMatch(/Custom Amount\s*\/\s*مبلغ مخصص/u);
    expect(source).not.toMatch(/Reprint Receipt\s*\/\s*إعادة طباعة الفاتورة/u);
  });
});

