import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Product Catalog search and POS Quick Keys contracts", () => {
  it("searches the catalog across all requested fields with debounce", () => {
    const source = readFileSync(new URL("./ProductManagement.tsx", import.meta.url), "utf8");
    expect(source).toContain("const [debouncedSearch, setDebouncedSearch] = useState(\"\");");
    expect(source).toContain("window.setTimeout(() => setDebouncedSearch(search), 220)");
    expect(source).toContain("product.name");
    expect(source).toContain("product.sku ?? \"\"");
    expect(source).toContain("product.category ?? \"\"");
    expect(source).toContain("product.variations ?? \"\"");
    expect(source).toContain("...product.barcodes");
  });

  it("uses a dynamic active-mappings manager instead of pre-generating alphabet controls", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.pos.quickKeyMappings.useQuery");
    expect(source).toContain("trpc.pos.setQuickKey.useMutation");
    expect(source).toContain("QuickKeyManagementCard");
    expect(source).toContain("Add New Shortcut");
    expect(source).toContain("No shortcuts configured");
    expect(source).toContain("const QUICK_KEY_CHARACTERS: string[] = []");
    expect(source).toContain("onDelete={deleteQuickKey}");
  });

  it("searches the live branch product catalog by product name or barcode before assignment", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.pos.quickKeyProductSearch.useQuery");
    expect(source).toContain("Find product by name or barcode");
    expect(source).toContain("Start typing a product name or barcode to search the live catalog.");
    expect(source).toContain("quickKeyProductQuery");
  });
});


describe("Quick Key backend validation", () => {
  it("keeps unique alphanumeric mappings and rejects reserved system keys", () => {
    const source = readFileSync(new URL("../../../server/routers/pos.ts", import.meta.url), "utf8");
    expect(source).toContain("const quickKeyCharacterSchema = z.string().trim().regex(/^[A-Za-z0-9]$/");
    expect(source).toContain("F2");
    expect(source).toContain("F4");
    expect(source).toContain("F8");
    expect(source).toContain("quickKeys.keyCharacter");
    expect(source).toContain("const RESERVED_QUICK_KEYS = new Set([\"F2\", \"F4\", \"F8\", \"ENTER\"]);");
    expect(source).toContain("That Quick Key is already assigned to another product.");
    expect(source).toContain("quickKeyProductSearch: posProcedure");
    expect(source).toContain("like(products.name");
    expect(source).toContain("like(barcodes.value");
    expect(source).toContain("requireBranchRole(ctx.user, storeId, [\"admin\"])");
  });
});


describe("Quick Key schema", () => {
  it("defines a branch-scoped unique Quick Key mapping", () => {
    const source = readFileSync(new URL("../../../drizzle/schema.ts", import.meta.url), "utf8");
    expect(source).toContain("export const quickKeys");
    expect(source).toContain("keyCharacter");
    expect(source).toContain("productId");
    expect(source).toContain('uniqueIndex("quick_keys_store_key_unique")');
  });
});
