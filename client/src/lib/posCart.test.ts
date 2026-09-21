import { describe, expect, it } from "vitest";
import { MAX_POS_CARTS, createInitialPosCartState, posCartReducer } from "./posCart";

const product = { id: 9, name: "Soft Cover Journal", barcode: "9780000000001", quantityOnHand: 5, retailPrice: "7.50" };

describe("POS cart queue", () => {
  it("adds scans to the active cart and preserves a held cart while switching", () => {
    let state = createInitialPosCartState();
    const first = state.activeCartId;
    state = posCartReducer(state, { type: "ADD_PRODUCT", product });
    state = posCartReducer(state, { type: "TOGGLE_HOLD", cartId: first });
    state = posCartReducer(state, { type: "CREATE_CART" });
    state = posCartReducer(state, { type: "ADD_PRODUCT", product: { ...product, id: 10, barcode: "9780000000002" } });

    expect(state.carts).toHaveLength(2);
    expect(state.carts.find(cart => cart.id === first)?.status).toBe("held");
    expect(state.carts.find(cart => cart.id === first)?.lines).toHaveLength(1);
    expect(state.carts.find(cart => cart.id === state.activeCartId)?.lines[0]?.productId).toBe(10);
  });

  it("never opens more than five carts", () => {
    let state = createInitialPosCartState();
    for (let index = 0; index < MAX_POS_CARTS + 3; index++) state = posCartReducer(state, { type: "CREATE_CART" });
    expect(state.carts).toHaveLength(MAX_POS_CARTS);
  });

  it("closes a held cart while retaining one ready cart", () => {
    let state = createInitialPosCartState();
    const first = state.activeCartId;
    state = posCartReducer(state, { type: "CREATE_CART" });
    state = posCartReducer(state, { type: "TOGGLE_HOLD", cartId: first });
    state = posCartReducer(state, { type: "CLOSE_CART", cartId: first });
    expect(state.carts).toHaveLength(1);
    state = posCartReducer(state, { type: "CLOSE_CART", cartId: state.activeCartId });
    expect(state.carts).toHaveLength(1);
    expect(state.carts[0].lines).toHaveLength(0);
  });

  it("adds a custom-priced non-inventory line to the active cart", () => {
    let state = createInitialPosCartState();
    state = posCartReducer(state, { type: "ADD_CUSTOM", amount: 275.5 });

    expect(state.carts[0].lines).toHaveLength(1);
    expect(state.carts[0].lines[0]).toMatchObject({ productName: "Miscellaneous", unitPrice: 275.5, quantity: 1, unitDiscount: 0, isCustom: true });
    expect(state.carts[0].lines[0]?.productId).toBeLessThan(0);
  });
});
