export type ThermalPrintMode = "receipt" | "labels";

const isolatedReceiptStyles = `
  @page { size: 80mm auto; margin: 0; }
  html, body { width: 80mm; min-width: 80mm; min-height: 1px; margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Courier New", Courier, monospace; font-size: 12px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-receipt { display: block; width: 80mm; max-width: 80mm; box-sizing: border-box; margin: 0 auto; padding: 4mm 3mm; background: #fff; color: #000; font-family: "Courier New", Courier, monospace; font-size: 12px; line-height: 1.5; box-shadow: none; }
  .print-receipt header { display: block; text-align: center; border-bottom: 1px dashed #000; padding: 0 0 3mm; margin: 0; }
  .print-receipt h2, .print-receipt p { margin: 0; }
  .print-receipt section { display: block; border-bottom: 1px dashed #000; padding: 3mm 0; margin: 0; }
  .print-receipt footer { display: block; padding-top: 3mm; margin: 0; }
  .print-receipt table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; line-height: 1.5; }
  .print-receipt thead { border-bottom: 1px dashed #000; text-align: left; font-size: 9px; text-transform: uppercase; }
  .print-receipt th, .print-receipt td { box-sizing: border-box; padding: 2mm 1mm; vertical-align: top; overflow-wrap: anywhere; }
  .print-receipt th:first-child, .print-receipt td:first-child { width: 56%; text-align: left; }
  .print-receipt th:nth-child(2), .print-receipt td:nth-child(2) { width: 14%; text-align: right; }
  .print-receipt th:nth-child(3), .print-receipt td:nth-child(3) { width: 30%; text-align: right; }
  .print-receipt tbody tr { border-bottom: 1px dotted #999; }
  .print-receipt footer > table { width: auto; margin-left: auto; text-align: right; }
  .print-receipt footer > table th, .print-receipt footer > table td { width: auto; padding: 0 0 1mm 5mm; text-align: right; }
  .print-receipt footer > div { border-top: 1px dashed #000; margin-top: 4mm; padding-top: 4mm; text-align: center; }
  .print-receipt svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
`;

/**
 * Prints only a receipt clone in an isolated iframe. The main application DOM and
 * global print CSS are never exposed to the mobile print engine.
 */
export function printIsolatedReceipt(receiptElement: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed; width:0; height:0; border:0; opacity:0; pointer-events:none; inset:0;";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument;
    if (!frameWindow || !frameDocument) {
      iframe.remove();
      reject(new Error("The receipt print frame could not be created."));
      return;
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      iframe.remove();
    };

    const runPrint = () => {
      try {
        frameWindow.addEventListener("afterprint", cleanup, { once: true });
        frameWindow.focus();
        frameWindow.print();
        window.setTimeout(cleanup, 2_500);
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    frameDocument.open();
    frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${isolatedReceiptStyles}</style></head><body>${receiptElement.outerHTML}</body></html>`);
    frameDocument.close();
    window.setTimeout(runPrint, 180);
  });
}

const isolatedLabelStyles = `
  @page { size: 50mm 30mm; margin: 0; }
  html, body { width: 50mm; min-width: 50mm; margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barcode-labels { width: 50mm; margin: 0; padding: 0; }
  .barcode-label { display: block; width: 50mm; height: 30mm; box-sizing: border-box; overflow: hidden; padding: 2mm 2.5mm 1.5mm; margin: 0; text-align: center; background: #fff; color: #000; page-break-after: always; break-after: page; }
  .barcode-label:last-child { page-break-after: auto; break-after: auto; }
  .barcode-label p { margin: 0; }
  .barcode-label-store { font-size: 8px; font-weight: 700; line-height: 1.2; }
  .barcode-label-product { min-height: 8px; margin-top: 1mm !important; overflow: hidden; font-size: 8px; font-weight: 700; line-height: 1.15; }
  .barcode-label-price { margin-top: .6mm !important; font-family: "Courier New", monospace; font-size: 9px; font-weight: 700; line-height: 1.1; }
  .barcode-label svg { display: block; max-width: 100%; height: 10mm; margin: .8mm auto .3mm; }
  .barcode-label-code { font-family: "Courier New", monospace; font-size: 7px; line-height: 1; letter-spacing: .45px; }
`;

/** Prints a pre-rendered run of 50 × 30 mm label articles in an isolated iframe. */
export function printIsolatedLabels(labelContainer: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed; width:0; height:0; border:0; opacity:0; pointer-events:none; inset:0;";
    document.body.appendChild(iframe);
    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument;
    if (!frameWindow || !frameDocument) {
      iframe.remove();
      reject(new Error("The label print frame could not be created."));
      return;
    }
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      iframe.remove();
    };
    const runPrint = () => {
      try {
        frameWindow.addEventListener("afterprint", cleanup, { once: true });
        frameWindow.focus();
        frameWindow.print();
        window.setTimeout(cleanup, 2_500);
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    frameDocument.open();
    frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${isolatedLabelStyles}</style></head><body>${labelContainer.outerHTML}</body></html>`);
    frameDocument.close();
    window.setTimeout(runPrint, 180);
  });
}

/** Retained for non-receipt label printing. */
export function printThermal(mode: ThermalPrintMode) {
  document.body.dataset.printMode = mode;
  const style = document.createElement("style");
  style.dataset.thermalPrint = "true";
  style.textContent = `@page { size: ${mode === "receipt" ? "80mm auto" : "58mm 32mm"}; margin: 0; }`;
  document.head.appendChild(style);
  const cleanup = () => {
    delete document.body.dataset.printMode;
    style.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 2_000);
}
