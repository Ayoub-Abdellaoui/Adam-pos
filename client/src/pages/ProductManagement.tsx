import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CameraBarcodeScanner } from "@/components/CameraBarcodeScanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { formatDZD } from "@/lib/currency";
import { printIsolatedLabels } from "@/lib/thermalPrint";
import { Barcode, Boxes, Camera, Pencil, Plus, Search, SlidersHorizontal, Tags, Trash2 } from "lucide-react";
import BarcodeRenderer from "react-barcode";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

type ProductRecord = {
  id: number;
  name: string;
  sku: string | null;
  reference?: string | null;
  category: string | null;
  variations: string | null;
  storeId: number;
  storeName: string;
  purchasePrice: string;
  sellingPrice: string;
  stockQuantity: number;
  barcodes: string[];
};

type ProductDraft = {
  storeId: string;
  name: string;
  sku: string;
  reference: string;
  category: string;
  variations: string;
  purchasePrice: string;
  sellingPrice: string;
  stockQuantity: string;
  barcodes: string[];
};

type LabelJob = { product: ProductRecord; barcode: string; quantity: number };
type ProductFilters = { noReference: boolean; zeroSelling: boolean; loss: boolean; zeroProfit: boolean; missingCost: boolean; missingSelling: boolean; noBarcode: boolean; outOfStock: boolean; lowStock: boolean; noCategory: boolean };
const emptyFilters: ProductFilters = { noReference: false, zeroSelling: false, loss: false, zeroProfit: false, missingCost: false, missingSelling: false, noBarcode: false, outOfStock: false, lowStock: false, noCategory: false };

const money = (value: string | number) => formatDZD(value);

function emptyDraft(storeId = ""): ProductDraft {
  return { storeId, name: "", sku: "", reference: "", category: "", variations: "", purchasePrice: "0", sellingPrice: "0", stockQuantity: "0", barcodes: [] };
}

function toDraft(product: ProductRecord): ProductDraft {
  return {
    storeId: String(product.storeId),
    name: product.name,
    sku: product.sku ?? "",
    reference: product.reference ?? "",
    category: product.category ?? "",
    variations: product.variations ?? "",
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    stockQuantity: String(product.stockQuantity),
    barcodes: product.barcodes,
  };
}

export default function ProductManagement({ storeId: scopedStoreId }: { storeId?: number }) {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const catalog = trpc.inventory.productCatalog.useQuery(scopedStoreId ? { storeId: scopedStoreId } : undefined);
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [detailProductId, setDetailProductId] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get("productId")) || null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>(emptyFilters);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 220); return () => window.clearTimeout(timer); }, [search]);
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});
  const [labelJob, setLabelJob] = useState<LabelJob | null>(null);
  const [isPrintingLabels, setIsPrintingLabels] = useState(false);
  const labelPrintRef = useRef<HTMLDivElement>(null);
  const refreshCatalog = () => Promise.all([utils.inventory.productCatalog.invalidate(), utils.inventory.labelProducts.invalidate()]);
  const createProduct = trpc.inventory.createProduct.useMutation({
    onSuccess: async () => { await refreshCatalog(); setCreateOpen(false); toast.success("Product created with its barcode list."); },
    onError: error => toast.error(error.message || "Product could not be created."),
  });
  const updateProduct = trpc.inventory.updateProduct.useMutation({
    onSuccess: async () => { await refreshCatalog(); setEditingProduct(null); toast.success("Product details and barcode list updated."); },
    onError: error => toast.error(error.message || "Product could not be updated."),
  });
  const deleteProducts = trpc.inventory.deleteProducts.useMutation({
    onSuccess: async result => { await refreshCatalog(); setSelectedProductIds([]); toast.success(`${result.deleted} product${result.deleted === 1 ? "" : "s"} deleted.`); },
    onError: error => toast.error(error.message || "Products could not be deleted."),
  });
  const generateProductBarcode = trpc.inventory.generateProductBarcode.useMutation({
    onSuccess: async ({ barcode }) => { await refreshCatalog(); setEditingProduct(current => current ? { ...current, barcodes: [barcode] } : current); toast.success("Internal barcode generated and assigned."); },
    onError: error => toast.error(error.message || "Barcode could not be generated."),
  });
  const detail = trpc.inventory.productDetail.useQuery({ productId: detailProductId ?? 1 }, { enabled: detailProductId !== null });

  const stores = catalog.data?.stores ?? [];
  const products = catalog.data?.products ?? [];
  const scopedStore = scopedStoreId ? stores.find(store => store.id === scopedStoreId) : undefined;
  const visibleProducts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return products.filter(product => {
      const matchesSearch = !query || [product.name, product.storeName, product.sku ?? "", product.reference ?? "", product.category ?? "", product.variations ?? "", ...product.barcodes].some(value => value.toLowerCase().includes(query));
      const cost = product.purchasePrice == null ? null : Number(product.purchasePrice);
      const selling = product.sellingPrice == null ? null : Number(product.sellingPrice);
      const lowStock = product.stockQuantity > 0 && product.stockQuantity <= 10;
      return matchesSearch && (!filters.noReference || !product.reference?.trim()) && (!filters.zeroSelling || selling === 0) && (!filters.loss || (cost != null && selling != null && selling < cost)) && (!filters.zeroProfit || (cost != null && selling != null && selling === cost)) && (!filters.missingCost || cost == null) && (!filters.missingSelling || selling == null) && (!filters.noBarcode || product.barcodes.length === 0) && (!filters.outOfStock || product.stockQuantity <= 0) && (!filters.lowStock || lowStock) && (!filters.noCategory || !product.category?.trim());
    });
  }, [products, debouncedSearch, filters]);
  const selectedProducts = useMemo(() => products.filter(product => selectedProductIds.includes(product.id)), [products, selectedProductIds]);
  const selectionSummary = useMemo(() => selectedProducts.reduce((summary, product) => { const quantity = Number(product.stockQuantity) || 0; const cost = Number(product.purchasePrice) || 0; const selling = Number(product.sellingPrice) || 0; summary.units += quantity; summary.cost += quantity * cost; summary.sales += quantity * selling; return summary; }, { units: 0, cost: 0, sales: 0 }), [selectedProducts]);
  useEffect(() => { const validIds = new Set(products.map(product => product.id)); setSelectedProductIds(current => current.filter(id => validIds.has(id))); }, [products]);
  const allVisibleSelected = visibleProducts.length > 0 && visibleProducts.every(product => selectedProductIds.includes(product.id));
  const toggleProduct = (productId: number) => setSelectedProductIds(current => current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId]);
  const toggleVisibleSelection = () => setSelectedProductIds(current => allVisibleSelected ? current.filter(id => !visibleProducts.some(product => product.id === id)) : Array.from(new Set([...current, ...visibleProducts.map(product => product.id)])));
  const deleteSelected = () => { if (!selectedProductIds.length) return; if (window.confirm(`Delete ${selectedProductIds.length} selected product${selectedProductIds.length === 1 ? "" : "s"}? Products with stock, invoice, or sales history are protected.`)) deleteProducts.mutate({ productIds: selectedProductIds }); };

  useEffect(() => {
    if (!labelJob) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const labelRoot = labelPrintRef.current;
      if (!labelRoot || !labelRoot.querySelector("svg rect")) {
        if (!cancelled) { toast.error("The label barcode is still rendering. Please try again."); setLabelJob(null); }
        return;
      }
      setIsPrintingLabels(true);
      try {
        await printIsolatedLabels(labelRoot);
        if (!cancelled) toast.success(`${labelJob.quantity} barcode label${labelJob.quantity === 1 ? "" : "s"} sent to print.`);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to open the label print dialog.");
      } finally {
        if (!cancelled) { setIsPrintingLabels(false); setLabelJob(null); }
      }
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [labelJob]);

  const startLabelPrint = (product: ProductRecord, barcode: string) => {
    const key = `${product.id}:${barcode}`;
    const quantity = Math.min(100, Math.max(1, Math.floor(printQuantities[key] || 1)));
    setLabelJob({ product, barcode, quantity });
  };

  if (catalog.isLoading) return <Skeleton className="h-[70vh] rounded-[1.5rem]" />;

  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <section className="flex flex-col gap-4 rounded-[1.75rem] bg-[#12241e] px-6 py-7 text-white shadow-[0_20px_60px_-24px_rgba(18,36,30,.55)] sm:flex-row sm:items-end sm:justify-between sm:px-8">
      <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[#c7e661]"><Boxes className="h-4 w-4" /> {scopedStore ? `${scopedStore.name} inventory hub` : "Catalog control"}</div><h1 className="font-display text-3xl font-bold tracking-[-.04em]">Products & pricing</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">{scopedStore ? `Every catalog, product, barcode, and stock action on this page is scoped to ${scopedStore.name}.` : "Create branch products, manage every scannable barcode, and maintain purchase cost, selling price, and on-hand quantity from one workspace."}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => scopedStoreId ? setLocation(`/branches/${scopedStoreId}/invoice-import`) : setLocation("/invoice")} className="h-11 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Boxes className="me-2 h-4 w-4" /> Import Bulk Invoice</Button><Button onClick={() => setCreateOpen(true)} className="h-11 bg-[#c7e661] px-5 text-[#12241e] shadow-sm hover:bg-[#d8ed86]"><Plus className="me-2 h-4 w-4" /> Add Single Product</Button></div>
    </section>

    <Card className="border-0 bg-white shadow-[0_16px_44px_-28px_rgba(18,36,30,.3)]"><CardHeader className="flex flex-col gap-4 border-b border-[#e8ece6] px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="font-display text-xl">Product catalog</CardTitle><p className="mt-1 text-sm text-muted-foreground">Each barcode in the list resolves to the same branch product at checkout.</p><p className="mt-2 text-xs font-medium text-[#52745a]">Search instantly by name, barcode, SKU/reference, category, variation, or modifier.</p><div className="mt-3"><Button type="button" variant="outline" onClick={() => setFiltersOpen(current => !current)} className="h-9 border-[#dbe5d8] text-[#42634c]"><SlidersHorizontal className="me-2 h-4 w-4" />فلاتر متقدمة</Button></div></div><div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, barcode, SKU, category, or variation" className="bg-[#fbfcfa] ps-9" aria-label="Search branch inventory by name, barcode, SKU, category, or variation" />{selectedProductIds.length > 0 && <Button type="button" variant="outline" onClick={deleteSelected} disabled={deleteProducts.isPending} className="border-[#e6b7aa] text-[#a54d38] hover:bg-[#fce8e1]"><Trash2 className="me-2 h-4 w-4" />Delete selected ({selectedProductIds.length})</Button>}</div></CardHeader>{filtersOpen && <div className="flex flex-wrap gap-2 border-b border-[#e8ece6] bg-[#fbfcfa] px-5 py-4" dir="rtl">{([ ["noReference", "بدون مرجع"], ["zeroSelling", "سعر بيع = 0"], ["loss", "بيع بخسارة"], ["zeroProfit", "ربح صفري"], ["missingCost", "بدون تكلفة"], ["missingSelling", "بدون سعر بيع"], ["noBarcode", "بدون باركود"], ["outOfStock", "مخزون = 0"], ["lowStock", "مخزون منخفض"], ["noCategory", "بدون تصنيف"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-[#dbe5d8] bg-white px-3 py-2 text-xs font-medium text-[#42634c]"><input type="checkbox" checked={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}<Button type="button" variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>مسح الفلاتر</Button></div>}<CardContent className="p-0">
      {selectedProductIds.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-[#e8ece6] bg-[#f7faf8] px-5 py-3 text-xs font-medium text-[#42634c]" dir="rtl"><strong>{selectedProductIds.length} منتجات محددة</strong><span>{selectionSummary.units} وحدة</span><span>التكلفة: {money(selectionSummary.cost)}</span><span>قيمة البيع: {money(selectionSummary.sales)}</span><span>الربح المحتمل: {money(selectionSummary.sales - selectionSummary.cost)}</span><Button type="button" variant="ghost" size="sm" onClick={() => setSelectedProductIds([])}>مسح الاختيار</Button></div>}
      {!visibleProducts.length ? <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><Tags className="mb-3 h-9 w-9 text-[#8aa38c]" /><h2 className="font-display text-xl font-bold text-[#24382d]">No matching products</h2><p className="mt-2 text-sm text-muted-foreground">Add your first product or adjust the current search.</p></div> : <div className="overflow-x-auto"><table className="retail-table w-full min-w-[1300px] text-sm"><thead className="sticky top-0 z-10 bg-[#f7faf8] text-start text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground"><tr><th className="px-3 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Select all visible products" /></th><th className="px-5 py-3">Product</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Branch</th><th className="px-3 py-3">Barcode labels</th><th className="px-3 py-3 text-end">Purchase price</th><th className="px-3 py-3 text-end">Selling price</th><th className="px-3 py-3 text-end">On hand</th><th className="px-5 py-3 text-end">Edit</th></tr></thead><tbody>{visibleProducts.map(product => <tr key={product.id} className="border-t border-[#edf0eb] align-top hover:bg-[#fbfcfa]"><td className="px-3 py-4"><input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={() => toggleProduct(product.id)} aria-label={`Select ${product.name}`} /></td><td className="px-5 py-4 font-semibold text-[#24382d]"><button type="button" onClick={() => setDetailProductId(product.id)} className="text-start hover:text-[#42634c] hover:underline">{product.name}</button></td><td className="px-3 py-4 font-mono text-xs text-muted-foreground">{product.reference || product.sku || "—"}</td><td className="px-3 py-4 text-muted-foreground">{product.storeName}</td><td className="px-3 py-4"><div className="flex min-w-[440px] gap-3">{product.barcodes.length ? product.barcodes.map(barcode => { const key = `${product.id}:${barcode}`; const quantity = printQuantities[key] ?? 1; return <div key={barcode} className="w-[205px] rounded-xl border border-indigo-100 bg-indigo-50/40 p-2"><div className="rounded-lg bg-white px-1 py-1 text-center"><BarcodeRenderer value={barcode} format="CODE128" width={0.6} height={24} margin={1} displayValue={false} /><p className="mt-0.5 font-mono text-[9px] text-[#24382d]">{barcode}</p></div><div className="mt-2 flex gap-1.5"><Input aria-label={`Print Quantity for ${barcode}`} type="number" min="1" max="100" value={quantity} onChange={event => setPrintQuantities(current => ({ ...current, [key]: Math.min(100, Math.max(1, Number(event.target.value) || 1)) }))} className="h-8 w-16 bg-white px-2 text-center font-mono text-xs" /><Button type="button" size="sm" disabled={isPrintingLabels} onClick={() => startLabelPrint(product, barcode)} className="h-8 flex-1 bg-[#12241e] px-2 text-xs text-white hover:bg-[#213c31]"><Tags className="me-1 h-3.5 w-3.5" />Print Barcode</Button></div></div>; }) : <span className="text-xs text-muted-foreground">No barcode assigned</span>}</div></td><td className="px-3 py-4 text-end font-mono text-[#8b5e20]">{money(product.purchasePrice)}</td><td className="px-3 py-4 text-end font-mono font-semibold text-[#42634c]">{money(product.sellingPrice)}</td><td className="px-3 py-4 text-end font-mono font-semibold text-[#24382d]">{product.stockQuantity}</td><td className="px-5 py-4 text-end"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditingProduct(product)} className="border-[#dbe5d8] bg-white text-[#42634c] hover:bg-[#edf3e9]"><Pencil className="me-1.5 h-3.5 w-3.5" /> Edit</Button><Button variant="outline" size="sm" onClick={() => { if (window.confirm(`Delete ${product.name}? Products with history are protected.`)) deleteProducts.mutate({ productIds: [product.id] }); }} disabled={deleteProducts.isPending} className="border-[#e6b7aa] text-[#a54d38] hover:bg-[#fce8e1]"><Trash2 className="me-1.5 h-3.5 w-3.5" /> Delete</Button></div></td></tr>)}</tbody></table></div>}
    </CardContent></Card>

    <div aria-hidden="true" className="fixed start-[-10000px] top-0"><div ref={labelPrintRef} className="barcode-labels">{labelJob && Array.from({ length: labelJob.quantity }, (_, index) => <article key={`${labelJob.barcode}-${index}`} className="barcode-label"><p className="barcode-label-store">{t("receipt.store")}</p><p className="barcode-label-product">{labelJob.product.name}</p><p className="barcode-label-price">{money(labelJob.product.sellingPrice)}</p><BarcodeRenderer value={labelJob.barcode} format="CODE128" width={0.8} height={38} margin={1} displayValue={false} /><p className="barcode-label-code">{labelJob.barcode}</p></article>)}</div></div>

    <ProductEditor open={createOpen} onOpenChange={setCreateOpen} singleEntry stores={stores} defaultStoreId={scopedStoreId ? String(scopedStoreId) : stores[0] ? String(stores[0].id) : ""} saving={createProduct.isPending} onSave={draft => createProduct.mutate({ storeId: Number(draft.storeId), name: draft.name, sku: draft.sku || undefined, reference: draft.reference || undefined, category: draft.category || undefined, variations: draft.variations || undefined, purchasePrice: Number(draft.purchasePrice), sellingPrice: Number(draft.sellingPrice), stockQuantity: Number(draft.stockQuantity), barcodes: draft.barcodes })} />
    <ProductEditor open={Boolean(editingProduct)} onOpenChange={open => { if (!open) setEditingProduct(null); }} product={editingProduct} stores={stores} defaultStoreId="" saving={updateProduct.isPending} generatingBarcode={generateProductBarcode.isPending} onGenerateBarcode={productId => generateProductBarcode.mutate({ productId })} onSave={draft => { if (editingProduct) updateProduct.mutate({ productId: editingProduct.id, name: draft.name, sku: draft.sku || undefined, reference: draft.reference || undefined, category: draft.category || undefined, variations: draft.variations || undefined, purchasePrice: Number(draft.purchasePrice), sellingPrice: Number(draft.sellingPrice), stockQuantity: Number(draft.stockQuantity), barcodes: draft.barcodes }); }} />
    <ProductDetailDialog open={detailProductId !== null} onOpenChange={open => { if (!open) { setDetailProductId(null); if (location.includes("?")) setLocation(location.split("?")[0]); } }} product={detail.data} loading={detail.isLoading} />
  </div>;
}

export function ProductEditor({ open, onOpenChange, product, stores, defaultStoreId, saving, generatingBarcode = false, onGenerateBarcode, onSave, singleEntry = false }: { open: boolean; onOpenChange: (open: boolean) => void; product?: ProductRecord | null; stores: Array<{ id: number; name: string }>; defaultStoreId: string; saving: boolean; generatingBarcode?: boolean; onGenerateBarcode?: (productId: number) => void; onSave: (draft: ProductDraft) => void; singleEntry?: boolean }) {
  const [draft, setDraft] = useState<ProductDraft>(() => product ? toDraft(product) : emptyDraft(defaultStoreId));
  const [newBarcode, setNewBarcode] = useState("");
  const [validationError, setValidationError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  useEffect(() => { if (open) { setDraft(product ? toDraft(product) : emptyDraft(defaultStoreId)); setNewBarcode(""); setValidationError(""); setCameraOpen(false); } }, [defaultStoreId, open, product]);

  const appendBarcode = (rawValue: string) => {
    const value = rawValue.trim();
    if (value.length < 3) return setValidationError("Enter a barcode with at least 3 characters.");
    if (draft.barcodes.includes(value)) return setValidationError("This barcode is already in the list.");
    setDraft(current => ({ ...current, barcodes: [...current.barcodes, value] }));
    setNewBarcode("");
    setValidationError("");
  };
  const addBarcode = () => appendBarcode(newBarcode);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const purchasePrice = Number(draft.purchasePrice);
    const sellingPrice = Number(draft.sellingPrice);
    const stockQuantity = Number(draft.stockQuantity);
    if (!draft.storeId && !product) return setValidationError("Choose a branch for this product.");
    if (!draft.name.trim()) return setValidationError("Enter a product name.");
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0 || !Number.isInteger(stockQuantity) || stockQuantity < 0) return setValidationError("Enter valid non-negative prices and a whole stock quantity.");
    onSave({ ...draft, name: draft.name.trim() });
  };

  return <><Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto border-slate-200 bg-white p-0 shadow-2xl sm:w-full"><DialogHeader className="border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6"><DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-950"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Boxes className="h-4 w-4" /></span>{product ? "Edit product" : singleEntry ? "Add Single Product" : "Create product"}</DialogTitle><DialogDescription className="pt-1">{product ? "Update product pricing, stock, and its complete scannable barcode list." : "Directly append one complete product record to branch inventory—no invoice import required."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5 p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="product-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Product name</Label><Input id="product-name" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="bg-white" autoFocus /></div><div><Label htmlFor="product-sku" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">SKU / Reference</Label><Input id="product-sku" value={draft.sku} onChange={event => setDraft(current => ({ ...current, sku: event.target.value }))} className="bg-white font-mono" placeholder="Optional internal reference" /></div>{product ? <div><Label className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Branch</Label><div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">{product.storeName}</div></div> : <div><Label className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Branch</Label><Select value={draft.storeId} onValueChange={value => setDraft(current => ({ ...current, storeId: value }))}><SelectTrigger className="bg-white"><SelectValue placeholder="Choose branch" /></SelectTrigger><SelectContent>{stores.map(store => <SelectItem key={store.id} value={String(store.id)}>{store.name}</SelectItem>)}</SelectContent></Select></div>}<div><Label htmlFor="product-category" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Category</Label><Input id="product-category" value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} className="bg-white" placeholder="Optional category" /></div><div><Label htmlFor="product-variations" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Variations / modifiers</Label><Input id="product-variations" value={draft.variations} onChange={event => setDraft(current => ({ ...current, variations: event.target.value }))} className="bg-white" placeholder="e.g. Red, Large, Paperback" /></div><div><Label htmlFor="purchase-price" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Purchase price (Cost)</Label><Input id="purchase-price" type="number" min="0" step="0.01" value={draft.purchasePrice} onChange={event => setDraft(current => ({ ...current, purchasePrice: event.target.value }))} className="bg-white font-mono" /></div><div><Label htmlFor="selling-price" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Selling price (DZD)</Label><Input id="selling-price" type="number" min="0" step="0.01" value={draft.sellingPrice} onChange={event => setDraft(current => ({ ...current, sellingPrice: event.target.value }))} className="bg-white font-mono" /></div><div><Label htmlFor="stock-quantity" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Stock quantity</Label><Input id="stock-quantity" type="number" min="0" step="1" value={draft.stockQuantity} onChange={event => setDraft(current => ({ ...current, stockQuantity: event.target.value }))} className="bg-white font-mono" /></div></div><div className="rounded-2xl border border-[#dce7d8] bg-[#fbfcfa] p-4"><div className="flex items-start justify-between gap-4"><div><Label className="text-sm font-bold text-[#24382d]">Primary barcode & additional barcodes</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">The first barcode is saved as the primary code. Add UPC, supplier, or legacy alternatives after it.</p></div><Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">{draft.barcodes.length} assigned</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Input value={newBarcode} onChange={event => setNewBarcode(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addBarcode(); } }} placeholder={draft.barcodes.length ? "Add another barcode" : "Primary barcode"} className="min-w-[180px] flex-1 bg-white font-mono text-sm" /><Button type="button" variant="outline" size="icon" onClick={() => setCameraOpen(true)} className="shrink-0 border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700" aria-label="Scan barcode via camera"><Camera className="h-4 w-4" /></Button><Button type="button" onClick={addBarcode} className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-700"><Plus className="me-1 h-4 w-4" /> {draft.barcodes.length ? "Add" : "Set primary"}</Button>{onGenerateBarcode && <Button type="button" variant="outline" onClick={() => product ? onGenerateBarcode(product.id) : setValidationError("Save the product first, then generate its barcode.")} disabled={generatingBarcode || Boolean(draft.barcodes.length) || !product} className="shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50">{generatingBarcode ? "Generating…" : "Generate Barcode"}</Button>}</div>{draft.barcodes.length ? <div className="mt-3 space-y-2">{draft.barcodes.map((barcode, index) => <div key={barcode} className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e9df] bg-white px-3 py-2"><span className="flex min-w-0 items-center gap-2 font-mono text-sm text-[#24382d]"><Barcode className="h-4 w-4 shrink-0 text-indigo-600" /> <span className="truncate">{barcode}</span>{index === 0 && <Badge className="bg-[#e6f0cb] text-[10px] text-[#42634c] hover:bg-[#e6f0cb]">Primary</Badge>}</span><Button type="button" variant="ghost" size="icon" onClick={() => setDraft(current => ({ ...current, barcodes: current.barcodes.filter(value => value !== barcode) }))} className="h-8 w-8 shrink-0 text-[#a96354] hover:bg-[#fce8e1] hover:text-[#b85b43]" aria-label={`Delete barcode ${barcode}`}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-[#d6e0d3] p-3 text-xs text-muted-foreground">Set the required primary barcode above; then append any additional codes for this same product.</p>}</div>{validationError && <p className="rounded-xl bg-[#fce8e1] px-3 py-2 text-sm text-[#a54d38]">{validationError}</p>}<div className="flex flex-col-reverse gap-3 border-t border-[#edf0eb] pt-4 sm:flex-row sm:items-center sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving} className="bg-[#12241e] text-white hover:bg-[#213c31]">{saving ? "Saving…" : product ? "Save product changes" : "Save Single Product"}</Button></div></form></DialogContent></Dialog><CameraBarcodeScanner open={open && cameraOpen} onOpenChange={setCameraOpen} title="Add product barcode via camera" description="Start the camera, then scan a code to append it to this product’s barcode list." onDetected={appendBarcode} /></>;
}

function ProductDetailDialog({ open, onOpenChange, product, loading }: { open: boolean; onOpenChange: (open: boolean) => void; product: { id: number; name: string; sku: string | null; description: string | null; storeName: string; stockQuantity: number; barcodes: string[]; sellingPrice: string; canViewFinancials: boolean; purchasePrice?: string; profitMargin?: number; profitMarginPercent?: number | null } | undefined; loading: boolean }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100%-1.5rem)] max-w-xl border-[#dce7d8] bg-white p-0 shadow-2xl sm:w-full"><DialogHeader className="border-b border-[#e8ece6] px-5 pb-4 pt-5 sm:px-6"><DialogTitle className="font-display text-xl text-[#12241e]">{loading ? "Loading product details…" : product?.name ?? "Product details"}</DialogTitle><DialogDescription>{product ? `${product.storeName} · Full branch-scoped product record` : ""}</DialogDescription></DialogHeader>{product && <div className="space-y-5 p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-2"><Detail label="SKU / Reference" value={product.sku || "Not assigned"} mono /><Detail label="Current stock" value={`${product.stockQuantity} units`} /><Detail label="Selling price" value={money(product.sellingPrice)} /><Detail label="Branch location" value={product.storeName} /></div>{product.canViewFinancials && <div className="grid gap-3 rounded-2xl border border-[#f3dfd5] bg-[#fff9f6] p-4 sm:grid-cols-2"><Detail label="Purchase price (Cost)" value={money(product.purchasePrice ?? 0)} /><Detail label="Profit margin" value={`${money(product.profitMargin ?? 0)}${product.profitMarginPercent === null ? "" : ` · ${product.profitMarginPercent?.toFixed(1)}%`}`} /></div>}<div><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Scannable barcodes</p><div className="mt-2 flex flex-wrap gap-2">{product.barcodes.length ? product.barcodes.map(value => <Badge key={value} variant="outline" className="font-mono text-xs">{value}</Badge>) : <span className="text-sm text-muted-foreground">No barcode assigned</span>}</div></div>{product.description && <div><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Description</p><p className="mt-1 text-sm leading-6 text-[#24382d]">{product.description}</p></div>}</div>}</DialogContent></Dialog>; }
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="rounded-xl bg-[#f7f9f5] p-3"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className={`mt-1 text-sm font-semibold text-[#24382d] ${mono ? "font-mono" : ""}`}>{value}</p></div>; }
