import { describe, expect, it } from "vitest";
import { calculateAnalytics, calculateGlobalStatistics } from "./analytics";

describe("calculateAnalytics", () => {
  it("calculates net revenue and historical-cost profit after a return", () => {
    const report = calculateAnalytics({
      stores: [{ id: 1, name: "Bookstore", type: "bookstore" }],
      sales: [{ id: 10, storeId: 1, storeName: "Bookstore", cashierName: "Alex", total: "30.00", createdAt: new Date("2026-08-13T09:00:00Z") }],
      saleLines: [{ saleId: 10, storeId: 1, quantity: 3, unitPrice: "10.00", unitDiscount: "0.00", unitCost: "4.00" }],
      returnLines: [{ saleId: 10, storeId: 1, quantity: 1, unitRefund: "10.00", unitCost: "4.00" }],
      lowStock: [],
    });

    expect(report.kpis).toMatchObject({ totalRevenue: 20, grossProfit: 12, operatingExpenses: 0, trueNetProfit: 12, netProfit: 12, totalItemsSold: 2, totalTransactions: 1 });
    expect(report.branchPerformance[0]).toMatchObject({ revenue: 20, grossProfit: 12, operatingExpenses: 0, trueNetProfit: 12, netProfit: 12, itemsSold: 2 });
    expect(report.salesTrend).toEqual([{ date: "2026-08-13", revenue: 30, itemsSold: 3, transactions: 1 }]);
  });
});

describe("calculateGlobalStatistics", () => {
  it("nets sales and returns, calculates branch contribution percentages, and ranks enterprise products", () => {
    const report = calculateGlobalStatistics({
      stores: [{ id: 1, name: "Bookstore", type: "bookstore" }, { id: 2, name: "Cosmetics", type: "cosmetics" }],
      sales: [{ storeId: 1, total: "100.00" }, { storeId: 2, total: "50.00" }],
      saleLines: [
        { storeId: 1, storeName: "Bookstore", productId: 101, productName: "Novel", quantity: 4, unitPrice: "25.00", unitCost: "10.00", unitDiscount: "0.00" },
        { storeId: 2, storeName: "Cosmetics", productId: 202, productName: "Serum", quantity: 2, unitPrice: "25.00", unitCost: "20.00", unitDiscount: "0.00" },
      ],
      returnLines: [{ storeId: 1, storeName: "Bookstore", productId: 101, productName: "Novel", quantity: 1, unitRefund: "25.00", unitCost: "10.00" }],
    });

    expect(report.kpis).toMatchObject({ totalSales: 125, grossProfit: 55, operatingExpenses: 0, trueNetProfit: 55, totalNetProfit: 55 });
    expect(report.branchContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ storeName: "Bookstore", revenue: 75, netProfit: 45, salesPercent: 60, profitPercent: 81.82 }),
      expect.objectContaining({ storeName: "Cosmetics", revenue: 50, netProfit: 10, salesPercent: 40, profitPercent: 18.18 }),
    ]));
    expect(report.topBestSelling.map(product => product.name)).toEqual(["Novel", "Serum"]);
    expect(report.topMostProfitable.map(product => product.name)).toEqual(["Novel", "Serum"]);
    expect(report.topBestSelling[0]).toMatchObject({ productId: 101, storeId: 1, storeName: "Bookstore" });
  });

  it("deducts posted operating expenses from gross profit to calculate True Net Profit", () => {
    const report = calculateGlobalStatistics({
      stores: [{ id: 1, name: "Cosmetics", type: "cosmetics" }],
      sales: [{ storeId: 1, total: "1500.00" }],
      saleLines: [{ storeId: 1, storeName: "Cosmetics", productId: 5, productName: "Serum", quantity: 3, unitPrice: "500.00", unitCost: "260.00", unitDiscount: "0.00" }],
      returnLines: [],
      expenses: [{ storeId: 1, amount: "175.50" }],
    });

    expect(report.kpis).toMatchObject({ totalSales: 1500, grossProfit: 720, operatingExpenses: 175.5, trueNetProfit: 544.5, totalNetProfit: 544.5 });
    expect(report.branchContributions[0]).toMatchObject({ grossProfit: 720, operatingExpenses: 175.5, trueNetProfit: 544.5, netProfit: 544.5 });
  });

  it("allows true net profit to be negative when operating expenses exceed gross profit", () => {
    const report = calculateGlobalStatistics({
      stores: [{ id: 1, name: "Bookstore", type: "bookstore" }],
      sales: [{ storeId: 1, total: "100.00" }],
      saleLines: [{ storeId: 1, storeName: "Bookstore", productId: 8, productName: "Notebook", quantity: 1, unitPrice: "100.00", unitCost: "70.00", unitDiscount: "0.00" }],
      returnLines: [],
      expenses: [{ storeId: 1, amount: "80.00" }],
    });

    expect(report.kpis.trueNetProfit).toBe(-50);
    expect(report.branchContributions[0]?.profitPercent).toBe(0);
  });
});
