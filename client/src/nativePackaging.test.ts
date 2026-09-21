import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

describe("native packaging security contract", () => {
  it("keeps desktop and mobile wrappers on the hosted HTTPS application", () => {
    const desktop = readProjectFile("desktop/main.cjs");
    const capacitor = readProjectFile("capacitor.config.ts");

    expect(desktop).toContain("https://cloudposinv-uew3onk4.manus.space");
    expect(capacitor).toContain("https://cloudposinv-uew3onk4.manus.space");
    expect(capacitor).toContain("cleartext: false");
  });

  it("does not embed a TiDB connection string in native client files", () => {
    for (const path of ["desktop/main.cjs", "capacitor.config.ts", "NATIVE_APPS.md"]) {
      const source = readProjectFile(path);
      expect(source).not.toMatch(/mysql:\/\//i);
      expect(source).not.toMatch(/gateway01\.eu-central-1\.prod\.aws\.tidbcloud\.com/i);
    }
  });

  it("adds Capacitor lifecycle, connectivity, and Android back-navigation behavior", () => {
    const lifecycle = readProjectFile("client/src/lib/nativeLifecycle.ts");
    const main = readProjectFile("client/src/main.tsx");

    expect(lifecycle).toContain('from "@capacitor/app"');
    expect(lifecycle).toContain('from "@capacitor/network"');
    expect(lifecycle).toContain('from "@capacitor/splash-screen"');
    expect(lifecycle).toContain('App.addListener("appStateChange"');
    expect(lifecycle).toContain('App.addListener("backButton"');
    expect(lifecycle).toContain('Network.addListener("networkStatusChange"');
    expect(main).toContain("initializeNativeLifecycle");
  });
});
