import { useAuth } from "@/_core/hooks/useAuth";
import { CameraBarcodeScanner } from "@/components/CameraBarcodeScanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDZD } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { ProductEditor } from "@/pages/ProductManagement";
import { Barcode, Building2, Camera, Check, FileSearch, Loader2, Plus, ScanBarcode, Trash2, Upload, X } from "lucide-react";
import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ReferenceSource = "product_name" | "separate_column" | "separate_area";
type StageLine = { code?: string | null; productName: string | null; reference: string | null; totalAmount?: number | null; sourceIndex?: number; quantity: number | null; costPrice: number | null; profitMarginEnabled: boolean; profitMarginPercent: number; sellingPrice: number; barcodes: string[]; barcode?: string };
type StageException = { sourceIndex: number; kind: "missing_reference" | "uncertain_item" | "abnormal_value" | "unmapped_layout"; question: string };
type ExceptionDecision = "include" | "exclude" | "edited";
type SupplierResolution = "checking" | "recognized" | "new" | "unverified";
type Stage = { supplierName: string; supplierId?: number; supplierResolution: SupplierResolution; totalAmount: number; amountPaid: number; referenceSource: ReferenceSource; sourceFileKey: string; sourceFileUrl: string; reviewSessionId: string; originalFileName: string; sourceMimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; exceptions: StageException[]; exceptionDecisions: Record<number, ExceptionDecision | undefined>; items: StageLine[] };

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** Normalizes legacy single-barcode rows and protects every view from missing array values. */
export function normalizeStageBarcodes(values: unknown, legacyValue?: unknown) {
  const listed = Array.isArray(values) ? values : [];
  const legacy = typeof legacyValue === "string" ? [legacyValue] : [];
  return Array.from(new Set([...listed, ...legacy].map(value => String(value).trim()).filter(value => value.length >= 3)));
}

export function appendUniqueBarcode(values: unknown, rawValue: string) {
  const barcode = rawValue.trim();
  const current = normalizeStageBarcodes(values);
  if (barcode.length < 3 || current.includes(barcode)) return current;
  return [...current, barcode];
}

/** Prices are rounded to the currency’s two decimal places before they reach review state. */
export function calculateSellingPrice(costPrice: number, profitMarginPercent: number) {
  const cost = Math.max(0, Number(costPrice) || 0);
  const margin = Math.max(0, Number(profitMarginPercent) || 0);
  return Math.round((cost * (1 + margin / 100) + Number.EPSILON) * 100) / 100;
}

/** A manual selling-price edit remains supported and transparently updates the stored markup. */
export function calculateProfitMarginPercent(costPrice: number, sellingPrice: number) {
  const cost = Math.max(0, Number(costPrice) || 0);
  const selling = Math.max(0, Number(sellingPrice) || 0);
  if (cost === 0) return 0;
  return Math.round((((selling - cost) / cost) * 100 + Number.EPSILON) * 100) / 100;
}

export function calculateInvoiceStatistics(items: Array<Pick<StageLine, "quantity" | "costPrice" | "sellingPrice">>) {
  const totalCapital = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.costPrice) || 0), 0);
  const totalSales = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.sellingPrice) || 0), 0);
  const totalProfit = totalSales - totalCapital;
  return {
    totalCapital,
    totalSales,
    totalProfit,
    profitPercentage: totalCapital === 0 ? 0 : (totalProfit / totalCapital) * 100,
    productCount: items.length,
    unitCount: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
  };
}

export function unresolvedInvoiceExceptions(exceptions: StageException[], decisions: Record<number, ExceptionDecision | undefined>) {
  return exceptions.filter(exception => !decisions[exception.sourceIndex]);
}

/** Row zero is a valid target, so modal state is independent of the selected row number. */
export function invoiceCameraModalIsOpen(isOpen: boolean, activeRow: number | null, itemCount: number) {
  return isOpen && activeRow !== null && activeRow >= 0 && activeRow < itemCount;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The selected file could not be converted."));
    reader.readAsDataURL(file);
  });
}

export default function InvoiceStaging({ initialStoreId }: { initialStoreId?: number }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const barcodeInputs = useRef<Array<HTMLInputElement | null>>([]);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [referenceSource, setReferenceSource] = useState<ReferenceSource>("product_name");
  const [storeId, setStoreId] = useState("");
  const [cameraRow, setCameraRow] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [continuousCamera, setContinuousCamera] = useState(true);
  const [singleProductOpen, setSingleProductOpen] = useState(false);
  const utils = trpc.useUtils();
  const isSuperAdmin = Boolean(user?.isSuperAdmin || user?.role === "super_admin");
  const canManagePayables = Boolean(isSuperAdmin || user?.role === "admin" || user?.role === "supervisor" || user?.branchRoles?.some(assignment => assignment.role === "admin" || assignment.role === "supervisor"));
  const dashboard = trpc.inventory.dashboard.useQuery(undefined, { enabled: user?.role === "admin" });
  const branchCatalog = trpc.inventory.productCatalog.useQuery(initialStoreId ? { storeId: initialStoreId } : undefined, { enabled: Boolean(initialStoreId) });
  const receivingBranchName = dashboard.data?.branches.find(branch => branch.id === Number(storeId))?.name ?? branchCatalog.data?.stores.find(store => store.id === Number(storeId))?.name;
  const scannerOpen = invoiceCameraModalIsOpen(cameraOpen, cameraRow, stage?.items.length ?? 0);

  useEffect(() => {
    if (initialStoreId) setStoreId(String(initialStoreId));
  }, [initialStoreId]);

  const closeCamera = () => {
    setCameraOpen(false);
    setCameraRow(null);
  };

  const parseInvoice = trpc.inventory.parseInvoice.useMutation({
    onSuccess: (parsed, variables) => {
      closeCamera();
      const calculatedAmount = parsed.items.reduce((sum, item) => sum + (item.quantity ?? 0) * (item.costPrice ?? 0), 0);
      const totalAmount = Math.max(0, Number(parsed.extraction["Total Invoice Amount"]) || calculatedAmount);
      const amountPaid = Math.min(totalAmount, Math.max(0, Number(parsed.extraction["Amount Paid"]) || 0));
      const nextStage: Stage = {
        supplierName: parsed.extraction["Supplier Name"] ?? "",
        supplierResolution: canManagePayables ? "checking" : "unverified",
        totalAmount,
        amountPaid,
        referenceSource: variables.referenceSource ?? "product_name",
        sourceFileKey: parsed.sourceFileKey,
        sourceFileUrl: parsed.sourceFileUrl,
        reviewSessionId: parsed.reviewSessionId,
        originalFileName: file?.name ?? "supplier-invoice",
        sourceMimeType: file?.type as Stage["sourceMimeType"],
        exceptions: parsed.exceptions,
        exceptionDecisions: {},
        items: parsed.items.map(item => ({ ...item, profitMarginEnabled: false, profitMarginPercent: 0, sellingPrice: item.costPrice ?? 0, barcodes: [] })),
      };
      setStage(nextStage);
      if (canManagePayables && nextStage.supplierName.trim()) recognizeSupplier.mutate({ ...(storeId ? { storeId: Number(storeId) } : {}), name: nextStage.supplierName, createIfMissing: false });
      toast.success("Invoice extracted. Review the staged lines before committing.");
    },
    onError: error => toast.error(error.message || "Invoice analysis could not be completed."),
  });
  const commitInvoice = trpc.inventory.commitInvoice.useMutation({
    onSuccess: result => { toast.success(`${result.committedLines} stock line${result.committedLines === 1 ? "" : "s"} committed to ${result.storeName}.`); setLocation(initialStoreId ? `/branches/${initialStoreId}/products` : "/"); },
    onError: error => toast.error(error.message || "The stock transaction was not committed."),
  });
  const recognizeSupplier = trpc.srm.suppliers.recognizeOrCreate.useMutation({
    onSuccess: result => {
      setStage(current => current ? { ...current, supplierId: result.supplier?.id, supplierName: result.supplier?.name ?? current.supplierName, supplierResolution: result.supplier ? "recognized" : "new" } : current);
      if (result.created) toast.success("Supplier profile created and linked to this invoice.");
    },
    onError: error => { setStage(current => current ? { ...current, supplierResolution: "unverified" } : current); toast.error(error.message || "Supplier recognition could not be completed."); },
  });
  const createSingleProduct = trpc.inventory.createProduct.useMutation({
    onSuccess: async () => {
      await utils.inventory.productCatalog.invalidate();
      await utils.inventory.labelProducts.invalidate();
      setSingleProductOpen(false);
      toast.success("Single product saved directly to inventory.");
    },
    onError: error => toast.error(error.message || "The single product could not be saved."),
  });

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const candidate = event.target.files?.[0] ?? null;
    closeCamera();
    setStage(null);
    setReferenceSource("product_name");
    if (!candidate) return setFile(null);
    if (!acceptedTypes.includes(candidate.type as (typeof acceptedTypes)[number])) { toast.error("Use a JPEG, PNG, WebP, or PDF invoice."); event.target.value = ""; return; }
    if (candidate.size > 8 * 1024 * 1024) { toast.error("Invoice files must be 8 MB or smaller."); event.target.value = ""; return; }
    setFile(candidate);
  };

  const analyse = async (source: ReferenceSource = referenceSource) => {
    if (!file) return toast.error("Select a supplier invoice before starting analysis.");
    const dataUrl = await readAsDataUrl(file).catch(error => { toast.error(error.message); return null; });
    if (dataUrl) parseInvoice.mutate({ fileName: file.name, mimeType: file.type as Stage["sourceMimeType"], dataUrl, referenceSource: source });
  };

  const updateLine = (index: number, patch: Partial<StageLine>) => setStage(current => current ? {
    ...current,
    items: current.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch, barcodes: normalizeStageBarcodes(patch.barcodes ?? item.barcodes, patch.barcode ?? item.barcode) };
      const pricingInputChanged = patch.costPrice !== undefined || patch.profitMarginPercent !== undefined || patch.profitMarginEnabled === true;
      if (next.profitMarginEnabled && pricingInputChanged && patch.sellingPrice === undefined) next.sellingPrice = calculateSellingPrice(next.costPrice ?? 0, next.profitMarginPercent);
      if (!next.profitMarginEnabled && (patch.sellingPrice !== undefined || patch.profitMarginEnabled === false)) next.profitMarginPercent = 0;
      return next;
    }),
  } : current);

  const removeLine = (index: number) => {
    if (cameraRow === index) closeCamera();
    else if (cameraRow !== null && index < cameraRow) setCameraRow(cameraRow - 1);
    setStage(current => current ? { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) } : current);
  };

  const addLine = () => setStage(current => current ? { ...current, items: [...current.items, { code: null, productName: "", reference: "", totalAmount: null, quantity: 1, costPrice: 0, profitMarginEnabled: false, profitMarginPercent: 0, sellingPrice: 0, barcodes: [] }] } : current);
  const removeBarcode = (lineIndex: number, barcode: string) => updateLine(lineIndex, { barcodes: normalizeStageBarcodes(stage?.items[lineIndex]?.barcodes, stage?.items[lineIndex]?.barcode).filter(value => value !== barcode) });

  const resolveException = (sourceIndex: number, decision: ExceptionDecision) => setStage(current => {
    if (!current) return current;
    return {
      ...current,
      exceptionDecisions: { ...current.exceptionDecisions, [sourceIndex]: decision },
      items: decision === "exclude" ? current.items.filter(item => item.sourceIndex !== sourceIndex) : current.items,
    };
  });

  const appendBarcodeToLine = async (index: number, rawValue: string) => {
    const barcode = rawValue.trim();
    const currentLine = stage?.items[index];
    if (!currentLine || barcode.length < 3) return toast.error("Enter or scan a barcode with at least 3 characters.");
    const assigned = normalizeStageBarcodes(currentLine.barcodes, currentLine.barcode);
    if (assigned.includes(barcode)) return toast.info("That barcode is already assigned to this invoice row.");
    setStage(current => current ? { ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, barcodes: appendUniqueBarcode(item.barcodes, barcode) } : item) } : current);
    if (!storeId) return toast.success("Barcode appended. Select a branch to check for an existing product.");
    try {
      const product = await utils.inventory.lookupProductByBarcode.fetch({ storeId: Number(storeId), barcode });
      if (!product) return toast.info("Barcode appended as a new product code.");
      updateLine(index, { productName: product.name, costPrice: Number(product.purchasePrice), sellingPrice: Number(product.sellingPrice) });
      toast.success(`${product.name} matched from inventory; barcode appended.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/no product in this branch matches that barcode/i.test(message)) toast.info("Barcode appended as a new product code.");
      else toast.error(message || "Barcode lookup could not be completed.");
    }
  };

  const submitBarcodeInput = (index: number) => {
    const input = barcodeInputs.current[index];
    if (!input) return;
    const value = input.value;
    input.value = "";
    void appendBarcodeToLine(index, value);
  };

  const openCameraForRow = (index: number) => {
    if (!stage?.items[index]) return toast.error("This invoice row is no longer available for barcode scanning.");
    setCameraRow(index);
    setCameraOpen(true);
  };

  const commit = () => {
    if (!stage) return;
    if (!storeId) return toast.error("Choose the destination branch before committing.");
    if (unresolvedInvoiceExceptions(stage.exceptions, stage.exceptionDecisions).length) return toast.error("Please answer every flagged invoice question before saving.");
    if (!stage.supplierName || stage.items.some(item => !item.productName?.trim() || item.quantity === null || item.quantity <= 0 || item.costPrice === null || item.costPrice < 0)) return toast.error("Complete the supplier name, products, quantities, and cost prices before committing.");
    if (canManagePayables && (stage.totalAmount < 0 || stage.amountPaid < 0 || stage.amountPaid > stage.totalAmount)) return toast.error("Amount paid must be between zero and the total supplier invoice amount.");
    commitInvoice.mutate({
      storeId: Number(storeId),
      ...(stage.supplierId ? { supplierId: stage.supplierId } : {}),
      supplierName: stage.supplierName.trim(),
      sourceFileKey: stage.sourceFileKey,
      reviewSessionId: stage.reviewSessionId,
      originalFileName: stage.originalFileName,
      sourceMimeType: stage.sourceMimeType,
      ...(canManagePayables ? { totalAmount: stage.totalAmount, amountPaid: stage.amountPaid } : {}),
      exceptionDecisions: stage.exceptions.map(exception => ({ sourceIndex: exception.sourceIndex, decision: stage.exceptionDecisions[exception.sourceIndex]! })),
      items: stage.items.map(item => ({ productName: item.productName!.trim(), reference: item.reference?.trim() ?? "", ...(item.sourceIndex === undefined ? {} : { sourceIndex: item.sourceIndex }), quantity: item.quantity!, costPrice: item.costPrice!, profitMarginEnabled: item.profitMarginEnabled, profitMarginPercent: item.profitMarginPercent, sellingPrice: item.sellingPrice, barcodes: normalizeStageBarcodes(item.barcodes, item.barcode) })),
    });
  };

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
    <section className="flex flex-col gap-4 border-b border-[#e3e9df] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><button onClick={() => setLocation(initialStoreId ? `/branches/${initialStoreId}/products` : "/")} className="mb-3 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground dark:text-gray-300 hover:text-foreground dark:text-white">← {initialStoreId ? "Back to branch products" : "Central dashboard"}</button><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e6f0cb] text-foreground dark:text-gray-200"><FileSearch className="h-5 w-5" /></span><div><h1 className="font-display text-3xl font-bold tracking-[-.04em] text-foreground dark:text-white">Invoice intake</h1><p className="mt-1 text-sm text-muted-foreground">AI-assisted extraction with a human review gate.</p></div></div></div>
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => setSingleProductOpen(true)} className="border-[#cbd6c8] bg-card dark:bg-gray-800 text-foreground dark:text-gray-200 hover:bg-[#edf3e9]"><Plus className="mr-2 h-4 w-4" /> Add Single Product</Button><Step active label="Upload" complete={Boolean(file)} /><span className="h-px w-6 bg-[#cbd6c8]" /><Step active={Boolean(stage)} label="Review" /><span className="h-px w-6 bg-[#cbd6c8]" /><Step active={false} label="Commit" /></div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[330px_1fr]">
      <aside className="space-y-5"><Card className="border-0 bg-[#12241e] text-white shadow-[0_18px_48px_-26px_rgba(18,36,30,.52)]"><CardHeader className="pb-3"><CardTitle className="font-display text-lg text-white">1. Source invoice</CardTitle><p className="text-sm leading-5 text-white/65">A real vision model reads the supplier document on the server.</p></CardHeader><CardContent className="space-y-4"><input ref={fileInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFile} /><button onClick={() => fileInput.current?.click()} className="flex w-full flex-col items-center rounded-2xl border border-dashed border-white/30 bg-card dark:bg-gray-800/5 px-4 py-7 text-center transition-colors hover:bg-card dark:bg-gray-800/10"><Upload className="mb-3 h-5 w-5 text-[#c7e661]" /><span className="text-sm font-semibold">{file ? file.name : "Upload Invoice"}</span><span className="mt-1 text-xs text-white/55">JPEG, PNG, WebP, or PDF · up to 8 MB</span></button>{file && <div className="flex items-center justify-between rounded-xl bg-card dark:bg-gray-800/10 px-3 py-2 text-xs"><span className="truncate pr-2 text-white/80">{(file.size / 1024 / 1024).toFixed(2)} MB</span><button onClick={() => { setFile(null); setStage(null); closeCamera(); if (fileInput.current) fileInput.current.value = ""; }} className="text-white/60 hover:text-white" aria-label="Remove selected invoice"><X className="h-4 w-4" /></button></div>}<div className="rounded-xl border border-white/20 bg-white/5 p-3"><Label htmlFor="referenceSource" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-white/70">Reference Source (this invoice)</Label><select id="referenceSource" value={referenceSource} onChange={event => { const next = event.target.value as ReferenceSource; setReferenceSource(next); setStage(current => current ? { ...current, referenceSource: next } : current); void analyse(next); }} className="h-10 w-full rounded-md border border-white/20 bg-[#213c31] px-3 text-sm text-white"><option value="product_name">Reference inside Product Name</option><option value="separate_column">Reference in a separate column/field</option><option value="separate_area">Reference in another area/side of the invoice</option></select><p className="mt-1.5 text-[11px] leading-4 text-white/60">Choose where this invoice stores supplier references before extraction.</p></div><Button onClick={() => void analyse()} disabled={!file || parseInvoice.isPending} className="h-10 w-full bg-[#c7e661] text-foreground dark:text-white hover:bg-[#d6ef81]">{parseInvoice.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading invoice…</> : <><FileSearch className="mr-2 h-4 w-4" /> Extract invoice data</>}</Button></CardContent></Card><Card className="border-[#dfe7d9] bg-[#f7f9f4]"><CardContent className="p-4"><div className="flex gap-3"><ScanBarcode className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground dark:text-gray-300" /><div><p className="text-sm font-semibold text-foreground dark:text-gray-100">Hybrid scanner ready</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Focus a row’s barcode input, scan with a USB reader, and press Enter to append another code. The camera button appends codes to that same row too.</p></div></div></CardContent></Card></aside>

      <Card className="min-h-[460px] border-0 bg-card dark:bg-gray-800 shadow-[0_18px_48px_-28px_rgba(18,36,30,.32)]">
        {!stage ? <EmptyStage loading={parseInvoice.isPending} /> : <><CardHeader className="border-b border-[#e8ece6] px-5 py-5 sm:px-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2"><Badge className="bg-[#e6f0cb] text-foreground dark:text-gray-200 hover:bg-[#e6f0cb]">AI extraction staged</Badge><span className="text-xs text-muted-foreground">{stage.items.length} line{stage.items.length === 1 ? "" : "s"}</span></div><CardTitle className="mt-3 font-display text-xl">2. Review and barcode the stock</CardTitle><p className="mt-1 text-sm text-muted-foreground">Each product row retains its Reference, optional margin rule, selling price, and barcode controls before the inventory commit.</p></div><div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[32rem]"><div><Label htmlFor="storeId" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Receiving branch</Label><Select value={storeId} onValueChange={setStoreId}><SelectTrigger id="storeId" className="bg-muted dark:bg-gray-800"><SelectValue placeholder="Choose branch" /></SelectTrigger><SelectContent>{initialStoreId ? <SelectItem value={String(initialStoreId)}>{receivingBranchName ?? `Branch #${initialStoreId}`}</SelectItem> : dashboard.isLoading ? <SelectItem value="loading" disabled>Loading branches…</SelectItem> : dashboard.data?.branches.map(branch => <SelectItem value={String(branch.id)} key={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div></div></div></CardHeader><CardContent className="p-0"><div className="border-b border-[#e8ece6] bg-muted dark:bg-gray-800 px-5 py-4 sm:px-6"><Label htmlFor="supplierName" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Supplier Name</Label><Input id="supplierName" value={stage.supplierName} onChange={event => setStage({ ...stage, supplierName: event.target.value })} className="max-w-xl bg-card dark:bg-gray-800" /></div><div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[1600px]"><thead className="border-b border-[#e8ece6] bg-card dark:bg-gray-800 text-left text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground"><tr><th className="w-12 px-4 py-3 text-center">#</th><th className="w-48 px-3 py-3">Supplier name</th><th className="px-3 py-3">Product name</th><th className="w-28 px-3 py-3">Quantity</th><th className="w-36 px-3 py-3">Cost price</th><th className="w-40 px-3 py-3">Margin option</th><th className="w-36 px-3 py-3">Selling price</th><th className="w-40 px-3 py-3">Reference</th><th className="w-[370px] px-3 py-3">Assign Barcodes</th><th className="w-12 px-3 py-3" /></tr></thead><tbody>{stage.items.map((item, index) => { const rowBarcodes = normalizeStageBarcodes(item.barcodes, item.barcode); return <tr className="border-b border-[#edf0eb] bg-card dark:bg-gray-800 last:border-b-0" key={index}><td className="px-4 py-3 text-center font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</td><td className="px-3 py-3"><Input value={stage.supplierName} aria-label={`Supplier name for ${item.productName || `line ${index + 1}`}`} onChange={event => setStage({ ...stage, supplierName: event.target.value })} className="h-9" /></td><td className="px-3 py-3"><Input value={item.productName ?? ""} placeholder="Product name" onChange={event => updateLine(index, { productName: event.target.value })} className="h-9" /></td><td className="px-3 py-3"><Input type="number" min="1" value={item.quantity ?? ""} onChange={event => updateLine(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="h-9 font-mono" /></td><td className="px-3 py-3"><Input type="number" min="0" step="0.01" value={item.costPrice ?? ""} onChange={event => updateLine(index, { costPrice: Math.max(0, Number(event.target.value) || 0) })} className="h-9 font-mono" /></td><td className="px-3 py-3"><div className="space-y-2"><label className="flex items-center gap-2 text-xs font-medium text-foreground dark:text-gray-100"><input type="checkbox" checked={item.profitMarginEnabled} onChange={event => updateLine(index, { profitMarginEnabled: event.target.checked })} aria-label={`Enable profit margin for ${item.productName || `line ${index + 1}`}`} className="h-4 w-4 rounded border-[#b8c7b7] accent-[#213c31]" />Use margin</label>{item.profitMarginEnabled ? <Input type="number" min="0" step="0.01" value={item.profitMarginPercent} aria-label={`Profit margin percentage for ${item.productName || `line ${index + 1}`}`} onChange={event => updateLine(index, { profitMarginPercent: Math.max(0, Number(event.target.value) || 0) })} className="h-9 font-mono" placeholder="20" /> : <p className="text-[11px] text-muted-foreground">Manual price</p>}</div></td><td className="px-3 py-3"><Input type="number" min="0" step="0.01" value={item.sellingPrice} aria-label={`Primary review selling price for ${item.productName || `line ${index + 1}`}`} disabled={item.profitMarginEnabled} onChange={event => updateLine(index, { sellingPrice: Math.max(0, Number(event.target.value) || 0) })} className="h-9 font-mono disabled:cursor-not-allowed disabled:opacity-80" /></td><td className="px-3 py-3"><Input value={item.reference ?? ""} placeholder="AB12C" aria-label={`Primary review reference code for ${item.productName || `line ${index + 1}`}`} onChange={event => updateLine(index, { reference: event.target.value })} className="h-9 font-mono" /></td><td className="px-3 py-3"><div className="space-y-2"><div className="flex items-center gap-1.5"><div className="relative flex-1"><ScanBarcode className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[#7f9483]" /><Input ref={element => { barcodeInputs.current[index] = element; }} placeholder="Focus, scan, then press Enter" aria-label={`Add barcode for ${item.productName || `line ${index + 1}`}`} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submitBarcodeInput(index); } }} className="h-9 pl-9 font-mono text-xs" /></div><Button type="button" variant="outline" size="icon" onClick={() => openCameraForRow(index)} className="h-9 w-9 shrink-0 border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700" aria-label={`Scan barcode via camera for ${item.productName || `line ${index + 1}`}`}><Camera className="h-4 w-4" /></Button><Button type="button" size="sm" onClick={() => submitBarcodeInput(index)} className="h-9 shrink-0 bg-indigo-600 px-3 text-white hover:bg-indigo-700"><Plus className="me-1 h-3.5 w-3.5" /> Add</Button></div>{rowBarcodes.length ? <div className="flex flex-wrap gap-1.5">{rowBarcodes.map(barcode => <Badge key={barcode} variant="outline" className="group border-indigo-200 bg-indigo-50 py-1 font-mono text-[10px] text-indigo-700"><Barcode className="me-1 h-3 w-3" />{barcode}<button type="button" onClick={() => removeBarcode(index, barcode)} aria-label={`Delete barcode ${barcode}`} className="ms-1 inline-flex rounded-sm text-indigo-500 hover:text-rose-600"><X className="h-3 w-3" /></button></Badge>)}</div> : <p className="text-xs text-muted-foreground">No barcode assigned. Scan or add as many codes as needed.</p>}</div></td><td className="px-3 py-3"><Button variant="ghost" size="icon" onClick={() => removeLine(index)} disabled={stage.items.length === 1} className="h-8 w-8 text-[#9c6254] hover:bg-[#fce8e1] hover:text-[#b85b43]" aria-label={`Remove ${item.productName || "line"}`}><Trash2 className="h-4 w-4" /></Button></td></tr>; })}</tbody></table></div><InvoiceStatisticsSummary items={stage.items} /><div className="flex flex-col gap-4 bg-muted dark:bg-gray-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><Button variant="outline" onClick={addLine} className="border-[#cbd6c8] bg-card dark:bg-gray-800 text-foreground dark:text-gray-200"><Plus className="mr-2 h-4 w-4" /> Add line</Button><div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"><p className="text-xs text-muted-foreground">Saving creates the invoice, stock entries, pricing settings, reference values, balances, and every barcode link in one transaction.</p><Button onClick={commit} disabled={commitInvoice.isPending || !storeId} className="bg-[#12241e] text-white hover:bg-[#213c31]">{commitInvoice.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Check className="mr-2 h-4 w-4" /> Save to Inventory</>}</Button></div></div></CardContent></>}</Card>
      {stage && canManagePayables && <Card className="border-[#dce7d8] bg-card dark:bg-gray-800 shadow-[0_14px_42px_-28px_rgba(18,36,30,.26)]"><CardHeader className="border-b border-[#e8ece6]"><CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-muted-foreground dark:text-gray-300" /> Supplier & Accounts Payable review</CardTitle><p className="text-sm text-muted-foreground">Confirm the AI-detected supplier and payable values before this intake writes the supplier debt ledger.</p></CardHeader><CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]"><div className="space-y-3"><div><Label htmlFor="srm-supplier-name">AI-detected supplier</Label><Input id="srm-supplier-name" value={stage.supplierName} onChange={event => setStage({ ...stage, supplierName: event.target.value, supplierId: undefined, supplierResolution: "new" })} className="mt-1.5" /></div><div className="flex flex-wrap items-center gap-2"><Badge className={stage.supplierResolution === "recognized" ? "bg-[#e6f0cb] text-foreground dark:text-gray-200" : stage.supplierResolution === "new" ? "bg-[#fff0d8] text-[#a66b28]" : "bg-[#edf1ed] text-[#5b6d5e]"}>{stage.supplierResolution === "recognized" ? "Existing supplier selected" : stage.supplierResolution === "checking" ? "Checking detected supplier…" : stage.supplierResolution === "new" ? "New supplier profile required" : "Supplier needs verification"}</Badge><Button type="button" variant="outline" size="sm" disabled={recognizeSupplier.isPending || !stage.supplierName.trim() || !storeId} onClick={() => recognizeSupplier.mutate({ storeId: Number(storeId), name: stage.supplierName.trim(), createIfMissing: stage.supplierResolution === "new" })}>{recognizeSupplier.isPending ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <Building2 className="me-1.5 h-3.5 w-3.5" />}{stage.supplierResolution === "new" ? "Create supplier profile" : "Verify supplier"}</Button></div><p className="text-xs leading-5 text-muted-foreground">If no matching profile exists, use the inline action to create and link the supplier before committing the invoice.</p></div><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1"><div><Label htmlFor="srm-total-amount">Total Amount (DZD)</Label><Input id="srm-total-amount" type="number" min="0" step="0.01" value={stage.totalAmount} onChange={event => { const totalAmount = Math.max(0, Number(event.target.value) || 0); setStage({ ...stage, totalAmount, amountPaid: Math.min(stage.amountPaid, totalAmount) }); }} className="mt-1.5 font-mono" /></div><div><Label htmlFor="srm-amount-paid">Amount Paid (DZD)</Label><Input id="srm-amount-paid" type="number" min="0" max={stage.totalAmount} step="0.01" value={stage.amountPaid} onChange={event => setStage({ ...stage, amountPaid: Math.min(stage.totalAmount, Math.max(0, Number(event.target.value) || 0)) })} className="mt-1.5 font-mono" /></div><div className="rounded-xl bg-muted dark:bg-gray-800 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Remaining Amount (Debt)</p><p className="mt-1 font-mono text-lg font-bold text-[#b85b43]">{formatDZD(Math.max(0, stage.totalAmount - stage.amountPaid))}</p></div></div></CardContent></Card>}
      <CameraBarcodeScanner open={scannerOpen} onOpenChange={open => { if (!open) closeCamera(); else setCameraOpen(true); }} continuous={continuousCamera} onContinuousChange={setContinuousCamera} title="Append barcode via camera" description="Start the camera, then scan as many codes as needed to append them to this invoice row." onDetected={barcode => { if (cameraRow !== null && stage?.items[cameraRow]) void appendBarcodeToLine(cameraRow, barcode); }} />
      <ProductEditor open={singleProductOpen} onOpenChange={setSingleProductOpen} singleEntry stores={(dashboard.data?.branches ?? []).filter(branch => !initialStoreId || branch.id === initialStoreId).map(branch => ({ id: branch.id, name: branch.name }))} defaultStoreId={storeId || (dashboard.data?.branches[0] ? String(dashboard.data.branches[0].id) : "")} saving={createSingleProduct.isPending} onSave={draft => createSingleProduct.mutate({ storeId: Number(draft.storeId), name: draft.name, sku: draft.sku || undefined, reference: draft.reference || draft.sku || undefined, category: draft.category || undefined, variations: draft.variations || undefined, purchasePrice: Number(draft.purchasePrice), sellingPrice: Number(draft.sellingPrice), stockQuantity: Number(draft.stockQuantity), barcodes: draft.barcodes })} />
    </section>
    {stage && stage.exceptions.length > 0 && <section className="mt-6">
      <Card className="border-amber-200 bg-amber-50/70 dark:bg-amber-950/20">
        <CardHeader className="border-b border-amber-200/70 pb-4"><CardTitle className="text-lg text-amber-900 dark:text-amber-100">Confirmation required</CardTitle><p className="text-sm text-amber-800 dark:text-amber-200">Answer each unusual or unmapped item question before inventory can be saved.</p></CardHeader>
        <CardContent className="space-y-3 p-5">{stage.exceptions.map(exception => <div key={exception.sourceIndex} className="rounded-xl border border-amber-200 bg-card dark:bg-gray-800 p-3"><p className="text-sm font-medium text-foreground dark:text-gray-100">{exception.question}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant={stage.exceptionDecisions[exception.sourceIndex] === "include" ? "default" : "outline"} onClick={() => resolveException(exception.sourceIndex, "include")}>Include item</Button><Button type="button" size="sm" variant={stage.exceptionDecisions[exception.sourceIndex] === "edited" ? "default" : "outline"} onClick={() => resolveException(exception.sourceIndex, "edited")}>Include after review</Button><Button type="button" size="sm" variant={stage.exceptionDecisions[exception.sourceIndex] === "exclude" ? "destructive" : "outline"} onClick={() => resolveException(exception.sourceIndex, "exclude")}>Exclude item</Button></div></div>)}</CardContent>
      </Card>
    </section>}
  </div>;
}

function InvoiceStatisticsSummary({ items }: { items: StageLine[] }) {
  const statistics = calculateInvoiceStatistics(items);
  const values = [
    ["إجمالي رأس المال", formatDZD(statistics.totalCapital)],
    ["إجمالي قيمة البيع", formatDZD(statistics.totalSales)],
    ["إجمالي الفائدة", formatDZD(statistics.totalProfit)],
    ["نسبة الفائدة", `${statistics.profitPercentage.toFixed(2)}%`],
    ["عدد المنتجات", String(statistics.productCount)],
    ["عدد الوحدات", String(statistics.unitCount)],
  ];
  return <div className="border-t border-[#e8ece6] bg-card dark:bg-gray-800 px-5 py-4 sm:px-6" dir="rtl"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{values.map(([label, value]) => <div key={label} className="rounded-xl border border-[#e3e9df] bg-muted dark:bg-gray-800 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-lg font-bold text-foreground dark:text-gray-100">{value}</p></div>)}</div></div>;
}

function Step({ active, label, complete = false }: { active: boolean; label: string; complete?: boolean }) { return <span className={`flex items-center gap-1.5 text-xs font-semibold ${active ? "text-foreground dark:text-gray-200" : "text-muted-foreground"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-[#dcecb1] text-foreground dark:text-gray-200" : "bg-[#e8ece6]"}`}>{complete ? <Check className="h-3 w-3" /> : label[0]}</span>{label}</span>; }

function EmptyStage({ loading }: { loading: boolean }) { return <div className="flex min-h-[460px] flex-col items-center justify-center px-6 text-center"><div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${loading ? "bg-[#e6f0cb]" : "bg-[#f0f3ee]"}`}><FileSearch className={`h-6 w-6 ${loading ? "animate-pulse text-foreground dark:text-gray-200" : "text-[#94a895]"}`} /></div><h2 className="mt-5 font-display text-xl font-bold text-foreground dark:text-gray-100">{loading ? "Reading your supplier invoice" : "Your review table will appear here"}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{loading ? "The production vision service is extracting the supplier, products, quantities, and unit costs as structured data." : "Choose an invoice from the left. Each extracted row can accumulate multiple USB or camera-scanned barcode values before stock is committed."}</p>{loading && <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-muted-foreground dark:text-gray-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing document</div>}</div>; }
