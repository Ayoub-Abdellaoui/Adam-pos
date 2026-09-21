import { useEffect, useRef, useState } from "react";

type CameraPreviewProps = {
  /** Set true only while the camera dialog or scanner UI is visibly open. */
  enabled: boolean;
  onError?: (error: Error) => void;
};

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    if (track.readyState !== "ended") track.stop();
  });
}

/**
 * Isolated camera preview implementation.
 *
 * Important lifecycle rules:
 * 1. The effect depends only on the stable `enabled` flag.
 * 2. A cancelled effect never attaches or plays an obsolete stream.
 * 3. Tracks are stopped only by this effect's own cleanup.
 * 4. Playback starts only after `loadedmetadata` has fired.
 */
export function CorrectedCameraPreview({ enabled, onError }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "playing" | "error">("idle");

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;

    if (!video) return;

    async function startPreview() {
      try {
        setStatus("starting");

        // Keep constraints tolerant while diagnosing rendering. Do not use exact
        // facing mode or mandatory resolution values until preview is healthy.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        // The dialog may have closed while the permission/device request waited.
        if (cancelled || videoRef.current !== video) {
          stopStream(stream);
          return;
        }

        // Required: attach the MediaStream to the concrete mounted video node.
        video.srcObject = stream;

        // Required: defer playback until the stream's metadata is available.
        await new Promise<void>((resolve, reject) => {
          const onLoadedMetadata = () => {
            cleanup();
            resolve();
          };
          const onVideoError = () => {
            cleanup();
            reject(new Error("The camera stream could not load video metadata."));
          };
          const cleanup = () => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onVideoError);
          };

          video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
          video.addEventListener("error", onVideoError, { once: true });

          // Metadata can already be available on a rapid effect replay.
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onLoadedMetadata();
        });

        if (cancelled || videoRef.current !== video) return;

        // Required: catch playback failure rather than silently retaining a black frame.
        await video.play();

        if (!cancelled) setStatus("playing");
      } catch (cause) {
        if (cancelled) return;
        const error = cause instanceof Error ? cause : new Error("Camera preview failed to start.");
        setStatus("error");
        onError?.(error);
      }
    }

    void startPreview();

    return () => {
      // Cleanup belongs exclusively to the stream acquired by this effect run.
      cancelled = true;
      if (video.srcObject === stream) {
        video.pause();
        video.srcObject = null;
      }
      stopStream(stream);
    };
  }, [enabled, onError]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="block h-full w-full object-cover"
        aria-label="Live camera preview"
      />
      {status === "starting" && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm text-white">
          Starting camera…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 px-4 text-center text-sm text-white">
          Camera preview could not start. Inspect the captured error in the caller.
        </div>
      )}
    </div>
  );
}

