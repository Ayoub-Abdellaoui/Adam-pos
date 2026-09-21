import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { getPosCartStorageKey } from "./posDevice";

export const MAX_POS_CARTS = 5;

export type CartProduct = {
  id: number;
  name: string;
  quantityOnHand: number;
  retailPrice: string;
  barcode: string;
};

export type CartLine = {
  productId: number;
  productName: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  unitDiscount: number;
  maxStock?: number;
  isCustom?: boolean;
};

export type PosCart = {
  id: string;
  label: string;
  status: "active" | "held";
  lines: CartLine[];
};

export type PosCartState = { carts: PosCart[]; activeCartId: string };

type Action =
  | { type: "ADD_PRODUCT"; product: CartProduct }
  | { type: "ADD_CUSTOM"; amount: number }
  | { type: "ADD_CUSTOM_BLANK" }
  | { type: "SET_UNIT_PRICE"; productId: number; unitPrice: number }
  | { type: "SET_QUANTITY"; productId: number; quantity: number }
  | { type: "SET_DISCOUNT"; productId: number; unitDiscount: number }
  | { type: "REMOVE_LINE"; productId: number }
  | { type: "CREATE_CART" }
  | { type: "SELECT_CART"; cartId: string }
  | { type: "TOGGLE_HOLD"; cartId: string }
  | { type: "CLOSE_CART"; cartId: string }
  | { type: "COMPLETE_ACTIVE" }
  | { type: "CLEAR_ACTIVE" };

function newCart(sequence: number): PosCart {
  return { id: crypto.randomUUID(), label: `Cart ${sequence}`, status: "active", lines: [] };
}

export function createInitialPosCartState(): PosCartState {
  const cart = newCart(1);
  return { carts: [cart], activeCartId: cart.id };
}

function cartSequence(carts: PosCart[]): number {
  return Math.max(0, ...carts.map(cart => Number(cart.label.replace("Cart ", "")) || 0)) + 1;
}

export function posCartReducer(state: PosCartState, action: Action): PosCartState {
  const active = state.carts.find(cart => cart.id === state.activeCartId);
  if (!active && action.type !== "SELECT_CART") return state;

  switch (action.type) {
    case "ADD_PRODUCT": {
      const product = action.product;
      const existing = active!.lines.find(line => line.productId === product.id);
      const lines = existing
        ? active!.lines.map(line => line.productId === product.id ? { ...line, quantity: Math.min(line.quantity + 1, product.quantityOnHand), maxStock: product.quantityOnHand } : line)
        : product.quantityOnHand > 0 ? [...active!.lines, { productId: product.id, productName: product.name, barcode: product.barcode, unitPrice: Number(product.retailPrice), quantity: 1, unitDiscount: 0, maxStock: product.quantityOnHand }] : active!.lines;
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, lines } : cart) };
    }
    case "ADD_CUSTOM": {
      const amount = Math.round(action.amount * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) return state;
      const lines = [...active!.lines, { productId: -(Date.now() + Math.floor(Math.random() * 10_000)), productName: "Miscellaneous", barcode: "CUSTOM", unitPrice: amount, quantity: 1, unitDiscount: 0, isCustom: true }];
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, lines } : cart) };
    }
    case "ADD_CUSTOM_BLANK": {
      const lines = [...active!.lines, { productId: -(Date.now() + Math.floor(Math.random() * 10_000)), productName: "Custom Service", barcode: "CUSTOM", unitPrice: 0, quantity: 1, unitDiscount: 0, isCustom: true }];
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, lines } : cart) };
    }
    case "SET_UNIT_PRICE":
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, lines: cart.lines.map(line => line.productId === action.productId && line.isCustom ? { ...line, unitPrice: Math.max(0, Number.isFinite(action.unitPrice) ? action.unitPrice : 0) } : line) } : cart) };
    case "SET_QUANTITY":
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, lines: cart.lines.map(line => line.productId === action.productId ? { ...line, quantity: Math.max(1, action.quantity || 1) } : line) } : cart) };
    case "SET_DISCOUNT":
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, lines: cart.lines.map(line => line.productId === action.productId ? { ...line, unitDiscount: Math.min(line.unitPrice, Math.max(0, action.unitDiscount || 0)) } : line) } : cart) };
    case "REMOVE_LINE":
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, lines: cart.lines.filter(line => line.productId !== action.productId) } : cart) };
    case "CREATE_CART": {
      if (state.carts.length >= MAX_POS_CARTS) return state;
      const cart = newCart(cartSequence(state.carts));
      return { carts: [...state.carts, cart], activeCartId: cart.id };
    }
    case "SELECT_CART":
      return state.carts.some(cart => cart.id === action.cartId) ? { ...state, activeCartId: action.cartId, carts: state.carts.map(cart => cart.id === action.cartId ? { ...cart, status: "active" } : cart) } : state;
    case "TOGGLE_HOLD":
      return { ...state, carts: state.carts.map(cart => cart.id === action.cartId ? { ...cart, status: cart.status === "held" ? "active" : "held" } : cart) };
    case "CLOSE_CART": {
      if (state.carts.length === 1) return { ...state, carts: [{ ...state.carts[0], status: "active", lines: [] }] };
      const carts = state.carts.filter(cart => cart.id !== action.cartId);
      const next = carts.find(cart => cart.id === state.activeCartId) ?? carts.find(cart => cart.status === "active") ?? carts[0];
      return { carts, activeCartId: next.id };
    }
    case "CLEAR_ACTIVE":
      return { ...state, carts: state.carts.map(cart => cart.id === active!.id ? { ...cart, status: "active", lines: [] } : cart) };
    case "COMPLETE_ACTIVE": {
      if (state.carts.length === 1) return { ...state, carts: [{ ...active!, status: "active", lines: [] }] };
      const carts = state.carts.filter(cart => cart.id !== active!.id);
      const next = carts.find(cart => cart.status === "active") ?? carts[0];
      return { carts, activeCartId: next.id };
    }
  }
}

type PosCartContextValue = PosCartState & {
  activeCart: PosCart;
  addProduct: (product: CartProduct) => void;
  addCustom: (amount: number) => void;
  addCustomBlank: () => void;
  setUnitPrice: (productId: number, unitPrice: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  setDiscount: (productId: number, unitDiscount: number) => void;
  removeLine: (productId: number) => void;
  createCart: () => boolean;
  selectCart: (cartId: string) => void;
  toggleHold: (cartId: string) => void;
  closeCart: (cartId: string) => void;
  clearActive: () => void;
  completeActive: () => void;
};

const PosCartContext = createContext<PosCartContextValue | null>(null);
function loadPersistedPosCartState(): PosCartState {
  if (typeof window === "undefined") return createInitialPosCartState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getPosCartStorageKey()) ?? "null") as PosCartState | null;
    if (parsed?.carts?.length && parsed.carts.some(cart => cart.id === parsed.activeCartId)) return parsed;
  } catch { /* Ignore corrupt local drafts and start a clean session. */ }
  return createInitialPosCartState();
}

export function PosCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(posCartReducer, undefined, loadPersistedPosCartState);
  useEffect(() => {
    window.localStorage.setItem(getPosCartStorageKey(), JSON.stringify(state));
  }, [state]);
  const value = useMemo<PosCartContextValue>(() => {
    const activeCart = state.carts.find(cart => cart.id === state.activeCartId) ?? state.carts[0];
    return {
      ...state,
      activeCart,
      addProduct: product => dispatch({ type: "ADD_PRODUCT", product }),
      addCustom: amount => dispatch({ type: "ADD_CUSTOM", amount }),
      addCustomBlank: () => dispatch({ type: "ADD_CUSTOM_BLANK" }),
      setUnitPrice: (productId, unitPrice) => dispatch({ type: "SET_UNIT_PRICE", productId, unitPrice }),
      setQuantity: (productId, quantity) => dispatch({ type: "SET_QUANTITY", productId, quantity }),
      setDiscount: (productId, unitDiscount) => dispatch({ type: "SET_DISCOUNT", productId, unitDiscount }),
      removeLine: productId => dispatch({ type: "REMOVE_LINE", productId }),
      createCart: () => { if (state.carts.length >= MAX_POS_CARTS) return false; dispatch({ type: "CREATE_CART" }); return true; },
      selectCart: cartId => dispatch({ type: "SELECT_CART", cartId }),
      toggleHold: cartId => dispatch({ type: "TOGGLE_HOLD", cartId }),
      closeCart: cartId => dispatch({ type: "CLOSE_CART", cartId }),
      clearActive: () => dispatch({ type: "CLEAR_ACTIVE" }),
      completeActive: () => dispatch({ type: "COMPLETE_ACTIVE" }),
    };
  }, [state]);
  return <PosCartContext.Provider value={value}>{children}</PosCartContext.Provider>;
}

export function usePosCarts() {
  const value = useContext(PosCartContext);
  if (!value) throw new Error("usePosCarts must be used inside PosCartProvider");
  return value;
}
