import { useEffect, useRef } from "react";

export const BARCODE_SCANNER_MAX_KEY_GAP_MS = 55;
export const BARCODE_SCANNER_IDLE_MS = 45;

export function isRapidBarcodeInput(gapMs: number) {
  return gapMs > 0 && gapMs <= BARCODE_SCANNER_MAX_KEY_GAP_MS;
}

/** Captures rapid keyboard-wedge scanner input globally; scanner Enter remains optional. */
export function useBarcodeScanner(onScan: (barcode: string) => void, enabled = true) {
  const callback = useRef(onScan);
  useEffect(() => { callback.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastKeyAt = 0;
    let rapidSequence = false;
    let idleTimer: number | undefined;
    const reset = () => {
      buffer = "";
      rapidSequence = false;
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = undefined;
    };
    const submitRapidSequence = () => {
      if (rapidSequence && buffer.length >= 3) callback.current(buffer);
      reset();
    };
    const scheduleRapidSubmit = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(submitRapidSequence, BARCODE_SCANNER_IDLE_MS);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const now = Date.now();
      const gap = now - lastKeyAt;
      if (gap > 80) reset();
      else if (buffer.length > 0 && isRapidBarcodeInput(gap)) rapidSequence = true;
      lastKeyAt = now;
      if (event.key === "Enter") {
        if (rapidSequence && buffer.length >= 3) {
          event.preventDefault();
          submitRapidSequence();
        }
        reset();
        return;
      }
      if (event.key.length === 1) {
        buffer += event.key;
        if (rapidSequence) scheduleRapidSubmit();
      }
      else if (event.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      reset();
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [enabled]);
}
