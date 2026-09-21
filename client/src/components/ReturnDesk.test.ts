import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ReturnDesk sold quantity labels", () => {
  it("makes the original invoice quantity sold explicit and avoids inventing it for direct returns", () => {
    const source = readFileSync(new URL("./ReturnDesk.tsx", import.meta.url), "utf8");
    expect(source).toContain("Quantity sold");
    expect(source).toContain("Quantity sold is the original quantity on that invoice");
    expect(source).toContain("Direct returns are not linked to an invoice");
    expect(source).toContain("Return quantity");
    expect(source).toContain("Direct return quantity for ${item.name}");
  });
});
