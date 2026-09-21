import { describe, expect, it } from "vitest";
import { formatCompactDZD, formatDZD } from "./currency";

describe("Algerian Dinar formatting", () => {
  it("formats normal and compact business totals with DZD rather than a dollar sign", () => {
    expect(formatDZD(1250.5)).toContain("DZD");
    expect(formatDZD(1250.5)).not.toContain("$");
    expect(formatCompactDZD(1_250_000)).toContain("DZD");
  });
});
