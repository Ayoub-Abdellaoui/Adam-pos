import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDZD } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { Barcode, Boxes, MapPin, Tags } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ProductDetails({ productId }: { productId: number }) {
  const { t } = useTranslation();
  const detail = trpc.inventory.productDetail.useQuery({ productId });
  if (detail.isLoading) return <Skeleton className="mx-auto h-[520px] max-w-4xl rounded-[1.75rem]" />;
  const product = detail.data;
  if (!product) return null;
  const financial = "purchasePrice" in product ? product : null;
  return <div className="mx-auto max-w-4xl space-y-6 pb-10"><section className="rounded-[1.75rem] bg-[#12241e] px-6 py-7 text-white shadow-[0_20px_60px_-24px_rgba(18,36,30,.55)] sm:px-8"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[#c7e661]"><Boxes className="h-4 w-4" /> {t("common.productsInventory")}</p><h1 className="mt-3 font-display text-3xl font-bold tracking-[-.04em]">{product.name}</h1><p className="mt-2 text-sm text-white/70">{t("common.branchWorkspace")} · {product.storeName}</p></section><Card className="border-0 bg-card dark:bg-gray-800 shadow-[0_16px_44px_-28px_rgba(18,36,30,.3)]"><CardContent className="space-y-6 p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-2"><Field icon={Tags} label={t("common.sku")} value={product.sku || "Not assigned"} mono /><Field icon={MapPin} label={t("common.address")} value={product.storeName} /><Field icon={Boxes} label={t("common.stockQuantity")} value={`${product.stockQuantity} ${t("dashboard.units")}`} /><Field icon={Barcode} label={t("common.sellingPrice")} value={formatDZD(product.sellingPrice)} /></div>{financial && <div className="grid gap-4 rounded-2xl border border-[#f3dfd5] bg-[#fff9f6] p-4 sm:grid-cols-2"><Field icon={Tags} label={t("common.purchasePrice")} value={formatDZD(financial.purchasePrice)} /><Field icon={Tags} label={t("dashboard.grossProfit")} value={`${formatDZD(financial.profitMargin)}${financial.profitMarginPercent === null ? "" : ` · ${financial.profitMarginPercent.toFixed(1)}%`}`} /></div>}<div><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">{t("common.barcode")}</p><div className="mt-3 flex flex-wrap gap-2">{product.barcodes.length ? product.barcodes.map(value => <Badge key={value} variant="outline" className="font-mono text-xs">{value}</Badge>) : <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>}</div></div>{product.description && <div><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">{t("common.address")}</p><p className="mt-2 text-sm leading-6 text-foreground dark:text-gray-100">{product.description}</p></div>}</CardContent></Card></div>;
}

function Field({ icon: Icon, label, value, mono = false }: { icon: typeof Tags; label: string; value: string; mono?: boolean }) { return <div className="rounded-2xl bg-muted dark:bg-gray-800 p-4"><div className="flex items-center gap-2 text-muted-foreground dark:text-gray-300"><Icon className="h-4 w-4" /><p className="text-[11px] font-bold uppercase tracking-[.08em]">{label}</p></div><p className={`mt-2 text-base font-bold text-foreground dark:text-gray-100 ${mono ? "font-mono" : ""}`}>{value}</p></div>; }
