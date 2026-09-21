import { describe, expect, it } from "vitest";
import { calculateProfitMarginPercent, calculateSellingPrice } from "./InvoiceStaging";

describe("consolidated invoice review pricing", () => {
  it("calculates selling price from purchase cost and enabled margin", () => {
    expect(calculateSellingPrice(50, 20)).toBe(60);
    expect(calculateSellingPrice(33.33, 15)).toBe(38.33);
  });

  it("retains the direct pricing calculation available to manual-price rows", () => {
    expect(calculateProfitMarginPercent(50, 60)).toBe(20);
    expect(calculateProfitMarginPercent(0, 60)).toBe(0);
  });
});
