import { CameraBarcodeScanner } from "@/components/CameraBarcodeScanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { formatDZD } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { ArchiveRestore, Barcode, Camera, CheckCircle2, FileSearch, Loader2, Minus, PackageSearch, Plus, RotateCcw, ScanLine, X } from "lucide-react";
import React, { FormEvent, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type ReturnMode = "invoice" | "direct";
type DirectReturnItem = { productId: number; name: string; barcode: string; unitRefund: number; quantity: number };

export function ReturnDesk({ onClose, previewStoreId, allowInvoiceReturns = true }: { onClose: () => void; previewStoreId?: number; allowInvoiceReturns?: boolean }) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<ReturnMode>(allowInvoiceReturns ? "invoice" : "direct");
  const [invoiceEntry, setInvoiceEntry] = useState("");
  const [submittedInvoice, setSubmittedInvoice] = useState("");
  const [invoiceCameraOpen, setInvoiceCameraOpen] = useState(false);
  const [directCameraOpen, setDirectCameraOpen] = useState(false);
  const [continuousCamera, setContinuousCamera] = useState(true);
  const [directBarcode, setDirectBarcode] = useState("");
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [directItems, setDirectItems] = useState<DirectReturnItem[]>([]);
  const scope = useMemo(() => previewStoreId ? { previewStoreId } : {}, [previewStoreId]);
  const receipt = trpc.pos.findReceipt.useQuery({ receiptNumber: submittedInvoice, ...scope }, { enabled: Boolean(submittedInvoice), retry: false });
  const processInvoiceReturn = trpc.pos.processReturn.useMutation({
    onSuccess: result => { toast.success(`Invoice return complete · ${formatDZD(result.totalRefund)} restored.`); onClose(); },
    onError: error => toast.error(error.message || "Invoice return could not be completed."),
  });
  const processDirectReturn = trpc.pos.processDirectReturn.useMutation({
    onSuccess: result => { toast.success(`Direct return ${result.returnNumber} recorded · ${formatDZD(result.totalRefund)} restored.`); onClose(); },
    onError: error => toast.error(error.message || "Direct return could not be completed."),
  });

  const findInvoice = useCallback((raw: string) => {
    const invoiceNumber = raw.trim();
    if (!invoiceNumber) return;
    setInvoiceEntry(invoiceNumber);
    setQuantities({});
    setSubmittedInvoice(invoiceNumber);
  }, []);

  const addDirectBarcode = useCallback(async (raw: string) => {
    const barcode = raw.trim();
    if (!barcode) return;
    setDirectBarcode("");
    try {
      const product = await utils.pos.lookupReturnBarcode.fetch({ barcode, ...scope });
      setDirectItems(items => {
        const match = items.find(item => item.productId === product.id);
        return match ? items.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...items, { productId: product.id, name: product.name, barcode: product.barcode, unitRefund: Number(product.retailPrice), quantity: 1 }];
      });
      toast.success(`${product.name} added to direct return.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product barcode could not be found.";
      toast.error(/no product in this branch/i.test(message) ? "Product not found. Barcode is not registered for this branch." : message);
    }
  }, [scope, utils.pos.lookupReturnBarcode]);

  useBarcodeScanner(code => { if (allowInvoiceReturns && mode === "invoice") findInvoice(code); else void addDirectBarcode(code); }, true);

  const receiptLines = receipt.data?.lines ?? [];
  const invoiceRefundTotal = receiptLines.reduce((total, line) => total + (quantities[line.id] ?? 0) * (Number(line.unitPrice) - Number(line.unitDiscount)), 0);
  const directRefundTotal = directItems.reduce((total, item) => total + item.unitRefund * item.quantity, 0);
  const submitInvoiceSearch = (event: FormEvent) => { event.preventDefault(); findInvoice(invoiceEntry); };
  const submitDirectScan = (event: FormEvent) => { event.preventDefault(); void addDirectBarcode(directBarcode); };
  const returnAll = () => setQuantities(Object.fromEntries(receiptLines.filter(line => line.returnableQuantity > 0).map(line => [line.id, line.returnableQuantity])));
  const submitInvoiceReturn = () => {
    if (!receipt.data) return;
    const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([saleLineId, quantity]) => ({ saleLineId: Number(saleLineId), quantity }));
    if (!items.length) return toast.error("Choose at least one invoice item to return.");
    processInvoiceReturn.mutate({ saleId: receipt.data.sale.id, ...scope, reason: reason.trim() || undefined, items });
  };
  const submitDirectReturn = () => {
    if (!directItems.length) return toast.error("Scan at least one product for the direct return.");
    processDirectReturn.mutate({ ...scope, reason: reason.trim() || undefined, items: directItems.map(item => ({ productId: item.productId, quantity: item.quantity })) });
  };

  return <div className="fixed inset-0 z-50 flex items-end bg-[#12241e]/40 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6"><Card className="max-h-[94vh] w-full max-w-4xl overflow-auto rounded-b-none border-0 bg-muted dark:bg-gray-800 shadow-2xl sm:rounded-[1.5rem]"><CardHeader className="flex flex-row items-start justify-between border-b border-border"><div><CardTitle className="flex items-center gap-2 font-display text-xl"><RotateCcw className="h-5 w-5 text-muted-foreground dark:text-gray-300" /> Return / refund</CardTitle><p className="mt-1 text-sm text-muted-foreground">{allowInvoiceReturns ? "Scan an invoice barcode for an exact return, or return products directly without an invoice." : "Scan products to process a standard direct return for your assigned branch."}</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close returns"><X className="h-5 w-5" /></Button></CardHeader><CardContent className="space-y-4 p-5">{allowInvoiceReturns && <div className="grid grid-cols-2 rounded-xl border border-[#dce7d8] bg-card dark:bg-gray-800 p-1"><button type="button" onClick={() => setMode("invoice")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === "invoice" ? "bg-[#12241e] text-white" : "text-muted-foreground dark:text-gray-300"}`}><FileSearch className="me-1.5 inline h-4 w-4" /> Invoice return</button><button type="button" onClick={() => setMode("direct")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === "direct" ? "bg-[#12241e] text-white" : "text-muted-foreground dark:text-gray-300"}`}><PackageSearch className="me-1.5 inline h-4 w-4" /> Direct items</button></div>}
    {allowInvoiceReturns && mode === "invoice" ? <section className="space-y-4"><form onSubmit={submitInvoiceSearch} className="flex gap-2"><div className="relative flex-1"><ScanLine className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={invoiceEntry} onChange={event => setInvoiceEntry(event.target.value)} placeholder="Scan or enter 12-digit invoice number" className="bg-card dark:bg-gray-800 ps-9 font-mono" /></div><Button type="button" variant="outline" size="icon" onClick={() => setInvoiceCameraOpen(true)} className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" aria-label="Scan invoice with camera"><Camera className="h-4 w-4" /></Button><Button type="submit" className="bg-[#12241e] hover:bg-[#213c31]">{receipt.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find invoice"}</Button></form><p className="text-xs text-muted-foreground">The scanner accepts the printed 12-digit invoice barcode or the existing receipt number. Quantity sold is the original quantity on that invoice; use Return all for a full return or choose quantities for a partial return.</p>{receipt.error && <p className="rounded-xl bg-[#fce8e1] p-3 text-sm text-[#a54d38]">{receipt.error.message}</p>}{receipt.data && <><div className="rounded-xl border border-[#dce7d8] bg-card dark:bg-gray-800 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong className="font-mono">{receipt.data.sale.invoiceNumber ?? receipt.data.sale.receiptNumber}</strong> · {new Date(receipt.data.sale.createdAt).toLocaleString()}</span><Badge className="bg-[#e6f0cb] text-foreground dark:text-gray-200 hover:bg-[#e6f0cb]">{formatDZD(receipt.data.sale.total)}</Badge></div></div><div className="overflow-x-auto rounded-xl border border-border bg-card dark:bg-gray-800"><table className="w-full min-w-[650px] text-sm"><thead className="bg-[#f6f8f3] text-left text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground"><tr><th className="px-3 py-3">Item</th><th className="px-3 py-3">Quantity sold</th><th className="px-3 py-3">Returnable</th><th className="px-3 py-3">Returning</th><th className="px-3 py-3 text-right">Refund</th></tr></thead><tbody>{receiptLines.map(line => <tr key={line.id} className="border-t border-border"><td className="px-3 py-3 font-medium text-foreground dark:text-gray-100">{line.productName}</td><td className="px-3 py-3 font-mono font-semibold text-foreground dark:text-gray-100">{line.quantity}</td><td className="px-3 py-3 font-mono text-muted-foreground dark:text-gray-300">{line.returnableQuantity}</td><td className="px-3 py-3"><Input aria-label={`Return quantity for ${line.productName}`} type="number" min="0" max={line.returnableQuantity} value={quantities[line.id] ?? ""} onChange={event => setQuantities(current => ({ ...current, [line.id]: Math.min(line.returnableQuantity, Math.max(0, Number(event.target.value) || 0)) }))} className="h-8 w-20 font-mono" disabled={line.returnableQuantity === 0} /></td><td className="px-3 py-3 text-right font-mono">{formatDZD((quantities[line.id] ?? 0) * (Number(line.unitPrice) - Number(line.unitDiscount)))}</td></tr>)}</tbody></table></div><ReturnFooter reason={reason} setReason={setReason} label="Invoice refund total" total={invoiceRefundTotal} pending={processInvoiceReturn.isPending} onReturn={submitInvoiceReturn} secondaryAction={<Button type="button" variant="outline" onClick={returnAll}>Return all eligible</Button>} /></>}</section> : <section className="space-y-4"><form onSubmit={submitDirectScan} className="flex gap-2"><div className="relative flex-1"><Barcode className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={directBarcode} onChange={event => setDirectBarcode(event.target.value)} placeholder="Scan or enter a product barcode" className="bg-card dark:bg-gray-800 ps-9 font-mono" /></div><Button type="button" variant="outline" size="icon" onClick={() => setDirectCameraOpen(true)} className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" aria-label="Scan product with camera"><Camera className="h-4 w-4" /></Button><Button type="submit" className="bg-[#12241e] hover:bg-[#213c31]"><Plus className="me-1 h-4 w-4" /> Add</Button></form><p className="text-xs text-muted-foreground">Direct returns are not linked to an invoice, so no original Quantity Sold exists. Enter the return quantity below; the current product selling price is used for the refund.</p>{directItems.length ? <div className="overflow-x-auto rounded-xl border border-border bg-card dark:bg-gray-800"><table className="w-full min-w-[610px] text-sm"><thead className="bg-[#f6f8f3] text-left text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground"><tr><th className="px-3 py-3">Product</th><th className="px-3 py-3">Barcode</th><th className="px-3 py-3">Return quantity</th><th className="px-3 py-3 text-right">Refund</th><th className="w-10 px-3 py-3" /></tr></thead><tbody>{directItems.map(item => <tr key={item.productId} className="border-t border-border"><td className="px-3 py-3 font-medium text-foreground dark:text-gray-100">{item.name}</td><td className="px-3 py-3 font-mono text-xs text-muted-foreground">{item.barcode}</td><td className="px-3 py-3"><Input aria-label={`Direct return quantity for ${item.name}`} type="number" min="1" step="1" value={item.quantity} onChange={event => { const quantity = Math.max(1, Math.floor(Number(event.target.value) || 1)); setDirectItems(items => items.map(current => current.productId === item.productId ? { ...current, quantity } : current)); }} className="h-8 w-24 font-mono" /></td><td className="px-3 py-3 text-right font-mono">{formatDZD(item.unitRefund * item.quantity)}</td><td className="px-3 py-3"><Button type="button" variant="ghost" size="icon" onClick={() => setDirectItems(items => items.filter(current => current.productId !== item.productId))} className="h-8 w-8 text-[#a96354]"><X className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-[#d6e0d3] p-8 text-center text-sm text-muted-foreground">Use a physical scanner, the camera, or manual barcode entry to add returned products.</div>}<ReturnFooter reason={reason} setReason={setReason} label="Direct refund total" total={directRefundTotal} pending={processDirectReturn.isPending} onReturn={submitDirectReturn} /></section>}
    <CameraBarcodeScanner open={invoiceCameraOpen} onOpenChange={setInvoiceCameraOpen} title="Scan invoice barcode" description="Tap Start Camera, then point at the printed 12-digit invoice barcode." onDetected={code => findInvoice(code)} />
    <CameraBarcodeScanner open={directCameraOpen} onOpenChange={setDirectCameraOpen} continuous={continuousCamera} onContinuousChange={setContinuousCamera} title="Scan returned product" description="Tap Start Camera, then scan each product barcode to append it to this direct return." onDetected={code => void addDirectBarcode(code)} />
  </CardContent></Card></div>;
}

function ReturnFooter({ reason, setReason, label, total, pending, onReturn, secondaryAction }: { reason: string; setReason: (value: string) => void; label: string; total: number; pending: boolean; onReturn: () => void; secondaryAction?: React.ReactNode }) {
  return <><div><Label htmlFor="returnReason" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Reason (optional)</Label><Input id="returnReason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Customer changed their mind" className="bg-card dark:bg-gray-800" /></div><div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="font-display text-lg font-bold text-foreground dark:text-white">{label} <span className="font-mono">{formatDZD(total)}</span></p><div className="flex gap-2">{secondaryAction}<Button onClick={onReturn} disabled={pending || total <= 0} className="bg-[#e8896a] text-white hover:bg-[#dc765a]">{pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</> : <><ArchiveRestore className="mr-2 h-4 w-4" /> Complete return</>}</Button></div></div></>;
}
