import type { NextFunction, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "../../shared/const";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(req: Request): string | null {
  const host = req.get("host");
  if (!host || /[\s/\\]/.test(host)) return null;
  return `${req.protocol}://${host}`;
}

/**
 * Cookie-authenticated state changes must be initiated by this application's
 * own origin. Bearer-token clients remain usable without an Origin header.
 */
export function requireSameOriginForUnsafeRequests(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const hasBearerToken = /^Bearer\s+\S+$/i.test(req.get("authorization") ?? "");
  const hasSessionCookie = Boolean(
    req.headers.cookie && parseCookieHeader(req.headers.cookie)[COOKIE_NAME]
  );
  if (SAFE_METHODS.has(req.method) || (hasBearerToken && !hasSessionCookie)) {
    next();
    return;
  }

  const origin = req.get("origin");
  if (!origin || origin !== requestOrigin(req)) {
    res.status(403).json({ error: "Cross-origin requests are not permitted" });
    return;
  }

  next();
}

export function setSecurityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");

  if (process.env.NODE_ENV === "production") {
    // The deployed UI loads Google Fonts, the configured analytics script, and
    // the Forge-hosted Maps script. Keep those integrations working while
    // restricting all other resource classes to known browser-safe sources.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; " +
        "script-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; " +
        "connect-src 'self' https:; worker-src 'self' blob:"
    );
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
}