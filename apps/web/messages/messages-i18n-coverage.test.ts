import { readFileSync } from "node:fs";
import path from "node:path";

type LocaleCode = "en" | "fr" | "es";

function readLocaleCatalog(locale: LocaleCode): Record<string, unknown> {
  const filePath = path.join(process.cwd(), "messages", `${locale}.json`);
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function flattenLeaves(value: Record<string, unknown>, prefix = ""): Map<string, string> {
  const leaves = new Map<string, string>();

  for (const [key, entry] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (typeof entry === "string") {
      leaves.set(nextKey, entry);
      continue;
    }

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      for (const [childKey, childValue] of flattenLeaves(
        entry as Record<string, unknown>,
        nextKey
      )) {
        leaves.set(childKey, childValue);
      }
    }
  }

  return leaves;
}

describe("message catalog coverage", () => {
  it("keeps identical leaf keys across en, fr, and es", () => {
    const catalogs = {
      en: flattenLeaves(readLocaleCatalog("en")),
      fr: flattenLeaves(readLocaleCatalog("fr")),
      es: flattenLeaves(readLocaleCatalog("es")),
    };
    const referenceKeys = Array.from(catalogs.en.keys()).sort();

    expect(Array.from(catalogs.fr.keys()).sort()).toEqual(referenceKeys);
    expect(Array.from(catalogs.es.keys()).sort()).toEqual(referenceKeys);
  });

  it("keeps localized values populated whenever the English source value is populated", () => {
    const englishEntries = flattenLeaves(readLocaleCatalog("en"));

    for (const locale of ["fr", "es"] satisfies LocaleCode[]) {
      const localizedEntries = flattenLeaves(readLocaleCatalog(locale));

      for (const [key, englishValue] of englishEntries) {
        const localizedValue = localizedEntries.get(key);

        expect(key.trim().length).toBeGreaterThan(0);
        expect(typeof localizedValue).toBe("string");
        if (englishValue.trim().length > 0) {
          expect(localizedValue?.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
