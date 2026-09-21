const DEVICE_ID_STORAGE_KEY = "cloud-pos:device-id:v1";
const LEGACY_CART_STORAGE_KEY = "cloud-pos:active-draft:v1";
const LEGACY_CUSTOMER_DRAFT_STORAGE_KEY = "cloud-pos:customer-draft:v1";

function createDeviceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getPosDeviceId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const deviceId = createDeviceId();
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

function migrateLegacyStorage(key: string, scopedKey: string) {
  if (window.localStorage.getItem(scopedKey) !== null) return;
  const legacyValue = window.localStorage.getItem(key);
  if (legacyValue !== null) window.localStorage.setItem(scopedKey, legacyValue);
}

export function getPosCartStorageKey() {
  const deviceId = getPosDeviceId();
  const key = `cloud-pos:active-draft:v2:${deviceId}`;
  migrateLegacyStorage(LEGACY_CART_STORAGE_KEY, key);
  return key;
}

export function getCustomerDraftStorageKey() {
  const deviceId = getPosDeviceId();
  const key = `cloud-pos:customer-draft:v2:${deviceId}`;
  migrateLegacyStorage(LEGACY_CUSTOMER_DRAFT_STORAGE_KEY, key);
  return key;
}
