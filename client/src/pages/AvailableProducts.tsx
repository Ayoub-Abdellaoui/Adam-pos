import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { PackageSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function AvailableProducts({ storeId }: { storeId: number }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 220); return () => window.clearTimeout(timer); }, [search]);
  const productsInput = useMemo(() => ({ storeId, query: debouncedSearch }), [debouncedSearch, storeId]);
  const products = trpc.inventory.availableProducts.useQuery(productsInput);
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const adjustQuantity = trpc.inventory.adjustQuantity.useMutation({
    onSuccess: async (_result, input) => {
      await utils.inventory.availableProducts.invalidate();
      setDrafts(current => { const next = { ...current }; delete next[input.productId]; return next; });
      toast.success("Stock quantity updated.");
    },
    onError: error => toast.error(error.message),
  });

  if (products.isLoading) return <Skeleton className="h-[60vh] rounded-[1.5rem]" />;
  if (products.error) return <Card><CardContent className="p-6 text-sm text-destructive">{products.error.message}</CardContent></Card>;

  return <div className="mx-auto max-w-5xl space-y-4">
    <Card className="border-0 bg-[#12241e] text-white shadow-[0_16px_45px_-25px_rgba(18,36,30,.6)]">
      <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><PackageSearch className="h-5 w-5 text-[#c7e661]" />Available Products / السلع المتوفرة</CardTitle><p className="text-sm text-white/70">View and update stock quantity only. Product details and financial information are not available here.</p></CardHeader>
    </Card>
    <Card>
      <CardHeader className="border-b border-border pb-4"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by product name, reference/SKU, or barcode" aria-label="Search available products" /></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="border-b border-border bg-muted text-left text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground"><tr><th className="px-4 py-3">Product name</th><th className="w-48 px-4 py-3 text-center">Available quantity</th><th className="w-40 px-4 py-3 text-end">Action</th></tr></thead><tbody>{(products.data ?? []).map(product => { const draft = drafts[product.id] ?? String(product.stockQuantity); const changed = draft !== String(product.stockQuantity); return <tr key={product.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-semibold text-foreground">{product.name}</td><td className="px-4 py-3"><Input aria-label={`Available quantity for ${product.name}`} type="number" min="0" max="1000000" step="1" value={draft} onChange={event => setDrafts(current => ({ ...current, [product.id]: event.target.value }))} className="mx-auto h-9 w-32 text-center font-mono" /></td><td className="px-4 py-3 text-end"><Button type="button" size="sm" disabled={!changed || adjustQuantity.isPending || !/^\d+$/.test(draft)} onClick={() => adjustQuantity.mutate({ productId: product.id, stockQuantity: Number(draft) })}>Save quantity</Button></td></tr>; })}</tbody></table></div>
        {!products.data?.length && <p className="p-8 text-center text-sm text-muted-foreground">No products are available in this branch.</p>}
      </CardContent>
    </Card>
  </div>;
}
