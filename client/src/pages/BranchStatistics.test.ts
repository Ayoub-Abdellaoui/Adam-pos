import { describe, expect, it } from "vitest";
import { calculateBranchInventoryStatistics } from "./BranchStatistics";

describe("branch inventory statistics", () => {
  it("sums current stock value by product quantity", () => {
    expect(calculateBranchInventoryStatistics([
      { purchasePrice: "10", sellingPrice: "15", stockQuantity: 5 },
      { purchasePrice: 20, sellingPrice: 25, stockQuantity: 2 },
    ])).toEqual({
      totalCapital: 90,
      totalSales: 125,
      totalProfit: 35,
      profitPercentage: (35 / 90) * 100,
      productCount: 2,
      unitCount: 7,
    });
  });

  it("avoids division by zero when the branch has no capital", () => {
    expect(calculateBranchInventoryStatistics([
      { purchasePrice: 0, sellingPrice: 12, stockQuantity: 3 },
    ]).profitPercentage).toBe(0);
  });
});
