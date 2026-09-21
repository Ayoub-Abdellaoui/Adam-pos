import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Drizzle TiDB connection configuration", () => {
  it("uses the managed DATABASE_URL with the MySQL dialect", () => {
    const source = readFileSync(new URL("./drizzle.config.ts", import.meta.url), "utf8");
    expect(source).toContain('const connectionString = process.env.EXTERNAL_DATABASE_URL');
    expect(source).toContain('dialect: "mysql"');
    expect(source).toContain('ssl: { rejectUnauthorized: true }');
  });
});
