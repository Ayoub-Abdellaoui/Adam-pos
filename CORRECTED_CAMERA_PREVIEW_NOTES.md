# Corrected Camera Preview: Integration Notes

The component in `CORRECTED_CAMERA_PREVIEW.tsx` is an isolated reference implementation because no actual component body was included in the request. Mount it only while the scan dialog is open:

```tsx
<CorrectedCameraPreview
  enabled={isCameraDialogOpen}
  onError={(error) => console.error("camera-preview", error.name, error.message)}
/>
```

The caller must keep `onError` stable with `useCallback`, or omit it, to avoid a new effect run caused by a newly-created callback. The component does not stop any stream owned by another component; its cleanup stops only the stream created by the same effect invocation.

To patch an existing scanner rather than replace it, preserve these exact invariants: the `<video>` has `autoPlay`, `playsInline`, and `muted`; the resolved stream is assigned through `video.srcObject`; `video.play()` runs after `loadedmetadata`; cleanup stops only the effect-owned stream; and any callbacks or constraint objects in the effect dependency list are memoized or moved into refs.
