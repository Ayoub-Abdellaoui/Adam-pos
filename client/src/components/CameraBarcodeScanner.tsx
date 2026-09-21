import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, CheckCircle2, Loader2, Play, RefreshCw, ScanLine, ShieldAlert } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type CameraBarcodeScannerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (barcode: string) => void;
  continuous?: boolean;
  onContinuousChange?: (value: boolean) => void;
  title?: string;
  description?: string;
};

type ScannerStatus = "idle" | "starting" | "ready" | "success" | "error";

type CameraDiagnostic = {
  stage: "getUserMedia" | "video.play" | "barcode decoder";
  name: string;
  message: string;
};

export function toCameraDiagnostic(stage: CameraDiagnostic["stage"], error: unknown): CameraDiagnostic {
  const name = error instanceof Error && error.name ? error.name : "UnknownError";
  const message = error instanceof Error && error.message ? error.message : String(error);
  return { stage, name, message };
}

export function getCameraErrorMessage(error: unknown, translate?: (key: string) => string) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return translate?.("camera.denied") ?? "Camera access was denied. Allow camera access in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return translate?.("camera.noCamera") ?? "No compatible rear camera was found on this device.";
  return translate?.("camera.generic") ?? "We could not start the camera. Confirm a camera is connected and try again.";
}

function stopTracks(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach(track => {
    if (track.readyState !== "ended") track.stop();
  });
}

function logCameraPipelineError(stage: "getUserMedia" | "video.play", error: unknown) {
  const { name, message } = toCameraDiagnostic(stage, error);
  console.error(`[CameraBarcodeScanner] ${stage} failed`, { name, message });
}

export function requestCameraStream(timeoutMs = 10_000) {
  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Camera startup timed out before a media stream was returned."));
    }, timeoutMs);

    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } }).then(
      stream => {
        if (settled) {
          stopTracks(stream);
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(stream);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function waitForMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("The camera stream did not load video metadata before timeout."));
    }, 8_000);
    const onLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const onVideoError = () => {
      cleanup();
      reject(new Error("The camera stream did not load video metadata."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onVideoError);
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("error", onVideoError, { once: true });
  });
}

export async function attachAndPlayPreview(video: HTMLVideoElement, stream: MediaStream) {
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await waitForMetadata(video);
  await video.play();
}

export function releaseOwnedPreview(video: HTMLVideoElement | null, stream: MediaStream | null | undefined) {
  if (video && video.srcObject === stream) {
    video.pause();
    video.srcObject = null;
  }
  stopTracks(stream);
}

/**
 * Camera-only scanning has an explicit MediaDevices pipeline. It is deliberately
 * independent of the USB keyboard-wedge listener, which remains active in POS.
 */
export function CameraBarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  continuous = false,
  onContinuousChange,
  title,
  description,
}: CameraBarcodeScannerProps) {
  const { t } = useTranslation();
  const resolvedTitle = title || t("camera.title");
  const resolvedDescription = description || t("camera.description");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const controlsRef = useRef<{ stop: () => void } | undefined>(undefined);
  const isOpenRef = useRef(open);
  const isStartingRef = useRef(false);
  const continuousRef = useRef(continuous);
  const lastScan = useRef({ value: "", at: 0 });
  const detectedCallback = useRef(onDetected);
  const openChangeCallback = useRef(onOpenChange);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [error, setError] = useState<CameraDiagnostic | null>(null);

  useEffect(() => { detectedCallback.current = onDetected; }, [onDetected]);
  useEffect(() => { openChangeCallback.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = undefined;
    releaseOwnedPreview(videoRef.current, streamRef.current);
    streamRef.current = undefined;
    isStartingRef.current = false;
  }, []);

  useEffect(() => {
    isOpenRef.current = open;
    if (!open) {
      stopScanner();
      setStatus("idle");
      setError(null);
    }
  }, [open, stopScanner]);
  useEffect(() => () => stopScanner(), [stopScanner]);

  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video || isStartingRef.current || status === "ready") return;
    stopScanner();
    isStartingRef.current = true;
    setStatus("starting");
    setError(null);
    let stage: CameraDiagnostic["stage"] = "getUserMedia";

    try {
      const stream = await requestCameraStream();
      if (!isOpenRef.current || videoRef.current !== video) {
        stopTracks(stream);
        return;
      }
      streamRef.current = stream;
      stage = "video.play";
      await attachAndPlayPreview(video, stream);
      if (!isOpenRef.current || videoRef.current !== video) return;

      stage = "barcode decoder";
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 160, delayBetweenScanSuccess: 850 });
      controlsRef.current = await reader.decodeFromVideoElement(video, result => {
        if (!isOpenRef.current || !result) return;
        const value = result.getText().trim();
        if (!value) return;
        const now = Date.now();
        if (lastScan.current.value === value && now - lastScan.current.at < 1200) return;
        lastScan.current = { value, at: now };
        setStatus("success");
        if (navigator.vibrate) navigator.vibrate(35);
        detectedCallback.current(value);
        if (!continuousRef.current) {
          stopScanner();
          openChangeCallback.current(false);
        } else {
          window.setTimeout(() => isOpenRef.current && setStatus("ready"), 500);
        }
      });
      if (!isOpenRef.current) return stopScanner();
      setStatus("ready");
    } catch (cameraError) {
      const diagnostic = toCameraDiagnostic(stage, cameraError);
      if (stage === "getUserMedia" || stage === "video.play") logCameraPipelineError(stage, cameraError);
      console.error("[CameraBarcodeScanner] displayed mobile diagnostic", diagnostic);
      stopScanner();
      if (isOpenRef.current) {
        setStatus("error");
        setError(diagnostic);
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [status, stopScanner]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) stopScanner();
    onOpenChange(nextOpen);
  };

  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg overflow-hidden border-slate-200 bg-white p-0 shadow-2xl sm:w-full">
      <DialogHeader className="border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6"><DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-950"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Camera className="h-4 w-4" /></span>{resolvedTitle}</DialogTitle><DialogDescription className="pt-1 text-sm leading-5">{resolvedDescription}</DialogDescription></DialogHeader>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-950 shadow-inner"><video ref={videoRef} className="block h-full w-full object-cover" autoPlay muted playsInline /><div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-indigo-300/90 shadow-[0_0_0_999px_rgba(2,6,23,.26)]" /><div className="pointer-events-none absolute inset-x-[18%] top-1/2 h-px bg-indigo-300/90 shadow-[0_0_12px_rgba(165,180,252,.9)]" />
          {status === "idle" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/74 px-6 text-center text-white"><Camera className="h-9 w-9 text-indigo-300" /><p className="text-sm text-white/80">{t("camera.off")}</p><Button type="button" onClick={() => void startCamera()} className="h-12 bg-indigo-500 px-5 text-base font-bold text-white hover:bg-indigo-400"><Play className="me-2 h-5 w-5" /> {t("camera.start")}</Button></div>}
          {status === "starting" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/68 text-center text-white"><Loader2 className="h-7 w-7 animate-spin text-indigo-300" /><p className="text-sm font-medium">{t("camera.starting")}</p></div>}
          {status === "success" && <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/55"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-emerald-600 shadow-xl"><CheckCircle2 className="h-7 w-7" /></span></div>}
          {status === "error" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/92 px-5 text-center text-white"><ShieldAlert className="h-7 w-7 shrink-0 text-amber-300" /><p className="text-sm font-semibold">{t("camera.failed")}</p><div className="w-full max-w-sm rounded-xl border border-amber-300/35 bg-black/40 p-3 text-start font-mono text-xs leading-5 text-amber-100"><p><span className="text-amber-300">{t("camera.stage")}:</span> {error?.stage ?? t("camera.unknown")}</p><p><span className="text-amber-300">{t("camera.error")}:</span> {error?.name ?? t("camera.unknown")}</p><p className="break-words"><span className="text-amber-300">{t("camera.message")}:</span> {error?.message ?? t("camera.noMessage")}</p></div><p className="max-w-sm text-xs leading-5 text-white/70">{getCameraErrorMessage(error ? { name: error.name } : new Error("Unknown camera error"), t)}</p><Button type="button" onClick={() => void startCamera()} className="h-11 bg-white text-slate-900 hover:bg-slate-100"><RefreshCw className="me-2 h-4 w-4" /> {t("camera.again")}</Button></div>}
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-indigo-600" /><div><p className="text-sm font-semibold text-slate-900">{t("camera.active")}</p><p className="text-xs text-slate-500">{t("camera.usb")}</p></div></div>{onContinuousChange && <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 sm:border-s-0 sm:border-t-0 sm:ps-3 sm:pt-0"><label htmlFor="continuous-scanning" className="text-sm font-medium text-slate-700">{t("camera.continuous")}</label><Switch id="continuous-scanning" checked={continuous} onCheckedChange={onContinuousChange} /></div>}</div>
      </div>
    </DialogContent>
  </Dialog>;
}
