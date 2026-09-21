import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CameraBarcodeScanner } from "@/components/CameraBarcodeScanner";
import { CashOutDialog } from "@/components/CashOutDialog";
import { ReturnDesk as ReturnDeskPanel } from "@/components/ReturnDesk";
import { ReceiptData, ThermalReceipt } from "@/components/ThermalReceipt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { formatDZD } from "@/lib/currency";
import { CartProduct, PosCartProvider, usePosCarts } from "@/lib/posCart";
import { getCustomerDraftStorageKey } from "@/lib/posDevice";
import { trpc } from "@/lib/trpc";
import { ArchiveRestore, Banknote, Barcode, Camera, CheckCircle2, CircleDollarSign, ClipboardList, CreditCard, Keyboard, Loader2, Minus, PackageSearch, Pause, Pencil, Plus, ReceiptText, RotateCcw, ScanLine, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation } from "wouter";

const currency = { format: formatDZD };
// Legacy inline key controls intentionally render no characters; mapping administration lives in QuickKeyManagementCard.
const QUICK_KEY_CHARACTERS: string[] = [];
type QuickKeyMappingRow = { keyCharacter: string; productId: number; productName: string; sku: string | null; quantityOnHand: number; retailPrice: string; barcodes: string[] };
function stockIndicator(stock: number) { return stock <= 0 ? { key: "common.outOfStock", className: "text-red-500", card: "opacity-50 grayscale" } : stock <= 10 ? { key: "common.lowStock", className: "text-orange-500", card: "" } : { key: "common.inStock", className: "text-emerald-600 dark:text-emerald-400", card: "" }; }

export function getPosBarcodeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/no product in this branch matches that barcode|product not found|barcode not registered/i.test(message)) {
    return "Product not found. Barcode is not registered for this branch.";
  }
  return message || "Barcode could not be found.";
}

export function getPosReferenceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/no product in this branch matches that reference|reference.*not found/i.test(message)) {
    return "pos.referenceNotFound";
  }
  return "pos.referenceNotFound";
}

export function isAutomaticBarcodeCandidate(value: string) {
  return /^\d{8,128}$/.test(value.trim());
}

export default function CashierPOS({ adminPreview = false, branchStoreId }: { adminPreview?: boolean; branchStoreId?: number }) {
  return <PosCartProvider><CashierTerminal adminPreview={adminPreview} branchStoreId={branchStoreId} /></PosCartProvider>;
}

function CashierTerminal({ adminPreview = false, branchStoreId }: { adminPreview?: boolean; branchStoreId?: number }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const workspace = trpc.inventory.cashierWorkspace.useQuery(undefined, { enabled: !branchStoreId && Boolean(user?.branchRoles.some(assignment => assignment.role === "cashier" || assignment.role === "supervisor")) });
  const previewDashboard = trpc.inventory.dashboard.useQuery(undefined, { enabled: adminPreview });
  const permittedBranches = trpc.enterprise.branches.active.useQuery(undefined, { enabled: Boolean(branchStoreId) });
  const utils = trpc.useUtils();
  const { carts, activeCart, activeCartId, addProduct, addCustom, addCustomBlank, setUnitPrice, setQuantity, setDiscount, removeLine, createCart, selectCart, toggleHold, closeCart, clearActive, completeActive } = usePosCarts();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mobile" | "credit" | "other">("cash");
  const [creditFirstName, setCreditFirstName] = useState("");
  const [creditLastName, setCreditLastName] = useState("");
  const [creditPhone, setCreditPhone] = useState("");
  const [amountPaidNow, setAmountPaidNow] = useState("");
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showReturns, setShowReturns] = useState(false);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [continuousCameraScanning, setContinuousCameraScanning] = useState(true);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [previewStoreId, setPreviewStoreId] = useState(branchStoreId ? String(branchStoreId) : "");
  const selectedPreviewStore = previewDashboard.data?.branches.find(store => store.id === Number(previewStoreId));
  const activeStore = adminPreview ? selectedPreviewStore : branchStoreId ? permittedBranches.data?.find(store => store.id === branchStoreId) : workspace.data;
  const posScope = useMemo(() => (adminPreview || branchStoreId) && previewStoreId ? { previewStoreId: Number(previewStoreId) } : {}, [adminPreview, branchStoreId, previewStoreId]);
  const activeBranchRole = branchStoreId ? user?.branchRoles.find(assignment => assignment.storeId === branchStoreId)?.role : undefined;
  const canEditQuickKeys = Boolean(user?.isSuperAdmin || activeBranchRole === "admin");
  const [quickKeyDialogOpen, setQuickKeyDialogOpen] = useState(false);
  const [quickKeyOriginalCharacter, setQuickKeyOriginalCharacter] = useState<string | null>(null);
  const [quickKeyCharacter, setQuickKeyCharacter] = useState("");
  const [quickKeyProductQuery, setQuickKeyProductQuery] = useState("");
  const [quickKeySelectedProduct, setQuickKeySelectedProduct] = useState<{ id: number; name: string; sku: string | null; barcodes: string[] } | null>(null);
  const printAfterCheckoutRef = useRef(true);
  const quickKeyMappings = trpc.pos.quickKeyMappings.useQuery(posScope, { enabled: Boolean(activeStore) });
  const setQuickKeyMutation = trpc.pos.setQuickKey.useMutation({ onSuccess: () => { void utils.pos.quickKeyMappings.invalidate(posScope); }, onError: error => toast.error(error.message) });
  const quickKeyMapping = useMemo(() => Object.fromEntries((quickKeyMappings.data ?? []).map(mapping => [mapping.keyCharacter, mapping.productId])) as Record<string, number>, [quickKeyMappings.data]);
  const activeQuickKeys = useMemo(() => {
    const grouped = new Map<string, QuickKeyMappingRow>();
    for (const mapping of quickKeyMappings.data ?? []) {
      const current = grouped.get(mapping.keyCharacter) ?? { keyCharacter: mapping.keyCharacter, productId: mapping.productId, productName: mapping.productName, sku: mapping.sku, quantityOnHand: mapping.quantityOnHand, retailPrice: mapping.retailPrice, barcodes: [] };
      if (mapping.barcode && !current.barcodes.includes(mapping.barcode)) current.barcodes.push(mapping.barcode);
      grouped.set(mapping.keyCharacter, current);
    }
    return Array.from(grouped.values()).sort((left, right) => left.keyCharacter.localeCompare(right.keyCharacter));
  }, [quickKeyMappings.data]);
  const quickKeySearchInput = useMemo(() => ({ ...posScope, query: quickKeyProductQuery, limit: 12 }), [posScope, quickKeyProductQuery]);
  const quickKeyProductSearch = trpc.pos.quickKeyProductSearch.useQuery(quickKeySearchInput, { enabled: Boolean(activeStore) && canEditQuickKeys && quickKeyDialogOpen && quickKeyProductQuery.trim().length > 0 });
  const canProcessInvoiceReturns = Boolean(user?.isSuperAdmin || activeBranchRole === "admin" || activeBranchRole === "cashier" || activeBranchRole === "supervisor");
  const canRecordCashOut = Boolean(user?.isSuperAdmin || activeBranchRole === "admin" || activeBranchRole === "supervisor");
  const shiftSummary = trpc.pos.dailyShiftSummary.useQuery(posScope, { enabled: Boolean(activeStore) && (activeBranchRole === "supervisor" || activeBranchRole === "admin" || Boolean(user?.isSuperAdmin)) });
  const customerMatches = trpc.enterprise.customers.search.useQuery({ query: customerSearch, limit: 8 }, { enabled: Boolean(customerSearch.trim()) });
  const quickKeyProducts = trpc.pos.quickKeyProducts.useQuery(posScope, { enabled: Boolean(activeStore) });
  const [showAllQuickKeyProducts, setShowAllQuickKeyProducts] = useState(false);
  const visibleQuickKeyProducts = showAllQuickKeyProducts ? (quickKeyProducts.data ?? []) : (quickKeyProducts.data ?? []).slice(0, 5);
  const canAdjustStock = activeBranchRole === "cashier";
  const [stockAdjustmentProduct, setStockAdjustmentProduct] = useState<{ id: number; name: string; quantityOnHand: number } | null>(null);
  const [stockAdjustmentQuantity, setStockAdjustmentQuantity] = useState("");
  const adjustQuantity = trpc.inventory.adjustQuantity.useMutation({
    onSuccess: () => { toast.success("Stock quantity updated."); setStockAdjustmentProduct(null); setStockAdjustmentQuantity(""); void quickKeyProducts.refetch(); },
    onError: error => toast.error(error.message),
  });

  const normalizedQuickKeyCharacter = quickKeyCharacter.trim().toUpperCase();
  const quickKeyCharacterInvalid = Boolean(normalizedQuickKeyCharacter) && !/^[A-Z0-9]$/.test(normalizedQuickKeyCharacter);
  const quickKeyCharacterConflict = Boolean(normalizedQuickKeyCharacter) && activeQuickKeys.some(mapping => mapping.keyCharacter === normalizedQuickKeyCharacter && mapping.keyCharacter !== quickKeyOriginalCharacter);
  const openQuickKeyDialog = (mapping?: { keyCharacter: string; productId: number; productName: string; sku: string | null; barcodes: string[] }) => {
    setQuickKeyOriginalCharacter(mapping?.keyCharacter ?? null);
    setQuickKeyCharacter(mapping?.keyCharacter ?? "");
    setQuickKeyProductQuery(mapping?.productName ?? "");
    setQuickKeySelectedProduct(mapping ? { id: mapping.productId, name: mapping.productName, sku: mapping.sku, barcodes: mapping.barcodes } : null);
    setQuickKeyDialogOpen(true);
  };
  const saveQuickKey = async () => {
    if (!normalizedQuickKeyCharacter || quickKeyCharacterInvalid) return toast.error("Use one letter (A–Z) or number (0–9) for a Quick Key.");
    if (quickKeyCharacterConflict) return toast.error(`Quick Key ${normalizedQuickKeyCharacter} is already in use.`);
    if (!quickKeySelectedProduct) return toast.error("Search for and select a product before saving.");
    try {
      await setQuickKeyMutation.mutateAsync({ ...posScope, keyCharacter: normalizedQuickKeyCharacter, productId: quickKeySelectedProduct.id });
      setQuickKeyDialogOpen(false);
      toast.success(`Quick Key ${normalizedQuickKeyCharacter} saved.`);
    } catch { /* The mutation handler shows the server validation message. */ }
  };
  const deleteQuickKey = (keyCharacter: string) => setQuickKeyMutation.mutate({ ...posScope, keyCharacter, productId: null });

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(getCustomerDraftStorageKey()) ?? "null") as { customerSearch?: string; customerId?: string; creditFirstName?: string; creditLastName?: string; creditPhone?: string; amountPaidNow?: string } | null;
      if (saved) {
        setCustomerSearch(saved.customerSearch ?? ""); setCustomerId(saved.customerId ?? ""); setCreditFirstName(saved.creditFirstName ?? ""); setCreditLastName(saved.creditLastName ?? ""); setCreditPhone(saved.creditPhone ?? ""); setAmountPaidNow(saved.amountPaidNow ?? "");
      }
    } catch { /* Ignore corrupt draft metadata. */ }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(getCustomerDraftStorageKey(), JSON.stringify({ customerSearch, customerId, creditFirstName, creditLastName, creditPhone, amountPaidNow }));
  }, [amountPaidNow, creditFirstName, creditLastName, creditPhone, customerId, customerSearch]);

  useEffect(() => {
    if (adminPreview && !previewStoreId && previewDashboard.data?.branches[0]) {
      setPreviewStoreId(String(previewDashboard.data.branches[0].id));
    }
  }, [adminPreview, previewDashboard.data?.branches, previewStoreId]);

  const addProductSafely = useCallback((product: CartProduct) => {
    const existing = activeCart.lines.find(line => line.productId === product.id);
    if (product.quantityOnHand <= 0 || (existing && existing.quantity >= product.quantityOnHand)) {
      toast.error(t("common.insufficientStock"));
      return false;
    }
    addProduct(product);
    return true;
  }, [activeCart.lines, addProduct]);

  const activateQuickKey = useCallback((mapping: QuickKeyMappingRow) => {
    if (addProductSafely({ id: mapping.productId, name: mapping.productName, quantityOnHand: mapping.quantityOnHand, retailPrice: mapping.retailPrice, barcode: mapping.barcodes[0] ?? "" })) {
      toast.success(`${mapping.productName} added.`, { duration: 900 });
    }
  }, [addProductSafely]);

  const setQuantitySafely = useCallback((productId: number, quantity: number) => {
    const line = activeCart.lines.find(item => item.productId === productId);
    if (line?.maxStock !== undefined && quantity > line.maxStock) {
      toast.error(t("common.insufficientStock"));
      return;
    }
    setQuantity(productId, quantity);
  }, [activeCart.lines, setQuantity]);

  const addByBarcode = useCallback(async (barcode: string, silenceMissingBarcode = false) => {
    try {
      const product = await utils.pos.lookupBarcode.fetch({ barcode, ...posScope });
      if (addProductSafely(product as CartProduct)) toast.success(`${product.name} added to ${activeCart.label}.`, { duration: 1200 });
      return true;
    } catch (error) {
      const message = getPosBarcodeErrorMessage(error);
      if (!silenceMissingBarcode || !/not registered|product not found/i.test(message)) toast.error(message);
      return false;
    }
  }, [activeCart.label, addProductSafely, posScope, utils.pos.lookupBarcode]);

  const addByReference = useCallback(async (reference: string) => {
    try {
      const product = await utils.pos.lookupReference.fetch({ reference, ...posScope });
      if (addProductSafely(product as CartProduct)) toast.success(`${product.name} added to ${activeCart.label}.`, { duration: 1200 });
      return true;
    } catch (error) {
      toast.error(t(getPosReferenceErrorMessage(error)));
      return false;
    }
  }, [activeCart.label, addProductSafely, posScope, utils.pos.lookupReference]);

  const focusBarcodeInput = useCallback(() => {
    window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
  }, []);

  const handleScannerRead = useCallback((barcode: string) => {
    setManualBarcode("");
    void addByBarcode(barcode).finally(focusBarcodeInput);
  }, [addByBarcode, focusBarcodeInput]);

  useBarcodeScanner(handleScannerRead, Boolean(activeStore) && !showReturns);

  useEffect(() => {
    const barcode = manualBarcode.trim();
    if (!activeStore || !isAutomaticBarcodeCandidate(barcode)) return;
    const timer = window.setTimeout(() => {
      setManualBarcode("");
      void addByBarcode(barcode, true).then(found => {
        if (found) return focusBarcodeInput();
        setManualBarcode(barcode);
        window.setTimeout(() => {
          barcodeInputRef.current?.focus();
          barcodeInputRef.current?.select();
        }, 0);
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [activeStore, addByBarcode, focusBarcodeInput, manualBarcode]);

  useEffect(() => {
    if (activeStore && !showReturns) focusBarcodeInput();
  }, [activeStore, focusBarcodeInput, showReturns]);

  const checkout = trpc.pos.checkout.useMutation({
    onSuccess: receipt => {
      if (printAfterCheckoutRef.current) {
        setLastReceipt({ ...receipt, storeName: activeStore?.name ?? "Selected branch", cashierName: user?.name ?? "Cashier", createdAt: new Date().toISOString() });
        setShowReceipt(true);
      }
      completeActive();
      toast.success(`Payment complete · ${receipt.receiptNumber}`);
    },
    onError: error => toast.error(error.message || "Checkout could not be completed."),
  });

  const totals = useMemo(() => activeCart.lines.reduce((summary, line) => ({
    subtotal: summary.subtotal + line.unitPrice * line.quantity,
    discounts: summary.discounts + line.unitDiscount * line.quantity,
    total: summary.total + (line.unitPrice - line.unitDiscount) * line.quantity,
  }), { subtotal: 0, discounts: 0, total: 0 }), [activeCart.lines]);

  const submitBarcode = (event: FormEvent) => {
    event.preventDefault();
    const value = manualBarcode.trim();
    if (!value) return;
    setManualBarcode("");
    if (isAutomaticBarcodeCandidate(value)) {
      void addByBarcode(value, true).then(found => {
        if (found) return focusBarcodeInput();
        void addByReference(value).finally(focusBarcodeInput);
      });
      return;
    }
    void addByReference(value).finally(focusBarcodeInput);
  };

  const beginNewCart = () => {
    if (!createCart()) toast.error("The queue already has five active carts. Complete or clear one before opening another.");
  };

  const pay = ({ printAfterSuccess = true }: { printAfterSuccess?: boolean } = {}) => {
    if (activeCart.lines.length === 0) return toast.error("Scan at least one item before checking out.");
    if (activeCart.lines.some(line => line.isCustom && line.unitPrice <= 0)) return toast.error("Enter a price for every custom service item before checkout.");
    if (paymentMethod === "credit" && !customerId && (!creditFirstName.trim() || !creditLastName.trim() || !creditPhone.trim())) return toast.error("Select a customer or enter first name, last name, and phone.");
    const paidNow = paymentMethod === "credit" ? Number(amountPaidNow || 0) : totals.total;
    if (!Number.isFinite(paidNow) || paidNow < 0 || paidNow > totals.total) return toast.error("Amount paid now must be between 0 and the invoice total.");
    printAfterCheckoutRef.current = printAfterSuccess;
    setPaymentModalOpen(false);
    checkout.mutate({ paymentMethod, amountPaidNow: paidNow, ...posScope, ...(customerId ? { customerId: Number(customerId) } : {}), ...(paymentMethod === "credit" && !customerId ? { creditCustomer: { firstName: creditFirstName, lastName: creditLastName, phone: creditPhone } } : {}), items: activeCart.lines.map(line => line.isCustom ? ({ customName: line.productName, customAmount: line.unitPrice, quantity: line.quantity, unitDiscount: line.unitDiscount }) : ({ productId: line.productId, quantity: line.quantity, unitDiscount: line.unitDiscount })) });
  };

  const submitCustomAmount = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(customAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a custom amount greater than 0 DZD.");
    addCustom(amount);
    setCustomAmount("");
    toast.success("Miscellaneous item added to the cart.", { duration: 1200 });
  };

  const addBlankCustomService = () => {
    addCustomBlank();
    window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-pos-custom-price=\"true\"]:last-of-type")?.focus(), 0);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable=\"true\"]");
      if (event.key === "F4") {
        if (isTyping || event.repeat) return;
        event.preventDefault();
        pay({ printAfterSuccess: false });
        return;
      }
      if (event.key === "F5") {
        if (isTyping || event.repeat) return;
        event.preventDefault();
        pay({ printAfterSuccess: true });
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        const quantityInput = document.querySelector<HTMLInputElement>("[data-pos-quantity=\"true\"]:last-of-type");
        quantityInput?.focus();
        quantityInput?.select();
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        toggleHold(activeCart.id);
        return;
      }
      if (isTyping || event.repeat || event.key.length !== 1) return;
      const quickKey = event.key.toUpperCase();
      const mapping = activeQuickKeys.find(item => item.keyCharacter === quickKey);
      if (mapping) {
        event.preventDefault();
        activateQuickKey(mapping);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCart.id, activateQuickKey, activeQuickKeys, pay, toggleHold]);

  if (workspace.isLoading || (adminPreview && previewDashboard.isLoading)) return <Skeleton className="h-[72vh] rounded-[1.5rem]" />;
  if (!activeStore) return <div className="mx-auto flex min-h-[62vh] max-w-xl items-center"><Card className="w-full border-0 bg-card dark:bg-gray-800 shadow-[0_20px_55px_-32px_rgba(18,36,30,.35)]"><CardHeader><CardTitle className="font-display text-2xl">{adminPreview ? t("pos.selectBranch") : "Your branch workspace is unavailable"}</CardTitle></CardHeader><CardContent>{adminPreview ? <><p className="mb-5 text-sm leading-6 text-muted-foreground">{t("pos.selectBranchDetail")}</p><Select value={previewStoreId} onValueChange={setPreviewStoreId}><SelectTrigger><SelectValue placeholder={t("dashboard.branch")} /></SelectTrigger><SelectContent>{previewDashboard.data?.branches.map(store => <SelectItem key={store.id} value={String(store.id)}>{store.name}</SelectItem>)}</SelectContent></Select></> : <p className="text-sm text-muted-foreground">Ask an administrator to assign your cashier account to a branch.</p>}</CardContent></Card></div>;

  return <div className="pos-terminal mx-auto max-w-[1720px] space-y-4 pb-6">
    <header className="flex flex-col gap-4 rounded-[1.5rem] bg-[#12241e] px-5 py-4 text-white shadow-[0_16px_45px_-25px_rgba(18,36,30,.6)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#c7e661] text-foreground dark:text-white shadow-[0_8px_18px_-10px_rgba(199,230,97,.8)]"><ScanLine className="h-5 w-5" /></span><div><div className="flex items-center gap-2"><h1 className="font-display text-xl font-bold">{activeStore.name} POS</h1><Badge className="bg-card dark:bg-gray-800/10 text-white hover:bg-card dark:bg-gray-800/10">{adminPreview ? t("pos.preview") : t("pos.terminal")}</Badge></div><p className="mt-0.5 text-xs text-white/60">{t("pos.scanHint")}</p></div></div>
      <div className="flex items-center gap-2">{adminPreview && <Select value={previewStoreId} onValueChange={setPreviewStoreId}><SelectTrigger className="h-10 w-36 border-white/20 bg-white/10 text-xs text-white hover:bg-white/15"><SelectValue /></SelectTrigger><SelectContent>{previewDashboard.data?.branches.map(store => <SelectItem key={store.id} value={String(store.id)}>{store.name}</SelectItem>)}</SelectContent></Select>}<Button type="button" data-pos-credit-action="true" variant="outline" onClick={() => setLocation("/customers")} className="h-10 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><CreditCard className="me-2 h-4 w-4" /> {t("pos.credit")}</Button><Button variant="outline" onClick={() => setShowReturns(true)} className="h-10 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ArchiveRestore className="me-2 h-4 w-4" /> {canProcessInvoiceReturns ? t("pos.returns") : "Simple returns"}</Button><button onClick={() => setShowReturns(true)} className="hidden rounded-xl bg-white/10 px-3 py-2 text-start text-xs text-white/85 transition-colors hover:bg-white/20 lg:block"><span className="font-mono text-[#c7e661]">F4</span> {canProcessInvoiceReturns ? t("pos.processReturn") : "Direct return"}</button></div>
    </header>

    {canRecordCashOut && <div className="flex justify-end"><Button type="button" onClick={() => setCashOutOpen(true)} className="bg-rose-600 text-white hover:bg-rose-700"><CircleDollarSign className="me-2 h-4 w-4" /> {t("cashOut.action")}</Button></div>}
    <QuickKeyManagementCard mappings={activeQuickKeys} loading={quickKeyMappings.isLoading} canEdit={canEditQuickKeys} saving={setQuickKeyMutation.isPending} onAdd={() => openQuickKeyDialog()} onEdit={openQuickKeyDialog} onDelete={deleteQuickKey} onActivate={activateQuickKey} />

    {lastReceipt && <div className="flex flex-col gap-2 rounded-2xl border border-[#cce4c8] bg-muted dark:bg-gray-800 px-4 py-3 text-sm text-[#32683a] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span><strong>Payment complete.</strong> Receipt <span className="font-mono">{lastReceipt.receiptNumber}</span> · {currency.format(Number(lastReceipt.total))}</span></div><button className="text-xs font-semibold hover:underline" onClick={() => setLastReceipt(null)}>Dismiss</button></div>}
    {user?.role === "supervisor" && <Card className="border-[#d9e6d5] bg-[#f4f8ef]"><CardContent className="flex flex-wrap items-center gap-x-7 gap-y-2 p-4 text-sm"><span className="font-semibold text-foreground dark:text-gray-100">Today’s shift summary</span><span><strong className="font-mono text-foreground dark:text-gray-200">{shiftSummary.data?.transactionCount ?? 0}</strong> transactions</span><span><strong className="font-mono text-foreground dark:text-gray-200">{shiftSummary.data?.itemsSold ?? 0}</strong> items</span><span><strong className="font-mono text-foreground dark:text-gray-100">{currency.format(Number(shiftSummary.data?.salesTotal ?? 0))}</strong> sales</span></CardContent></Card>}

    <div className="grid gap-4 xl:min-h-[calc(100vh-210px)] xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="flex min-h-[620px] flex-col overflow-hidden rounded-[1.5rem] bg-card dark:bg-gray-800 shadow-[0_18px_48px_-28px_rgba(18,36,30,.35)]">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted dark:bg-gray-800 px-3 py-3">
          {carts.map(cart => <div key={cart.id} className="relative shrink-0"><button onClick={() => selectCart(cart.id)} className={`group flex min-w-[150px] items-center gap-2 rounded-xl border px-3 py-2.5 pe-8 text-start text-xs transition-all duration-200 ${cart.id === activeCartId ? "border-[#0f5c4d] bg-[#0f5c4d] text-white shadow-[0_10px_22px_-12px_rgba(15,92,77,.8)]" : cart.status === "held" ? "border-[#f0c98a] bg-[#fff8e8] text-[#8b5e20] hover:bg-[#fff1cf]" : "border-[#e1e9e4] bg-card dark:bg-gray-800 text-muted-foreground dark:text-gray-300 hover:border-[#b8d5c3] hover:bg-[#f3f9f5]"}`}><span className={`h-2.5 w-2.5 rounded-full ${cart.status === "held" ? "bg-[#e9a462]" : cart.id === activeCartId ? "bg-[#c7e661]" : "bg-[#8eaf92]"}`} /><span className="font-semibold">{cart.label}</span>{cart.lines.length > 0 && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${cart.id === activeCartId ? "bg-card dark:bg-gray-800/15" : cart.status === "held" ? "bg-[#fcedcf]" : "bg-[#edf3e9]"}`}>{cart.lines.length}</span>}{cart.status === "held" && <Pause className="ms-auto h-3.5 w-3.5" />}</button><button onClick={() => closeCart(cart.id)} className={`absolute top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors ${cart.id === activeCartId ? "text-white/60 hover:bg-card dark:bg-gray-800/15 hover:text-white" : "text-[#8b9f8d] hover:bg-[#e3ecdf] hover:text-foreground dark:text-gray-200"}`} style={{ insetInlineEnd: "0.375rem" }} aria-label={`Close ${cart.label}`}><X className="h-3 w-3" /></button></div>)}
          <button onClick={beginNewCart} disabled={carts.length >= 5} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#b9cbb8] text-muted-foreground dark:text-gray-300 transition-colors hover:border-[#52745a] hover:bg-[#edf3e9] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Open a new cart"><Plus className="h-4 w-4" /></button><span className="ms-auto shrink-0 text-[11px] text-muted-foreground">{carts.length}/5 open</span>
        </div>

        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-display text-lg font-bold text-foreground dark:text-white">{activeCart.label}</h2>{activeCart.status === "held" && <Badge className="bg-[#fff0dc] text-[#a86824] hover:bg-[#fff0dc]">{t("pos.hold")}</Badge>}</div><p className="mt-0.5 text-xs text-muted-foreground">{activeCart.lines.length ? `${activeCart.lines.length} item line${activeCart.lines.length === 1 ? "" : "s"}` : t("pos.ready")}</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => toggleHold(activeCart.id)} className="border-[#dbe5d8] bg-muted dark:bg-gray-800 text-foreground dark:text-gray-200"><Pause className="me-1.5 h-3.5 w-3.5" />{activeCart.status === "held" ? t("pos.resume") : t("pos.hold")}</Button><Button variant="ghost" size="sm" onClick={clearActive} disabled={!activeCart.lines.length} className="text-[#9b6254] hover:bg-[#fce8e1] hover:text-[#b85b43]"><Trash2 className="me-1.5 h-3.5 w-3.5" /> {t("pos.clear")}</Button></div></div>

        <div className="mx-4 mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_310px]"><form onSubmit={submitBarcode} className="flex rounded-xl border-2 border-[#b9e25e] bg-muted dark:bg-gray-800 p-1.5 shadow-[0_10px_22px_-14px_rgba(18,36,30,.35)]"><div className="flex flex-1 items-center gap-2 ps-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8f4c5] text-[#0f5c4d]"><Barcode className="h-5 w-5" /></span><Input ref={barcodeInputRef} value={manualBarcode} onChange={event => setManualBarcode(event.target.value)} placeholder={t("pos.scan")} aria-label={t("pos.scan")} className="h-12 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" autoComplete="off" autoFocus /></div><Button type="button" variant="outline" onClick={() => setCameraScannerOpen(true)} className="h-12 border-indigo-200 bg-indigo-50 px-3 text-indigo-700 shadow-sm hover:bg-indigo-100 hover:text-indigo-800" aria-label={t("pos.openCamera")} title={t("pos.openCamera")}><Camera className="h-5 w-5" /><span className="ms-2 hidden text-sm font-semibold sm:inline">{t("pos.camera")}</span></Button></form><form onSubmit={submitCustomAmount} className="flex rounded-xl border border-[#d8c5ed] bg-[#fbf8ff] p-1.5 shadow-[0_10px_22px_-14px_rgba(76,40,120,.22)]"><div className="min-w-0 flex-1 ps-2"><Label htmlFor="customAmount" className="sr-only">{t("pos.customAmount")}</Label><Input id="customAmount" value={customAmount} onChange={event => setCustomAmount(event.target.value)} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder={t("pos.customAmount")} className="h-12 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" /></div><Button type="submit" disabled={!customAmount || Number(customAmount) <= 0} className="h-12 bg-[#7149a8] px-4 text-white shadow-sm hover:bg-[#613f91]"><CircleDollarSign className="me-1.5 h-5 w-5" />{t("pos.add")}</Button></form></div><div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/50 p-2 dark:bg-gray-800/70"><span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Quick keys</span>{QUICK_KEY_CHARACTERS.map(key => <label key={key} className="flex items-center gap-1 text-xs text-foreground dark:text-gray-200"><kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono dark:bg-gray-700">{key}</kbd><Select value={quickKeyMapping[key] ? String(quickKeyMapping[key]) : "none"} onValueChange={value => setQuickKeyMutation.mutate({ ...posScope, keyCharacter: key, productId: value === "none" ? null : Number(value) })} disabled={!canEditQuickKeys || setQuickKeyMutation.isPending}><SelectTrigger className="h-7 w-28 bg-card text-[11px] dark:bg-gray-800"><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{quickKeyProducts.data?.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>)}</SelectContent></Select></label>)}<Button type="button" size="sm" variant="outline" onClick={addBlankCustomService} className="ms-auto"><kbd className="me-1 rounded border border-border px-1 font-mono">C+</kbd> Custom Service</Button></div><div className={`mx-4 mt-3 gap-2 ${showAllQuickKeyProducts ? "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" : "flex flex-nowrap items-stretch overflow-x-auto"}`}>{visibleQuickKeyProducts.map(product => { const indicator = stockIndicator(product.quantityOnHand); return <div key={product.id} className={`${showAllQuickKeyProducts ? "" : "min-w-[170px] shrink-0"} rounded-xl border border-border bg-card p-1.5 dark:bg-gray-800`}><button type="button" disabled={product.quantityOnHand <= 0} onClick={() => addProductSafely(product)} className={`w-full rounded-lg p-2 text-start transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-gray-700 ${indicator.card}`}><span className="block truncate text-xs font-semibold text-foreground dark:text-gray-100">{product.name}</span><span className={`mt-1 block text-[11px] font-bold ${indicator.className}`}>{product.quantityOnHand} {t("common.available")} · {t(indicator.key)}</span></button>{canAdjustStock && <Button type="button" variant="ghost" size="sm" onClick={() => { setStockAdjustmentProduct(product); setStockAdjustmentQuantity(String(product.quantityOnHand)); }} className="h-7 w-full text-[10px] text-muted-foreground">Adjust stock</Button>}</div>; })}{(quickKeyProducts.data?.length ?? 0) > 5 && <Button type="button" variant="outline" size="sm" onClick={() => setShowAllQuickKeyProducts(current => !current)} aria-expanded={showAllQuickKeyProducts} className="shrink-0 self-center whitespace-nowrap">{showAllQuickKeyProducts ? "Show Less / عرض أقل" : "Show More / عرض المزيد"}</Button>}</div>

        <div className="mt-4 min-h-0 flex-1 overflow-x-auto overflow-y-auto"><table className="retail-table w-full min-w-[720px] text-sm"><thead className="sticky top-0 z-10 border-y border-border bg-[#f7faf8] text-start text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground shadow-[0_2px_8px_-7px_rgba(18,36,30,.28)]"><tr><th className="px-4 py-3">{t("pos.item")}</th><th className="w-32 px-3 py-3 text-end">{t("pos.unitPrice")}</th><th className="w-36 px-3 py-3 text-center">{t("pos.quantity")}</th><th className="w-32 px-3 py-3 text-end">{t("pos.discount")}</th><th className="w-32 px-3 py-3 text-end">{t("pos.lineTotal")}</th><th className="w-10 px-3 py-3" /></tr></thead><tbody>{activeCart.lines.map(line => <tr key={line.productId} className="border-b border-border"><td className="px-4 py-3"><p className="font-semibold text-foreground dark:text-gray-100">{line.productName}</p><p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{line.isCustom ? "CUSTOM · non-inventory" : line.barcode}{!line.isCustom && line.maxStock !== undefined && <span className={`ms-2 font-sans font-bold ${stockIndicator(line.maxStock).className}`}>{line.maxStock} {t("common.available")}</span>}</p></td><td className="px-3 py-3 text-end font-mono text-muted-foreground dark:text-gray-300">{line.isCustom ? <Input aria-label={`Price for ${line.productName}`} data-pos-custom-price="true" type="number" min="0" step="0.01" value={line.unitPrice || ""} onChange={event => setUnitPrice(line.productId, Number(event.target.value))} className="h-8 w-28 text-end font-mono text-xs" /> : currency.format(line.unitPrice)}</td><td className="px-3 py-3"><div className="mx-auto flex w-[122px] items-center justify-between rounded-lg border border-[#dbe5d8] bg-card dark:bg-gray-800"><button onClick={() => setQuantitySafely(line.productId, line.quantity - 1)} className="p-1.5 text-muted-foreground dark:text-gray-300 hover:bg-[#edf3e9]" aria-label={`Decrease ${line.productName}`}><Minus className="h-3.5 w-3.5" /></button><Input aria-label={`Quantity for ${line.productName}`} data-pos-quantity="true" type="number" min="1" value={line.quantity} onChange={event => setQuantitySafely(line.productId, Number(event.target.value))} className="h-7 w-12 border-0 bg-transparent p-0 text-center font-mono text-xs shadow-none focus-visible:ring-0" /><button onClick={() => setQuantitySafely(line.productId, line.quantity + 1)} className="p-1.5 text-muted-foreground dark:text-gray-300 hover:bg-[#edf3e9]" aria-label={`Increase ${line.productName}`}><Plus className="h-3.5 w-3.5" /></button></div></td><td className="px-3 py-3"><div className="relative"><span className="absolute top-2 text-[10px] font-semibold text-muted-foreground" style={{ insetInlineStart: "0.5rem" }}>DZD</span><Input aria-label={`Discount for ${line.productName}`} type="number" min="0" max={line.unitPrice} step="0.01" value={line.unitDiscount || ""} onChange={event => setDiscount(line.productId, Number(event.target.value))} className="h-8 w-28 ps-10 text-end font-mono text-xs" /></div></td><td className="px-3 py-3 text-end font-mono font-semibold text-foreground dark:text-gray-100">{currency.format((line.unitPrice - line.unitDiscount) * line.quantity)}</td><td className="px-3 py-3"><button onClick={() => removeLine(line.productId)} className="rounded-md p-1.5 text-[#a96354] hover:bg-[#fce8e1]" aria-label={`Remove ${line.productName}`}><X className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
        {!activeCart.lines.length && <div className="flex min-h-[310px] flex-col items-center justify-center px-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3e9] text-[#749276]"><PackageSearch className="h-6 w-6" /></span><h3 className="mt-4 font-display text-lg font-bold text-foreground dark:text-gray-100">{t("pos.readyToScan")}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{t("pos.scanDetail")}</p></div>}
      </section>

      <aside className="space-y-4"><Card className="border-0 bg-[#f0f5ea] shadow-[0_18px_48px_-28px_rgba(18,36,30,.34)]"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 font-display text-lg"><CircleDollarSign className="h-5 w-5 text-muted-foreground dark:text-gray-300" /> {t("pos.payment")}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="space-y-2 rounded-xl bg-card dark:bg-gray-800/70 p-3 text-sm"><TotalRow label={t("pos.subtotal")} amount={totals.subtotal} /><TotalRow label={t("pos.discounts")} amount={-totals.discounts} className="text-[#a86824]" /><div className="my-2 border-t border-[#d7e3d4]" /><TotalRow label={t("dashboard.total")} amount={totals.total} strong /></div>{!adminPreview && <div><Label className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Recognize customer</Label><Input value={customerSearch} onChange={event => { setCustomerSearch(event.target.value); setCustomerId(""); }} placeholder="Search global customer" className="bg-card dark:bg-gray-800 text-sm" />{customerId && <p className="mt-1 text-xs font-semibold text-foreground dark:text-gray-200">Customer linked to this sale</p>}{customerSearch && !customerId && <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-[#d7e3d4] bg-card dark:bg-gray-800">{customerMatches.data?.map(customer => <button key={customer.id} type="button" onClick={() => { setCustomerId(String(customer.id)); setCustomerSearch(`${customer.name} · ${customer.phone}`); }} className="block w-full border-b border-[#edf1eb] px-2 py-1.5 text-start text-xs hover:bg-[#f4f8ef]"><strong>{customer.name}</strong> · {customer.phone}</button>)}</div>}</div>}<div><Label className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">{t("pos.paymentMethod")}</Label><Select value={paymentMethod} onValueChange={value => setPaymentMethod(value as typeof paymentMethod)}><SelectTrigger className="bg-card dark:bg-gray-800"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash"><span className="flex items-center gap-2"><Banknote className="h-3.5 w-3.5" /> {t("pos.cash")}</span></SelectItem><SelectItem value="card"><span className="flex items-center gap-2"><CreditCard className="h-3.5 w-3.5" /> {t("pos.card")}</span></SelectItem><SelectItem value="mobile">{t("pos.mobile")}</SelectItem><SelectItem value="credit">Credit</SelectItem><SelectItem value="other">{t("pos.other")}</SelectItem></SelectContent></Select></div><Button onClick={() => setPaymentModalOpen(true)} disabled={checkout.isPending || !activeCart.lines.length} className="h-16 w-full bg-[#12241e] text-base font-bold text-white shadow-[0_12px_24px_-14px_rgba(18,36,30,.65)] hover:bg-[#213c31]">{checkout.isPending ? <><Loader2 className="me-2 h-5 w-5 animate-spin" /> Finalizing…</> : <><ReceiptText className="me-2 h-5 w-5" /> {t("pos.checkout")} · {currency.format(totals.total)}</>}</Button><p className="text-center text-[11px] leading-4 text-muted-foreground">Checkout records a receipt and deducts stock from <strong>{activeStore.name}</strong> in one transaction.</p></CardContent></Card>
        <Card className="border-[#e1e8dc] bg-card dark:bg-gray-800"><CardContent className="flex gap-3 p-4"><ShoppingCart className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground dark:text-gray-300" /><p className="text-xs leading-5 text-muted-foreground"><strong className="text-foreground dark:text-gray-100">{adminPreview ? t("pos.previewScope") : t("pos.queue")}</strong> {adminPreview ? `All scanner, sale, and return actions are scoped to ${activeStore.name}.` : "Hold the current tab while you help another customer, then select the held cart to resume it exactly where you left off."}</p></CardContent></Card>
      </aside>
    </div>
    {showReturns && <ReturnDeskPanel onClose={() => setShowReturns(false)} previewStoreId={adminPreview ? Number(previewStoreId) : undefined} allowInvoiceReturns={canProcessInvoiceReturns} />}
    <Dialog open={Boolean(stockAdjustmentProduct)} onOpenChange={open => { if (!open) { setStockAdjustmentProduct(null); setStockAdjustmentQuantity(""); } }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Adjust stock quantity</DialogTitle><DialogDescription>Update quantity only for {stockAdjustmentProduct?.name ?? "this product"}. Product details and prices cannot be changed here.</DialogDescription></DialogHeader><div className="space-y-3"><Label htmlFor="stock-adjustment-quantity">Quantity on hand</Label><Input id="stock-adjustment-quantity" type="number" min="0" max="1000000" step="1" value={stockAdjustmentQuantity} onChange={event => setStockAdjustmentQuantity(event.target.value)} /><Button type="button" className="w-full" disabled={!stockAdjustmentProduct || adjustQuantity.isPending || !/^\d+$/.test(stockAdjustmentQuantity)} onClick={() => stockAdjustmentProduct && adjustQuantity.mutate({ productId: stockAdjustmentProduct.id, stockQuantity: Number(stockAdjustmentQuantity) })}>{adjustQuantity.isPending ? "Saving…" : "Save quantity"}</Button></div></DialogContent></Dialog>
    <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Confirm checkout</DialogTitle><DialogDescription>Review the total and press F4 again or confirm payment to finalize this sale.</DialogDescription></DialogHeader><div className="space-y-4"><div className="rounded-xl bg-muted p-4 text-center dark:bg-gray-800"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p><p className="mt-1 font-mono text-3xl font-bold text-foreground dark:text-white">{currency.format(totals.total)}</p></div>{paymentMethod === "credit" && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40"><p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Customer Credit</p>{customerId ? <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"><span>Selected customer: {customerSearch}</span><Button type="button" variant="ghost" size="sm" onClick={() => { setCustomerId(""); setCustomerSearch(""); }}>Change</Button></div> : <div className="space-y-2"><div><Label className="text-amber-900 dark:text-amber-100">Existing customer</Label><Input value={customerSearch} onChange={event => { setCustomerSearch(event.target.value); setCustomerId(""); }} placeholder="Search name or phone" className="mt-1 bg-card dark:bg-gray-800" autoComplete="off" />{customerSearch && <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-amber-200 bg-card dark:bg-gray-800">{customerMatches.data?.map(customer => <button key={customer.id} type="button" onClick={() => { setCustomerId(String(customer.id)); setCustomerSearch(`${customer.name} · ${customer.phone}`); }} className="block w-full border-b border-border px-2 py-1.5 text-start text-xs last:border-b-0 hover:bg-amber-50 dark:hover:bg-amber-900/30"><strong>{customer.name}</strong> · {customer.phone}</button>)}{!customerMatches.data?.length && <p className="px-2 py-2 text-xs text-muted-foreground">No registered customer found. Add a new customer below.</p>}</div>}</div><p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Or add a new customer</p><div className="grid gap-2 sm:grid-cols-2"><Input placeholder="First name" value={creditFirstName} onChange={event => setCreditFirstName(event.target.value)} /><Input placeholder="Last name" value={creditLastName} onChange={event => setCreditLastName(event.target.value)} /><Input className="sm:col-span-2" placeholder="Phone number" value={creditPhone} onChange={event => setCreditPhone(event.target.value)} /></div></div>}<Label className="text-amber-900 dark:text-amber-100">Amount Paid Now</Label><Input type="number" min="0" max={totals.total} step="0.01" value={amountPaidNow} onChange={event => setAmountPaidNow(event.target.value)} placeholder="0.00 DZD" /><p className="text-sm font-bold text-amber-900 dark:text-amber-100">Invoice Debt: {currency.format(Math.max(0, totals.total - Number(amountPaidNow || 0)))}</p></div>}<Button onClick={pay} disabled={checkout.isPending || !activeCart.lines.length} className="h-12 w-full"><CheckCircle2 className="me-2 h-4 w-4" /> {checkout.isPending ? "Finalizing…" : "Confirm payment · F4"}</Button></div></DialogContent></Dialog>
    <Dialog open={quickKeyDialogOpen} onOpenChange={setQuickKeyDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{quickKeyOriginalCharacter ? `Edit Quick Key ${quickKeyOriginalCharacter}` : "Add New Shortcut"}</DialogTitle><DialogDescription>{quickKeyOriginalCharacter ? "Choose the product that should respond to this active keyboard shortcut." : "Assign one available letter or number to a product in this branch."}</DialogDescription></DialogHeader><div className="space-y-5"><div><Label htmlFor="quick-key-character" className="mb-1.5 block">Shortcut character</Label><Input id="quick-key-character" value={quickKeyCharacter} onChange={event => setQuickKeyCharacter(event.target.value.toUpperCase().slice(0, 1))} disabled={Boolean(quickKeyOriginalCharacter)} placeholder="A–Z or 0–9" className="max-w-40 font-mono uppercase" aria-invalid={quickKeyCharacterInvalid || quickKeyCharacterConflict} />{quickKeyCharacterInvalid && <p className="mt-1.5 text-xs font-medium text-destructive">Use exactly one letter (A–Z) or number (0–9).</p>}{quickKeyCharacterConflict && <p className="mt-1.5 text-xs font-medium text-destructive">This character already has an active shortcut.</p>}{quickKeyOriginalCharacter && <p className="mt-1.5 text-xs text-muted-foreground">To use another character, delete this mapping and create a new one.</p>}</div><div><Label htmlFor="quick-key-product-search" className="mb-1.5 block">Find product by name or barcode</Label><div className="relative"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="quick-key-product-search" value={quickKeyProductQuery} onChange={event => { setQuickKeyProductQuery(event.target.value); setQuickKeySelectedProduct(null); }} placeholder="Type product name or scan/type barcode" className="ps-9" autoComplete="off" /></div><div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-sm dark:bg-slate-900">{quickKeyProductQuery.trim() ? quickKeyProductSearch.isFetching ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching products…</div> : quickKeyProductSearch.data?.length ? quickKeyProductSearch.data.map(product => <button key={product.id} type="button" onClick={() => { setQuickKeySelectedProduct(product); setQuickKeyProductQuery(product.name); }} className={`block w-full border-b border-border px-3 py-2.5 text-start transition-colors last:border-b-0 hover:bg-muted ${quickKeySelectedProduct?.id === product.id ? "bg-primary/10" : ""}`}><span className="block text-sm font-semibold text-foreground dark:text-white">{product.name}</span><span className="mt-0.5 block font-mono text-xs text-muted-foreground">{product.sku ? `SKU: ${product.sku}` : "No SKU"}{product.barcodes.length ? ` · ${product.barcodes.join(", ")}` : ""}</span></button>) : <p className="px-3 py-3 text-sm text-muted-foreground">No matching products in this branch.</p> : <p className="px-3 py-3 text-sm text-muted-foreground">Start typing a product name or barcode to search the live catalog.</p>}</div></div>{quickKeySelectedProduct && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-bold uppercase tracking-wide text-primary">Selected product</p><p className="mt-1 font-semibold text-foreground dark:text-white">{quickKeySelectedProduct.name}</p><p className="mt-0.5 font-mono text-xs text-muted-foreground">{quickKeySelectedProduct.sku ? `SKU: ${quickKeySelectedProduct.sku}` : "No SKU"}{quickKeySelectedProduct.barcodes.length ? ` · ${quickKeySelectedProduct.barcodes.join(", ")}` : ""}</p></div>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={() => setQuickKeyDialogOpen(false)}>Cancel</Button><Button type="button" onClick={saveQuickKey} disabled={setQuickKeyMutation.isPending || !quickKeySelectedProduct || !normalizedQuickKeyCharacter || quickKeyCharacterInvalid || quickKeyCharacterConflict}>{setQuickKeyMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Keyboard className="me-2 h-4 w-4" />}Save shortcut</Button></div></div></DialogContent></Dialog>
    {showReceipt && lastReceipt && <ThermalReceipt key={lastReceipt.receiptNumber} receipt={lastReceipt} onClose={() => setShowReceipt(false)} autoPrint />}
    {activeStore && <CashOutDialog open={cashOutOpen} onOpenChange={setCashOutOpen} branches={[{ id: activeStore.id, name: activeStore.name }]} initialStoreId={activeStore.id} />}
    <CameraBarcodeScanner open={cameraScannerOpen} onOpenChange={setCameraScannerOpen} continuous={continuousCameraScanning} onContinuousChange={setContinuousCameraScanning} title="Mobile POS scanner" description="Tap Start Camera to begin scanning product barcodes. Continuous mode keeps the camera ready for the next item." onDetected={handleScannerRead} />
  </div>;
}

function TotalRow({ label, amount, strong = false, className = "" }: { label: string; amount: number; strong?: boolean; className?: string }) { return <div className={`flex items-center justify-between ${strong ? "font-display text-xl font-bold text-foreground dark:text-white" : "text-muted-foreground"} ${className}`}><span>{label}</span><span className="font-mono">{currency.format(amount)}</span></div>; }

function QuickKeyManagementCard({ mappings, loading, canEdit, saving, onAdd, onEdit, onDelete, onActivate }: { mappings: QuickKeyMappingRow[]; loading: boolean; canEdit: boolean; saving: boolean; onAdd: () => void; onEdit: (mapping: QuickKeyMappingRow) => void; onDelete: (keyCharacter: string) => void; onActivate: (mapping: QuickKeyMappingRow) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visibleMappings = showAll ? mappings : mappings.slice(0, 5);

  return <Card className="border border-border bg-card shadow-[0_14px_35px_-28px_rgba(15,23,42,.45)] dark:bg-gray-800">
    <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div><CardTitle className="flex items-center gap-2 text-lg"><Keyboard className="h-5 w-5 text-primary" /> Quick Keys</CardTitle><p className="mt-1 text-sm text-muted-foreground">Active keyboard mappings for this branch. Only assigned shortcuts are shown.</p></div>
      {canEdit && <Button type="button" onClick={onAdd}><Plus className="me-2 h-4 w-4" />Add New Shortcut</Button>}
    </CardHeader>
    <CardContent className="p-3">
      {loading ? <div className="p-2"><Skeleton className="h-12 w-full" /></div> : mappings.length ? <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
        {visibleMappings.map(mapping => <div key={mapping.keyCharacter} role="button" tabIndex={mapping.quantityOnHand > 0 ? 0 : -1} onClick={() => mapping.quantityOnHand > 0 && onActivate(mapping)} onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && mapping.quantityOnHand > 0) { event.preventDefault(); onActivate(mapping); } }} aria-label={`Add ${mapping.productName} with Quick Key ${mapping.keyCharacter}`} className="flex min-w-[210px] shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-start transition-colors hover:bg-muted dark:bg-gray-900/40">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 font-mono text-sm font-bold text-primary ${mapping.quantityOnHand <= 0 ? "opacity-50" : ""}`}>{mapping.keyCharacter}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground dark:text-white">{mapping.productName}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{mapping.sku ? `SKU: ${mapping.sku}` : "No SKU"}{mapping.barcodes.length ? ` · ${mapping.barcodes.join(", ")}` : ""}</p></div>
          {canEdit && <div className="flex shrink-0 gap-1"><Button type="button" size="icon" variant="ghost" onClick={event => { event.stopPropagation(); onEdit(mapping); }} disabled={saving} aria-label={`Edit Quick Key ${mapping.keyCharacter}`} className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="ghost" onClick={event => { event.stopPropagation(); onDelete(mapping.keyCharacter); }} disabled={saving} aria-label={`Delete Quick Key ${mapping.keyCharacter}`} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></div>}
        </div>)}
        {mappings.length > 5 && <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(current => !current)} aria-expanded={showAll} className="shrink-0 whitespace-nowrap text-xs">{showAll ? "عرض أقل" : "Show More / عرض المزيد"}</Button>}
      </div> : <div className="px-2 py-5 text-center"><Keyboard className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 font-semibold text-foreground dark:text-white">No shortcuts configured</p><p className="mt-1 text-sm text-muted-foreground">Add only the keys your cashiers need; they sync immediately across devices.</p>{canEdit && <Button type="button" className="mt-4" onClick={onAdd}><Plus className="me-2 h-4 w-4" />Add New Shortcut</Button>}</div>}
    </CardContent>
  </Card>;
}

function ReturnDesk({ onClose, previewStoreId }: { onClose: () => void; previewStoreId?: number }) {
  const [search, setSearch] = useState("");
  const [submittedReceipt, setSubmittedReceipt] = useState("");
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const receiptInput = useMemo(() => ({ receiptNumber: submittedReceipt, ...(previewStoreId ? { previewStoreId } : {}) }), [previewStoreId, submittedReceipt]);
  const receipt = trpc.pos.findReceipt.useQuery(receiptInput, { enabled: Boolean(submittedReceipt), retry: false });
  const processReturn = trpc.pos.processReturn.useMutation({ onSuccess: result => { toast.success(`Return complete · ${currency.format(Number(result.totalRefund))} restored.`); onClose(); }, onError: error => toast.error(error.message || "Return could not be completed.") });
  const lines = receipt.data?.lines ?? [];
  const refundTotal = lines.reduce((total, line) => total + (quantities[line.id] ?? 0) * (Number(line.unitPrice) - Number(line.unitDiscount)), 0);
  const searchReceipt = (event: FormEvent) => { event.preventDefault(); if (!search.trim()) return; setQuantities({}); setSubmittedReceipt(search.trim()); };
  const submitReturn = () => { if (!receipt.data) return; const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([saleLineId, quantity]) => ({ saleLineId: Number(saleLineId), quantity })); if (!items.length) return toast.error("Choose at least one item to return."); processReturn.mutate({ saleId: receipt.data.sale.id, ...(previewStoreId ? { previewStoreId } : {}), reason: reason.trim() || undefined, items }); };
  return <div className="fixed inset-0 z-50 flex items-end bg-[#12241e]/40 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6"><Card className="max-h-[94vh] w-full max-w-3xl overflow-auto rounded-b-none border-0 bg-muted dark:bg-gray-800 shadow-2xl sm:rounded-[1.5rem]"><CardHeader className="flex flex-row items-start justify-between border-b border-border"><div><CardTitle className="flex items-center gap-2 font-display text-xl"><RotateCcw className="h-5 w-5 text-muted-foreground dark:text-gray-300" /> Return / refund</CardTitle><p className="mt-1 text-sm text-muted-foreground">Look up an original receipt from this branch to safely restore inventory.</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close returns"><X className="h-5 w-5" /></Button></CardHeader><CardContent className="space-y-4 p-5"><form onSubmit={searchReceipt} className="flex gap-2"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Receipt number, e.g. RCT-1-…" className="bg-card dark:bg-gray-800 font-mono" /><Button type="submit" className="bg-[#12241e] hover:bg-[#213c31]">{receipt.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find receipt"}</Button></form>{receipt.error && <p className="rounded-xl bg-[#fce8e1] p-3 text-sm text-[#a54d38]">{receipt.error.message}</p>}{receipt.data && <><div className="rounded-xl border border-[#dce7d8] bg-card dark:bg-gray-800 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong className="font-mono">{receipt.data.sale.receiptNumber}</strong> · {new Date(receipt.data.sale.createdAt).toLocaleString()}</span><Badge className="bg-[#e6f0cb] text-foreground dark:text-gray-200 hover:bg-[#e6f0cb]">{currency.format(Number(receipt.data.sale.total))}</Badge></div></div><div className="overflow-x-auto rounded-xl border border-border bg-card dark:bg-gray-800"><table className="w-full min-w-[610px] text-sm"><thead className="bg-[#f6f8f3] text-left text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground"><tr><th className="px-3 py-3">Item</th><th className="px-3 py-3">Bought</th><th className="px-3 py-3">Returnable</th><th className="px-3 py-3">Returning</th><th className="px-3 py-3 text-right">Refund</th></tr></thead><tbody>{lines.map(line => <tr key={line.id} className="border-t border-border"><td className="px-3 py-3 font-medium text-foreground dark:text-gray-100">{line.productName}</td><td className="px-3 py-3 font-mono">{line.quantity}</td><td className="px-3 py-3 font-mono text-muted-foreground dark:text-gray-300">{line.returnableQuantity}</td><td className="px-3 py-3"><Input aria-label={`Return quantity for ${line.productName}`} type="number" min="0" max={line.returnableQuantity} value={quantities[line.id] ?? ""} onChange={event => setQuantities(current => ({ ...current, [line.id]: Math.min(line.returnableQuantity, Math.max(0, Number(event.target.value) || 0)) }))} className="h-8 w-20 font-mono" disabled={line.returnableQuantity === 0} /></td><td className="px-3 py-3 text-right font-mono">{currency.format((quantities[line.id] ?? 0) * (Number(line.unitPrice) - Number(line.unitDiscount)))}</td></tr>)}</tbody></table></div><div><Label htmlFor="returnReason" className="mb-1.5 block text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Reason (optional)</Label><Input id="returnReason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Customer changed their mind" className="bg-card dark:bg-gray-800" /></div><div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="font-display text-lg font-bold text-foreground dark:text-white">Refund total <span className="font-mono">{currency.format(refundTotal)}</span></p><Button onClick={submitReturn} disabled={processReturn.isPending || refundTotal <= 0} className="bg-[#e8896a] text-white hover:bg-[#dc765a]">{processReturn.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</> : <><ArchiveRestore className="mr-2 h-4 w-4" /> Complete return</>}</Button></div></>}</CardContent></Card></div>;
}
