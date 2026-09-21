/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ printIsolatedReceipt: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/thermalPrint", () => ({ printIsolatedReceipt: mocks.printIsolatedReceipt }));
vi.mock("react-barcode", async () => {
  const ReactModule = await import("react");
  return { default: () => ReactModule.createElement("svg", { width: "100", height: "40" }, ReactModule.createElement("rect", { x: "4", y: "0", width: "2", height: "38", fill: "#000" })) };
});

import "@/i18n";
import i18n from "@/i18n";
import { ThermalReceipt } from "./ThermalReceipt";

const receipt = {
  receiptNumber: "R-1001",
  invoiceNumber: "123456789012",
  storeName: "Bookstore",
  cashierName: "Cashier",
  createdAt: "2026-08-14T10:00:00.000Z",
  subtotal: "250",
  discountTotal: "0",
  total: "250",
  lines: [{ productName: "Notebook", quantity: 1, unitPrice: "250", unitDiscount: "0", lineTotal: "250" }],
};

describe("ThermalReceipt isolated print workflow", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    Object.defineProperty(window, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0) });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    mocks.printIsolatedReceipt.mockReset();
  });

  it("waits for the mounted barcode paint before starting isolated printing from the manual action", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<ThermalReceipt receipt={receipt} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    expect(mocks.printIsolatedReceipt).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(321); });
    expect(mocks.printIsolatedReceipt).toHaveBeenCalledTimes(1);
    expect(mocks.printIsolatedReceipt).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it("auto-prints one completed receipt through the isolated target after paint readiness", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<ThermalReceipt receipt={receipt} onClose={vi.fn()} autoPrint />);

    expect(screen.getByText(/Opening the print dialog/i)).toBeTruthy();
    expect(mocks.printIsolatedReceipt).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(401); });
    expect(mocks.printIsolatedReceipt).toHaveBeenCalledTimes(1);
    expect(mocks.printIsolatedReceipt).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it("renders a compact semantic thermal receipt with ordinary document-flow content", () => {
    render(<ThermalReceipt receipt={receipt} onClose={vi.fn()} />);
    const receiptArticle = screen.getByText("Adam Stores").closest("article");
    expect(receiptArticle).toBeTruthy();
    expect(receiptArticle?.className).toContain("max-w-[80mm]");
    expect(screen.getByRole("heading", { name: "Adam Stores" })).toBeTruthy();
    expect(screen.getByText("Thank you for your visit")).toBeTruthy();
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Item" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Qty" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeTruthy();
    expect(screen.getByText("Notebook").closest("tr")).toBeTruthy();
    receiptArticle?.querySelectorAll("*").forEach(element => {
      expect(element.className).not.toContain("absolute");
      expect(element.className).not.toContain("grid");
    });
  });
});
