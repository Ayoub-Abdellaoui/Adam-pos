/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/CameraBarcodeScanner", () => ({ CameraBarcodeScanner: () => null }));

import { ProductEditor } from "./ProductManagement";

describe("Add Single Product form", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requires and saves the full direct-inventory product payload with a primary barcode", () => {
    const onSave = vi.fn();
    render(<ProductEditor open onOpenChange={vi.fn()} singleEntry stores={[{ id: 1, name: "Bookstore" }]} defaultStoreId="1" saving={false} onSave={onSave} />);

    expect(screen.getByText("Add Single Product")).toBeTruthy();
    expect(screen.getByLabelText("Product name")).toBeTruthy();
    expect(screen.getByLabelText("Purchase price (Cost)")).toBeTruthy();
    expect(screen.getByLabelText("Selling price (DZD)")).toBeTruthy();
    expect(screen.getByLabelText("Stock quantity")).toBeTruthy();
    expect(screen.getByLabelText("SKU / Reference")).toBeTruthy();
    expect(screen.getByPlaceholderText("Primary barcode")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Single Product Test" } });
    fireEvent.change(screen.getByLabelText("Purchase price (Cost)"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Selling price (DZD)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Stock quantity"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Single Product" }));
    expect(screen.getByText("Add a primary barcode before saving a single product.")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Primary barcode"), { target: { value: "6123456789012" } });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));
    expect(screen.getByText("Primary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Single Product" }));

    expect(onSave).toHaveBeenCalledWith({ storeId: "1", name: "Single Product Test", sku: "", reference: "", category: "", variations: "", purchasePrice: "120", sellingPrice: "250", stockQuantity: "8", barcodes: ["6123456789012"] });
  });
});
