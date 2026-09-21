export const DZD_CURRENCY_CODE = "DZD";

export function formatDZD(value: number | string, options: Intl.NumberFormatOptions = {}) {
  const amount = Number(value) || 0;
  const formatted = new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
  return `${formatted} ${DZD_CURRENCY_CODE}`;
}

export function formatCompactDZD(value: number) {
  const formatted = new Intl.NumberFormat("fr-DZ", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
  return `${formatted} ${DZD_CURRENCY_CODE}`;
}
