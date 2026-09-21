import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { printThermal } from "@/lib/thermalPrint";
import { formatDZD } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import Barcode from "react-barcode";
import { Barcode as BarcodeIcon, Printer, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const price = (value: string) => formatDZD(value);

export default function LabelGenerator() {
  const catalog = trpc.inventory.labelProducts.useQuery();
  const [productId, setProductId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [copies, setCopies] = useState(1);
  const product = useMemo(() => catalog.data?.find(item => item.id === Number(productId)), [catalog.data, productId]);
  const utils = trpc.useUtils();
  const assignBarcode = trpc.inventory.assignLabelBarcode.useMutation({
    onSuccess: result => { setBarcode(result.barcode); void utils.inventory.labelProducts.invalidate(); toast.success("Barcode assigned and label preview refreshed."); },
    onError: error => toast.error(error.message || "Barcode could not be assigned."),
  });

  useEffect(() => {
    if (!productId && catalog.data?.[0]) setProductId(String(catalog.data[0].id));
  }, [catalog.data, productId]);
  useEffect(() => {
    setBarcode(product?.barcodes[0] ?? (product ? `LBL${product.id}${Date.now().toString(36).toUpperCase()}` : ""));
  }, [product]);

  if (catalog.isLoading) return <Skeleton className="h-[62vh] rounded-[1.5rem]" />;

  return <div className="mx-auto max-w-6xl space-y-6 pb-10">
    <section className="flex flex-col justify-between gap-4 border-b border-[#e3e9df] pb-6 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-muted-foreground dark:text-gray-300"><Tag className="h-4 w-4" /> Inventory hardware</div><h1 className="font-display text-3xl font-bold tracking-[-.04em] text-foreground dark:text-white">Barcode labels</h1><p className="mt-2 text-sm text-muted-foreground">Select an inventory item and print a compact thermal sticker label.</p></div><Badge className="w-fit bg-[#e6f0cb] text-foreground dark:text-gray-200 hover:bg-[#e6f0cb]">Thermal label ready</Badge></section>

    {!catalog.data?.length ? <Card className="border-0 bg-card dark:bg-gray-800 shadow-sm"><CardContent className="p-10 text-center"><BarcodeIcon className="mx-auto h-8 w-8 text-[#89a28b]" /><h2 className="mt-4 font-display text-xl font-bold">No products available</h2><p className="mt-2 text-sm text-muted-foreground">Commit stock from an invoice before printing product labels.</p></CardContent></Card> : <section className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
      <Card className="border-0 bg-card dark:bg-gray-800 shadow-[0_16px_44px_-28px_rgba(18,36,30,.28)]"><CardHeader><CardTitle className="font-display text-lg">Label setup</CardTitle></CardHeader><CardContent className="space-y-5"><div><Label className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Product</Label><Select value={productId} onValueChange={setProductId}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{catalog.data.map(item => <SelectItem value={String(item.id)} key={item.id}>{item.name} · {item.storeName}</SelectItem>)}</SelectContent></Select></div>{product && <><div><Label className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Barcode</Label>{product.barcodes.length ? <Select value={barcode} onValueChange={setBarcode}><SelectTrigger><SelectValue placeholder="Select barcode" /></SelectTrigger><SelectContent>{product.barcodes.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select> : <div className="space-y-2 rounded-xl border border-[#f3d9cb] bg-[#fff7f2] p-3"><p className="text-sm leading-5 text-[#a05c46]">This product has no barcode yet. Assign one now to render its label.</p><div className="flex gap-2"><Input value={barcode} onChange={event => setBarcode(event.target.value)} aria-label="New barcode" className="bg-card dark:bg-gray-800 font-mono text-xs" /><Button onClick={() => assignBarcode.mutate({ productId: product.id, barcode })} disabled={assignBarcode.isPending || barcode.trim().length < 3} className="shrink-0 bg-[#a86047] text-white hover:bg-[#94513d]">Assign</Button></div></div>}</div><div><Label htmlFor="copies" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Copies</Label><Input id="copies" type="number" min="1" max="100" value={copies} onChange={event => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} className="max-w-32 font-mono" /></div><div className="rounded-xl bg-[#f4f7f1] p-3 text-sm"><p className="font-semibold text-foreground dark:text-gray-100">{product.storeName}</p><p className="mt-1 text-muted-foreground">Retail price: <span className="font-mono text-foreground dark:text-gray-200">{price(product.retailPrice)}</span></p></div><Button onClick={() => printThermal("labels")} disabled={!barcode || (!product.barcodes.length && !assignBarcode.isSuccess)} className="h-11 w-full bg-[#12241e] text-white hover:bg-[#213c31]"><Printer className="mr-2 h-4 w-4" /> Print Labels</Button></>}</CardContent></Card>
      <Card className="border-0 bg-[#f3f6ef] shadow-[0_16px_44px_-28px_rgba(18,36,30,.28)]"><CardHeader className="print-controls"><CardTitle className="font-display text-lg">Print preview</CardTitle><p className="mt-1 text-sm text-muted-foreground">58 × 32 mm sticker layout</p></CardHeader><CardContent><div className="print-labels grid place-items-center gap-3 sm:grid-cols-2">{product && barcode ? Array.from({ length: copies }, (_, index) => <article key={`${barcode}-${index}`} className="print-label rounded-md bg-card dark:bg-gray-800 px-2 py-1.5 text-center text-black shadow-sm"><p className="truncate text-[9px] font-bold leading-3">{product.name}</p><Barcode value={barcode} format="CODE128" width={1.15} height={32} margin={2} displayValue={false} /><p className="font-mono text-[9px] leading-3">{barcode}</p><p className="text-[10px] font-bold">{price(product.retailPrice)}</p></article>) : <div className="py-16 text-center text-sm text-muted-foreground">Choose a product with an assigned barcode to preview its label.</div>}</div></CardContent></Card>
    </section>}
  </div>;
}
