import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraBarcodeScanner, attachAndPlayPreview, getCameraErrorMessage, releaseOwnedPreview, requestCameraStream, toCameraDiagnostic, waitForMetadata } from "./CameraBarcodeScanner";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("camera barcode scanner permission feedback", () => {
  it("gives a clear recovery prompt when permission is denied", () => {
    expect(getCameraErrorMessage(new DOMException("Denied", "NotAllowedError"))).toContain("denied");
  });

  it("preserves the exact error name and message for mobile diagnostic display", () => {
    const cause = new DOMException("The camera is already in use.", "NotReadableError");
    expect(toCameraDiagnostic("getUserMedia", cause)).toEqual({
      stage: "getUserMedia",
      name: "NotReadableError",
      message: "The camera is already in use.",
    });
  });

  it("explains a missing camera and keeps a general fallback message", () => {
    expect(getCameraErrorMessage(new DOMException("Missing", "NotFoundError"))).toContain("rear camera");
    expect(getCameraErrorMessage(new Error("unexpected"))).toContain("could not start");
  });

  it("does not request media when an open scanner mounts before a user action", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const markup = renderToStaticMarkup(createElement(CameraBarcodeScanner, { open: true, onOpenChange: vi.fn(), onDetected: vi.fn() }));

    expect(markup).toBe("");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("routes the POS mobile scanner through the shared manual-start dialog", () => {
    const posSource = readFileSync(new URL("../pages/CashierPOS.tsx", import.meta.url), "utf8");

    expect(posSource).toContain('import { CameraBarcodeScanner } from "@/components/CameraBarcodeScanner"');
    expect(posSource).toContain("<CameraBarcodeScanner open={cameraScannerOpen}");
    expect(posSource).toContain("Tap Start Camera to begin scanning product barcodes.");
    expect(posSource).not.toContain("getUserMedia");
  });

  it("routes product entry and invoice barcode lists through the shared manual-start dialog", () => {
    const productSource = readFileSync(new URL("../pages/ProductManagement.tsx", import.meta.url), "utf8");
    const invoiceSource = readFileSync(new URL("../pages/InvoiceStaging.tsx", import.meta.url), "utf8");
    const returnsSource = readFileSync(new URL("./ReturnDesk.tsx", import.meta.url), "utf8");

    expect(productSource).toContain('import { CameraBarcodeScanner } from "@/components/CameraBarcodeScanner"');
    expect(productSource).toContain('title="Add product barcode via camera"');
    expect(productSource).toContain("onDetected={appendBarcode}");
    expect(productSource).not.toContain("getUserMedia");
    expect(invoiceSource).toContain("continuous={continuousCamera}");
    expect(invoiceSource).toContain("open={scannerOpen}");
    expect(invoiceSource).toContain("onDetected={barcode => { if (cameraRow !== null && stage?.items[cameraRow]) void appendBarcodeToLine(cameraRow, barcode); }}");
    expect(invoiceSource).not.toContain("getUserMedia");
    expect(returnsSource).toContain('title="Scan invoice barcode"');
    expect(returnsSource).toContain('title="Scan returned product"');
    expect(returnsSource).toContain("useBarcodeScanner");
    expect(returnsSource).not.toContain("getUserMedia");
  });

  it("assigns srcObject and waits for metadata before calling play", async () => {
    const listeners = new Map<string, EventListener>();
    const play = vi.fn().mockResolvedValue(undefined);
    const video = {
      readyState: 0,
      autoplay: false,
      playsInline: false,
      muted: false,
      srcObject: null,
      play,
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    const stream = {} as MediaStream;

    const pending = attachAndPlayPreview(video, stream);
    expect(video.srcObject).toBe(stream);
    expect(video.autoplay).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.muted).toBe(true);
    expect(play).not.toHaveBeenCalled();

    listeners.get("loadedmetadata")?.(new Event("loadedmetadata"));
    await pending;
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("clears only an effect-owned preview source while stopping its tracks", () => {
    const stop = vi.fn();
    const ownedStream = { getTracks: () => [{ readyState: "live", stop }] } as unknown as MediaStream;
    const otherStream = {} as MediaStream;
    const pause = vi.fn();
    const video = { srcObject: otherStream, pause } as unknown as HTMLVideoElement;

    releaseOwnedPreview(video, ownedStream);
    expect(pause).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(otherStream);
    expect(stop).toHaveBeenCalledTimes(1);

    video.srcObject = ownedStream;
    releaseOwnedPreview(video, ownedStream);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("rejects a metadata error instead of leaving the preview startup pending", async () => {
    const listeners = new Map<string, EventListener>();
    const video = {
      readyState: 0,
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;

    const pending = waitForMetadata(video);
    listeners.get("error")?.(new Event("error"));
    await expect(pending).rejects.toThrow("did not load video metadata");
  });

  it("propagates getUserMedia rejection so the scanner can leave the loading state", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("Device failure", "NotReadableError"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await expect(requestCameraStream(20)).rejects.toMatchObject({ name: "NotReadableError" });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: "environment" } } });
  });

  it("rejects a stalled getUserMedia request instead of keeping startup pending", async () => {
    vi.useFakeTimers();
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const pending = requestCameraStream(25);
    const expectation = expect(pending).rejects.toThrow("startup timed out");
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });

  it("propagates video.play rejection after metadata is available", async () => {
    const listeners = new Map<string, EventListener>();
    const play = vi.fn().mockRejectedValue(new DOMException("Autoplay blocked", "NotAllowedError"));
    const video = {
      readyState: 0,
      autoplay: false,
      playsInline: false,
      muted: false,
      srcObject: null,
      play,
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;

    const pending = attachAndPlayPreview(video, {} as MediaStream);
    listeners.get("loadedmetadata")?.(new Event("loadedmetadata"));
    await expect(pending).rejects.toMatchObject({ name: "NotAllowedError" });
  });
});
