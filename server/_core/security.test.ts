import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ONE_YEAR_MS, SESSION_DURATION_MS } from "../../shared/const";
import { validateProductionEnvironment } from "./env";
import {
  requireSameOriginForUnsafeRequests,
  setSecurityHeaders,
} from "./security";

function runSameOriginCheck(method: string, origin?: string, authorization?: string) {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const next = vi.fn() as NextFunction;
  const req = {
    method,
    protocol: "https",
    get: (name: string) =>
      name === "host"
        ? "pos.example.test"
        : name === "origin"
          ? origin
          : name === "authorization"
            ? authorization
            : undefined,
    headers: { authorization },
  } as unknown as Request;
  const res = { status, json } as unknown as Response;

  requireSameOriginForUnsafeRequests(req, res, next);
  return { status, json, next };
}

describe("central request security", () => {
  it("rejects unsafe cross-origin cookie requests and allows same-origin and bearer requests", () => {
    const rejected = runSameOriginCheck("POST", "https://attacker.example");
    expect(rejected.status).toHaveBeenCalledWith(403);
    expect(rejected.next).not.toHaveBeenCalled();

    expect(runSameOriginCheck("POST", "https://pos.example.test").next).toHaveBeenCalledOnce();
    expect(runSameOriginCheck("POST", undefined, "Bearer token").next).toHaveBeenCalledOnce();
    expect(runSameOriginCheck("GET", undefined).next).toHaveBeenCalledOnce();
  });

  it("uses production-compatible browser hardening headers", () => {
    const setHeader = vi.fn();
    const next = vi.fn() as NextFunction;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      setSecurityHeaders({} as Request, { setHeader } as unknown as Response, next);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }

    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(setHeader).toHaveBeenCalledWith("Content-Security-Policy", expect.stringContaining("fonts.googleapis.com"));
    expect(setHeader).toHaveBeenCalledWith("Strict-Transport-Security", expect.stringContaining("includeSubDomains"));
    expect(next).toHaveBeenCalledOnce();
  });

  it("requires canonical production settings without including values in errors", () => {
    expect(() => validateProductionEnvironment({
      NODE_ENV: "production",
      JWT_SECRET: "a-production-secret-that-is-longer-than-32-characters",
      EXTERNAL_DATABASE_URL: "mysql://user:password@db.example.test:3306/adam_pos",
      OWNER_OPEN_ID: "owner-id",
      BUILT_IN_FORGE_API_URL: "https://forge.example.test",
      BUILT_IN_FORGE_API_KEY: "forge-secret",
      GEMINI_API_KEY: "gemini-secret",
    })).not.toThrow();
    expect(() => validateProductionEnvironment({ NODE_ENV: "production" }))
      .toThrow("JWT_SECRET, EXTERNAL_DATABASE_URL, OWNER_OPEN_ID, BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY, GEMINI_API_KEY");
  });

  it("uses a bounded stateless session lifetime", () => {
    expect(SESSION_DURATION_MS).toBe(8 * 60 * 60 * 1000);
    expect(SESSION_DURATION_MS).toBeLessThan(ONE_YEAR_MS);
  });
});
