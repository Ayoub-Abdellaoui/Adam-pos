# Camera Preview Remains Blank or Black Despite Granted Permissions

**Audience:** Web application developers, platform engineers, and technical support engineers.  
**Scenario:** A custom-domain web application opens its camera user interface and renders the expected `<video>` frame, but the frame stays black or blank. Operating-system and browser camera permission are already confirmed as granted for the specific URL.  
**Scope:** This report analyzes the rendering failure path, not barcode decoding accuracy. A decoder can fail to recognize a barcode while the live preview is healthy; a black preview indicates the media stream, video-playback, embedding, or presentation path must be investigated first.

## Executive Assessment

A granted permission does **not** prove that a live `MediaStream` reached and started playing in the intended `<video>` element. `getUserMedia()` can be available only in a secure context, but a page may still show an empty frame when the stream is attached to the wrong or unmounted element, `video.play()` is blocked or rejected, a React lifecycle cleanup stops tracks prematurely, an embedded-frame policy prevents device use, or CSS obscures the rendered video. The WebRTC API returns a `MediaStream`; application code must still attach that stream to `video.srcObject` and ensure playback begins. [1]

For the stated symptom, the highest-probability failure class is **application-side video attachment or playback**, particularly on mobile Safari and in component frameworks where video elements are mounted and unmounted dynamically. If the application is embedded, **Permissions Policy and iframe delegation** become equally important. HTTPS should still be verified on the final custom-domain origin and every browsing context, but a genuine `getUserMedia()` success makes a simple HTTP-only root cause less likely.

| Diagnostic layer | Can permissions appear granted? | Can the frame remain black? | Priority for this scenario |
| --- | ---: | ---: | ---: |
| Secure context / TLS | Sometimes | Yes | High verification, lower likelihood if stream resolves |
| `<video>` playback state | Yes | Yes | **Highest** |
| `srcObject` / lifecycle handling | Yes | Yes | **Highest** |
| Iframe delegation / Permissions Policy | Yes, depending on which origin was checked | Yes | High when embedded |
| Camera device busy or invalid constraints | Yes | Yes | High |
| CSS overlay, zero sizing, visibility, or clipping | Yes | Yes | High |
| Barcode decoder failure | Yes | Usually no; feed should still display | Low for a black frame |

> **Key distinction:** Permission answers “may this origin request the device?” It does not answer “is the selected track live, attached to this `<video>`, playing inline, visible, and not subsequently stopped?”

## 1. Secure Context, HTTPS, and the Custom-Domain Boundary

`navigator.mediaDevices.getUserMedia()` is restricted to secure contexts. In an insecure context, `navigator.mediaDevices` may be unavailable altogether; attempted access can produce a `TypeError`. HTTPS, `localhost`, and certain local file contexts are treated as secure for this purpose. [1]

For a custom domain, verify the **actual final document origin**, not merely the URL configured in a hosting dashboard. A valid certificate must cover the host being loaded, redirects must terminate at `https://`, and the application must not run inside a non-secure parent document or a different preview host. Inspect the browser’s address bar, network waterfall, and console on the failing device.

```js
console.table({
  href: location.href,
  origin: location.origin,
  protocol: location.protocol,
  secureContext: window.isSecureContext,
  mediaDevicesExposed: Boolean(navigator.mediaDevices),
  getUserMediaExposed: typeof navigator.mediaDevices?.getUserMedia === "function",
  topLevel: window.top === window.self,
});
```

| Result | Interpretation | Action |
| --- | --- | --- |
| `secureContext: false` | The browser will not reliably expose or permit camera capture. | Fix TLS/redirect/CDN configuration before debugging React or decoder code. |
| `mediaDevicesExposed: false` | The page is not an acceptable media-device context or the browser has disabled access. | Confirm HTTPS on the final frame origin and inspect the browser policy. |
| `secureContext: true`, stream rejects | Focus on exception names and policies rather than video styling. | Log `error.name`, `error.message`, and requested constraints. |
| `secureContext: true`, stream resolves | Focus on tracks, `srcObject`, `play()`, lifecycle, iframe rules, and CSS. | Follow Sections 2–5. |

### Custom-Domain Issues That Can Be Missed

The following conditions merit explicit checks even after a browser permission indicator reports “allowed.” A CDN may serve the main application over HTTPS while an embedded legacy shell remains HTTP. A reverse proxy can also inject a restrictive `Permissions-Policy` header only on the custom domain, unlike a platform preview domain. Finally, testing via a browser’s in-app web view or a third-party portal can change the top-level origin and policy context without changing the apparent application URL.

## 2. HTML5 `<video>` Playback and Inline Rendering

The camera stream must be bound to the exact mounted video element. A visible container surrounding an unattached `<video>` is still simply a black rectangle. The browser does not infer a relationship between a `MediaStream` and a component frame.

The video element should explicitly declare `autoPlay`, `playsInline`, and `muted`. Muting avoids audible-media autoplay restrictions, while `playsinline` requests inline playback rather than a mobile browser’s native fullscreen player. Browsers commonly permit inaudible media to autoplay, and MDN specifically documents `playsinline` plus `muted` as part of the Safari-friendly autoplay pattern. [2] [3]

```tsx
<video
  ref={videoRef}
  autoPlay
  playsInline
  muted
  aria-label="Live camera preview"
  className="h-full w-full object-cover bg-black"
/>
```

Use the DOM properties as well, because component attributes do not remove the need to handle runtime playback failure:

```ts
async function attachStream(video: HTMLVideoElement, stream: MediaStream) {
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;

  await new Promise<void>((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return resolve();
    video.onloadedmetadata = () => resolve();
  });

  try {
    await video.play();
  } catch (error) {
    console.error("Camera preview playback was blocked", error);
    // Show a user-initiated “Start camera preview” action here.
  }
}
```

`HTMLMediaElement.play()` returns a promise. Its rejection is actionable evidence, not a harmless warning: it can report autoplay or playback denial even though device access was granted. [2]

### Playback-State Inspection

Run this after the scanner modal opens:

```js
const video = document.querySelector("video");
console.table({
  exists: Boolean(video),
  paused: video?.paused,
  readyState: video?.readyState,
  videoWidth: video?.videoWidth,
  videoHeight: video?.videoHeight,
  currentTime: video?.currentTime,
  hasSrcObject: Boolean(video?.srcObject),
});
```

| Observation | Likely cause | Remediation |
| --- | --- | --- |
| `hasSrcObject: false` | Stream was never assigned, was assigned to a stale element, or was cleared during cleanup. | Bind `video.srcObject = stream` after the ref is available. |
| `paused: true` | `play()` was not called or its promise rejected. | Call and catch `video.play()` after metadata loads; retain a user-initiated fallback. |
| `videoWidth` and `videoHeight` are `0` | Metadata never loaded, track has ended, playback did not begin, or the wrong element was inspected. | Log video events and track state; check lifecycle code. |
| Dimensions are non-zero but frame is black | CSS/overlay issue, device output problem, or a camera privacy shutter/OS pipeline issue. | Inspect computed style, z-index, and another direct camera test. |
| `currentTime` never advances | Video is not playing or stream has no flowing video. | Investigate `play()`, track state, and device ownership. |

## 3. Iframe, Permissions Policy, and Embedded-Application Constraints

If the custom-domain application is rendered inside an iframe, the top-level page and the iframe jointly govern camera use. Permissions Policy can be set through the `Permissions-Policy` HTTP header and refined on a particular iframe through its `allow` attribute. The effective policy is the most restrictive combination; a child frame cannot re-enable a feature disabled by its parent. [4]

For a same-origin application frame, a server policy such as the following is normally appropriate:

```http
Permissions-Policy: camera=(self)
```

For a cross-origin embedded app, the parent response must permit the child origin **and** the iframe must delegate the feature:

```http
Permissions-Policy: camera=(self "https://app.example.com")
```

```html
<iframe
  src="https://app.example.com/pos"
  allow="camera"
  sandbox="allow-scripts allow-same-origin">
</iframe>
```

The `sandbox` attribute is particularly important. A sandboxed iframe without `allow-same-origin` cannot call `getUserMedia()`. MDN further notes that only a valid top-level origin can request user media unless the top level explicitly grants the relevant iframe permission. [1]

> **Diagnostic rule:** Test the scanner by opening the exact custom-domain scanner route in a new top-level tab. If it works there but fails inside a portal, admin shell, preview pane, or embedded management UI, the defect is an embedding/delegation policy issue rather than a barcode library issue.

## 4. WebRTC / `getUserMedia()` Implementation Failure Modes

### 4.1 The stream succeeds but is not attached correctly

The canonical flow is: obtain a `MediaStream`, assign it to `video.srcObject`, wait for metadata, invoke `play()`, and retain the stream until the scanner is closed. [1] Common implementation bugs include assigning the stream to a state value rather than the DOM property, using `video.src` instead of `srcObject`, assigning before the React ref is non-null, or creating a new video element after attachment.

### 4.2 React lifecycle and cleanup races

This is a common cause of “permission granted, black video” in component applications. An effect can successfully start the camera, then its cleanup can immediately call `track.stop()` because a dependency changed, a modal rerendered, or development Strict Mode intentionally replayed the effect. A second start may target a detached or replaced `<video>`.

Validate lifecycle ordering with explicit logs:

```ts
useEffect(() => {
  let stream: MediaStream | undefined;
  let disposed = false;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    if (disposed || !videoRef.current) return;
    await attachStream(videoRef.current, stream);
    console.debug("camera-started", stream.getVideoTracks()[0]?.readyState);
  }

  void start();
  return () => {
    disposed = true;
    console.debug("camera-stopped");
    stream?.getTracks().forEach((track) => track.stop());
  };
}, [/* only stable, intentional dependencies */]);
```

Avoid including freshly created callback, constraints, or object-literal dependencies that cause an effect to restart on every render. In a scanner dialog, store callbacks in refs or memoize them so cart updates and scanner state updates do not reinitialize the live stream.

### 4.3 Track state, device contention, and constraints

Successful permission is compatible with a non-usable stream. Check every track:

```js
const stream = document.querySelector("video")?.srcObject;
const track = stream?.getVideoTracks?.()[0];
console.table({
  trackCount: stream?.getVideoTracks?.().length,
  readyState: track?.readyState,
  enabled: track?.enabled,
  muted: track?.muted,
  label: track?.label,
  settings: track?.getSettings?.(),
});
```

`NotReadableError` indicates that a device may have been granted but cannot currently be read, often because another browser tab, another application, an OS camera service, or a prior unclosed stream owns it. `OverconstrainedError` indicates that the requested camera constraints could not be met. `NotFoundError` indicates no matching track was found. [1]

Prefer tolerant constraints during initial diagnosis:

```js
{ video: true, audio: false }
```

Then add preferences, not mandatory requirements:

```js
{
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
}
```

Do not use `facingMode: { exact: "environment" }` until a compatible rear camera is confirmed. Mandatory `exact`, `min`, and `max` constraints can reject when no candidate matches. [1]

### 4.4 CSS and presentation defects

If the stream is live and `videoWidth` is non-zero, inspect computed styles. A preview may be technically playing behind a modal backdrop, at `opacity: 0`, constrained to zero height, clipped by `overflow: hidden`, transformed out of view, or visually covered by an absolutely positioned overlay with an opaque background. `object-fit: cover` is appropriate for a scanner frame, but it does not substitute for explicit non-zero dimensions.

Inspect these properties in DevTools: `display`, `visibility`, `opacity`, width, height, `position`, `z-index`, `background`, `transform`, `filter`, `clip-path`, and the modal’s stacking context. Disable overlays temporarily. Also ensure the video does not have a `poster` or background element masking the first real frame indefinitely.

## 5. Prioritized Investigation Sequence

| Order | Test | Expected healthy result | What a failure means |
| ---: | --- | --- | --- |
| 1 | Open exact scanner route as a top-level `https://` page | `isSecureContext === true`; no iframe | TLS/origin or embedding difference remains possible |
| 2 | Log `getUserMedia()` resolution and errors | A stream with one live video track | Device, policy, or constraints failure |
| 3 | Log `video.srcObject`, dimensions, `paused`, and `currentTime` | Stream attached; dimensions > 0; time advances | Attachment/playback/lifecycle bug |
| 4 | Call `await video.play()` and log rejection | Promise resolves | Autoplay/inline playback issue |
| 5 | Inspect `track.readyState`, `enabled`, and `muted` | `live`, `true`, normally `false` | Stream stopped, muted, or device contention |
| 6 | Disable scanner overlay CSS in DevTools | Live frame becomes visible | Z-index, clipping, opacity, or sizing defect |
| 7 | Compare top-level route vs embedded route | Same behavior | If different, inspect header and iframe policy |
| 8 | Reduce to `{ video: true, audio: false }` | Stream resolves and shows | Requested `facingMode`/resolution/device constraint too strict |

## 6. Production-Grade Reference Implementation

The following implementation isolates acquisition, attachment, playback, and cleanup. It intentionally uses a user action to open the modal, requests no audio, catches both acquisition and playback errors, and stops tracks only when the scanner closes.

```ts
async function startCamera(video: HTMLVideoElement) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera requires HTTPS and a browser that exposes MediaDevices.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  await new Promise<void>((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return resolve();
    video.onloadedmetadata = () => resolve();
  });

  await video.play();
  return stream;
}

function stopCamera(video: HTMLVideoElement) {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  video.srcObject = null;
}
```

```tsx
<video
  ref={videoRef}
  autoPlay
  muted
  playsInline
  className="block h-full w-full bg-black object-cover"
/>
```

## 7. Recommended Observability

Record the following structured fields for every scanner start attempt, taking care not to log camera image data or personally sensitive device labels beyond what is necessary for support: application version, route, top-level versus iframe context, `isSecureContext`, requested constraints, error name/message, stream acquisition elapsed time, `videoWidth`, `videoHeight`, `play()` result, track `readyState`, and cleanup reason. This instrumentation separates a policy failure from an attachment failure within one user session.

## Conclusion

Given that permission is already granted and the UI frame itself appears, treat the problem as a **media-preview pipeline fault** until proven otherwise. First determine whether `getUserMedia()` resolves to a live track. Then prove that the same mounted `<video>` has that stream in `srcObject`, has non-zero intrinsic dimensions, and has successfully entered playback. Only after these checks should the investigation move to decoder logic. If the page is embedded, test it outside the iframe immediately; an iframe or parent `Permissions-Policy` can produce behavior that differs from a direct custom-domain visit even when user-facing permission settings appear correct.

## References

[1]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia "MDN — MediaDevices: getUserMedia()"
[2]: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay "MDN — Autoplay guide for media and Web Audio APIs"
[3]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video "MDN — <video> HTML element"
[4]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy "MDN — Permissions Policy"
