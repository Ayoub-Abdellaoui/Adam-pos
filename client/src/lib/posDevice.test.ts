/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { getCustomerDraftStorageKey, getPosCartStorageKey, getPosDeviceId } from "./posDevice";

afterEach(() => {
  localStorage.clear();
});

describe("POS device-scoped storage", () => {
  it("keeps one stable device identifier across calls", () => {
    const first = getPosDeviceId();
    const second = getPosDeviceId();
    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(localStorage.getItem("cloud-pos:device-id:v1")).toBe(first);
  });

  it("uses device-scoped cart and customer draft keys", () => {
    const deviceId = getPosDeviceId();
    expect(getPosCartStorageKey()).toBe(`cloud-pos:active-draft:v2:${deviceId}`);
    expect(getCustomerDraftStorageKey()).toBe(`cloud-pos:customer-draft:v2:${deviceId}`);
  });

  it("keeps simulated device carts on different storage keys", () => {
    const firstDeviceId = getPosDeviceId();
    const firstCartKey = getPosCartStorageKey();
    localStorage.setItem(firstCartKey, "device-a-cart");
    localStorage.removeItem("cloud-pos:device-id:v1");
    const secondDeviceId = getPosDeviceId();
    const secondCartKey = getPosCartStorageKey();
    expect(secondDeviceId).not.toBe(firstDeviceId);
    expect(secondCartKey).not.toBe(firstCartKey);
    expect(localStorage.getItem(firstCartKey)).toBe("device-a-cart");
    expect(localStorage.getItem(secondCartKey)).not.toBe("device-a-cart");
  });

  it("migrates legacy drafts once without deleting the legacy values", () => {
    localStorage.setItem("cloud-pos:active-draft:v1", "cart-draft");
    localStorage.setItem("cloud-pos:customer-draft:v1", "customer-draft");
    const cartKey = getPosCartStorageKey();
    const customerKey = getCustomerDraftStorageKey();
    expect(localStorage.getItem(cartKey)).toBe("cart-draft");
    expect(localStorage.getItem(customerKey)).toBe("customer-draft");
    expect(localStorage.getItem("cloud-pos:active-draft:v1")).toBe("cart-draft");
    expect(localStorage.getItem("cloud-pos:customer-draft:v1")).toBe("customer-draft");
  });
});
