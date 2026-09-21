import { Button } from "@/components/ui/button";
import { formatDZD } from "@/lib/currency";
import { printIsolatedReceipt } from "@/lib/thermalPrint";
import Barcode from "react-barcode";
import { Printer, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type ReceiptData = {
  receiptNumber: string;
  invoiceNumber: string;
  storeName: string;
  cashierName: string;
  customerName?: string | null;
  createdAt: string;
  subtotal: string;
  discountTotal: string;
  total: string;
  lines: Array<{ productName: string; quantity: number; unitPrice: string; unitDiscount: string; lineTotal: string }>;
};

const money = (value: string) => formatDZD(value);
const nativePrintPaintDelayMs = 320;

export function ThermalReceipt({ receipt, onClose, autoPrint = false }: { receipt: ReceiptData; onClose: () => void; autoPrint?: boolean }) {
  const { t } = useTranslation();
  const receiptRef = useRef<HTMLElement>(null);
  const autoPrintTriggered = useRef(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printError, setPrintError] = useState("");

  const printReceipt = useCallback(async () => {
    if (!receiptRef.current || !receipt.invoiceNumber || receipt.lines.length === 0) {
      setPrintError(t("receipt.loading"));
      return;
    }
    setPrintError("");
    setIsPreparingPrint(true);
    try {
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
      await new Promise(resolve => window.setTimeout(resolve, nativePrintPaintDelayMs));
      const barcode = receiptRef.current.querySelector("svg");
      if (!barcode || barcode.querySelectorAll("rect").length === 0) {
        setPrintError(t("receipt.barcodeLoading"));
        return;
      }
      await printIsolatedReceipt(receiptRef.current);
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown print error.";
      setPrintError(`Unable to open the native print dialog. ${detail}`);
    } finally {
      setIsPreparingPrint(false);
    }
  }, [receipt.invoiceNumber, receipt.lines.length]);

  useEffect(() => {
    if (!autoPrint || autoPrintTriggered.current) return;
    autoPrintTriggered.current = true;
    const timer = window.setTimeout(() => { void printReceipt(); }, 80);
    return () => window.clearTimeout(timer);
  }, [autoPrint, printReceipt]);

  return <div className="fixed inset-0 z-[60] flex items-end bg-[#12241e]/45 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6">
    <div className="thermal-receipt-dialog max-h-[96vh] w-full max-w-[23rem] overflow-auto rounded-t-[1.5rem] bg-[#f4f4f0] p-4 shadow-2xl sm:rounded-[1.5rem]">
      <div className="print-controls mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-[#24382d]">{t("receipt.ready")}</p><div className="flex items-center gap-2"><Button onClick={() => void printReceipt()} disabled={isPreparingPrint} className="h-9 bg-[#12241e] text-white hover:bg-[#213c31]"><Printer className="mr-2 h-4 w-4" />{isPreparingPrint ? t("receipt.preparing") : t("receipt.print")}</Button><Button variant="ghost" size="icon" onClick={onClose} aria-label={t("receipt.close")}><X className="h-4 w-4" /></Button></div></div>
      {autoPrint && <p className="mb-3 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-800">{t("receipt.opening")}</p>}
      {printError && <p role="alert" className="mb-3 rounded-lg bg-[#fce8e1] p-2 text-xs text-[#a54d38]">{printError}</p>}
      <article ref={receiptRef} className="print-receipt mx-auto w-full max-w-[80mm] bg-white px-3 py-4 font-mono text-[12px] leading-[1.5] text-black shadow-sm">
        <header className="border-b border-dashed border-black pb-3 text-center"><h2 className="m-0 text-[15px] font-bold leading-6">{t("receipt.store")}</h2><p className="m-0 mt-2 text-[10px]">{new Date(receipt.createdAt).toLocaleString()}</p><p className="m-0 mt-2 text-[10px]">{t("receipt.receipt")}: {receipt.receiptNumber}</p><p className="m-0 text-[10px]">{t("receipt.cashier")}: {receipt.cashierName}</p>{receipt.customerName && <p className="m-0 text-[10px]">Customer: {receipt.customerName}</p>}</header>
        <section className="border-b border-dashed border-black py-3"><table className="w-full table-fixed border-collapse text-[10px] leading-[1.5]"><thead className="border-b border-dashed border-black text-left text-[9px] uppercase"><tr><th scope="col" className="w-[56%] pb-2 pe-2 font-bold">{t("receipt.item")}</th><th scope="col" className="w-[14%] pb-2 text-right font-bold">{t("receipt.quantity")}</th><th scope="col" className="w-[30%] pb-2 text-right font-bold">{t("receipt.amount")}</th></tr></thead><tbody>{receipt.lines.map((line, index) => <tr key={`${line.productName}-${index}`} className="border-b border-dotted border-[#999]"><td className="break-words py-2 pe-2 align-top"><strong className="block font-bold">{line.productName}</strong><span className="mt-1 block text-[9px]">{line.quantity} × {money(line.unitPrice)}{Number(line.unitDiscount) > 0 ? ` − ${money(line.unitDiscount)} ${t("receipt.discounts")}` : ""}</span></td><td className="py-2 text-right align-top">{line.quantity}</td><td className="py-2 text-right align-top font-semibold">{money(line.lineTotal)}</td></tr>)}</tbody></table></section>
        <footer className="pt-3"><table className="ms-auto w-auto border-collapse text-right"><tbody><tr><th scope="row" className="pe-5 pb-1 font-normal">{t("receipt.subtotal")}</th><td className="pb-1">{money(receipt.subtotal)}</td></tr>{Number(receipt.discountTotal) > 0 && <tr><th scope="row" className="pe-5 pb-1 font-normal">{t("receipt.discounts")}</th><td className="pb-1">-{money(receipt.discountTotal)}</td></tr>}<tr className="text-[13px]"><th scope="row" className="pe-5 pt-2 font-bold">{t("receipt.total")}</th><td className="pt-2 font-bold">{money(receipt.total)}</td></tr></tbody></table><div className="mt-4 border-t border-dashed border-black pt-4 text-center"><p className="m-0 mb-3 text-[9px] uppercase tracking-[.14em]">{t("receipt.barcode")}</p><Barcode value={receipt.invoiceNumber} format="CODE128" width={0.9} height={38} margin={2} displayValue={false} /><p className="m-0 mt-3 font-mono text-[10px] tracking-[.18em]">{receipt.invoiceNumber}</p><p className="m-0 mt-2 text-[9px]">{t("receipt.scanReturns")}</p><p className="m-0 mt-3 text-[9px]">{t("receipt.thanks")}</p></div></footer>
      </article>
    </div>
  </div>;
}
