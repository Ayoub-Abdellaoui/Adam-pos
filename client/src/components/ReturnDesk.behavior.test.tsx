/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const lookupReturnBarcode = vi.fn().mockResolvedValue({ id: 1, name: "Hand Cream", barcode: "9988", retailPrice: "500" });

vi.mock("@/hooks/useBarcodeScanner", () => ({ useBarcodeScanner: vi.fn() }));
vi.mock("@/components/CameraBarcodeScanner", () => ({ CameraBarcodeScanner: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ pos: { lookupReturnBarcode: { fetch: lookupReturnBarcode } } }),
    pos: {
      findReceipt: { useQuery: () => ({ data: undefined, isFetching: false, error: undefined }) },
      processReturn: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      processDirectReturn: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { ReturnDesk } from "./ReturnDesk";

describe("ReturnDesk direct return quantities", () => {
  afterEach(() => {
    cleanup();
    lookupReturnBarcode.mockClear();
  });

  it("shows the approved no-invoice notice and supports typed direct-return quantities", async () => {
    render(<ReturnDesk onClose={vi.fn()} previewStoreId={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Direct items" }));
    expect(screen.getByText(/no original Quantity Sold exists/i)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Scan or enter a product barcode"), { target: { value: "9988" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    const quantity = await screen.findByLabelText("Direct return quantity for Hand Cream");
    expect((quantity as HTMLInputElement).value).toBe("1");
    fireEvent.change(quantity, { target: { value: "3" } });

    await waitFor(() => expect((quantity as HTMLInputElement).value).toBe("3"));
    expect(screen.queryByText("Quantity sold")).toBeNull();
  });
});
