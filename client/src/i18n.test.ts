import { describe, expect, it } from "vitest";
import i18n, { languages } from "./i18n";

describe("i18n configuration", () => {
  it("supports English, Arabic, and French with Arabic RTL direction", async () => {
    expect(languages.map(language => language.code)).toEqual(["en", "ar", "fr"]);
    await i18n.changeLanguage("ar");
    expect(i18n.dir()).toBe("rtl");
    expect(i18n.t("dashboard.title")).toContain("أداء");
    await i18n.changeLanguage("en");
  });
});
