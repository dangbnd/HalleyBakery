import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCatalogSnapshot,
  inspectCatalogProducts,
} from "../src/lib/catalogIntegrity.js";
import { parsePriceValue, sizeOptions } from "../src/lib/pricing.js";
import {
  mapProducts,
  parseProductDate,
} from "../src/services/sheets.js";
import { mkSrcSet } from "../src/utils/img.js";
import { buildFeedbackDisplayItems } from "../src/utils/feedback.js";
import { isValidRuntimeConfigPayload } from "../src/utils/config.js";
import {
  deriveCatalogMetadata,
  preserveFailedSections,
  shouldRejectRefresh,
} from "../api/all.js";
import { normalizeTagLabel } from "../src/utils/tagKey.js";
import { submitConsultLead } from "../src/services/consult.js";

function products(count, category = "cake") {
  return Array.from({ length: count }, (_, index) => ({
    id: `p-${index + 1}`,
    name: `Product ${index + 1}`,
    category,
  }));
}

test("parsePriceValue handles common Vietnamese price formats", () => {
  assert.equal(parsePriceValue("350k"), 350_000);
  assert.equal(parsePriceValue("1,2tr"), 1_200_000);
  assert.equal(parsePriceValue("1.200.000"), 1_200_000);
  assert.equal(parsePriceValue("850000"), 850_000);
});

test("sizeOptions uses every catalog size source with normalized keys", () => {
  const options = sizeOptions({
    priceBySize: { "10cm": 350_000, "12": 450_000 },
    availableSizes: [{ key: "14-0", label: "Size 14cm" }],
    sizes: ["16cm"],
  });

  assert.deepEqual(
    options.map((option) => option.id).sort(),
    ["10-0", "12-0", "14-0", "16-0"]
  );
});

test("known malformed storefront tags are repaired", () => {
  assert.equal(normalizeTagLabel("basicbasic"), "Basic");
  assert.equal(normalizeTagLabel("1 tuổituổi"), "1 tuổi");
  assert.equal(normalizeTagLabel("phụ nữnữ"), "Phụ nữ");
  assert.equal(normalizeTagLabel("siêu nhânnhân"), "Siêu nhân");
  assert.equal(normalizeTagLabel("dế thương"), "Dễ thương");
});

test("unified API derives optional metadata when Settings tabs are absent", () => {
  const result = deriveCatalogMetadata({
    products: [{
      id: "1",
      name: "Bánh test",
      category: "basic",
      tags: "basicbasic, dế thương",
      priceBySize: "10cm: 100k, 12cm: 150k",
    }],
    menu: [{ key: "basic", label: "Basic" }],
    categories: [],
    tags: [],
    sizes: [],
    levels: [],
    types: [],
  });

  assert.deepEqual(result.categories, [{ key: "basic", title: "Basic" }]);
  assert.deepEqual(result.tags.map((tag) => tag.label), ["Basic", "Dễ thương"]);
  assert.deepEqual(result.sizes.map((size) => size.key).sort(), ["10-0", "12-0"]);
});

test("consult submission is transactional and does not depend on analytics consent", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  try {
    const result = await submitConsultLead({
      product: { id: "cake-1", name: "Bánh test", category: "basic" },
      form: { phone: "0901234567" },
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.remoteOk, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("responsive product srcset stays within requested width without duplicates", () => {
  const srcset = mkSrcSet("https://example.com/cake.jpg", 600, 0, 70);
  const widths = srcset
    .split(", ")
    .map((candidate) => Number(candidate.match(/(\d+)w$/)?.[1]));

  assert.deepEqual(widths, [320, 480, 600]);
});

test("feedback display never falls back to product images", () => {
  const items = buildFeedbackDisplayItems([
    {
      id: "real-feedback",
      image: "https://example.com/customer-feedback.jpg",
      name: "Khach hang gui",
    },
    {
      id: "catalog-product",
      product: {
        id: "cake-1",
        images: "https://example.com/product.jpg",
      },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "real-feedback");
  assert.equal(items[0].image, "https://example.com/customer-feedback.jpg");
});

test("runtime config rejects non-JSON Vite responses and API error fallbacks", () => {
  assert.equal(isValidRuntimeConfigPayload({}), false);
  assert.equal(isValidRuntimeConfigPayload({
    ok: true,
    source: "error_fallback",
    config: {},
    error: "runtime_config_failed",
  }), false);
  assert.equal(isValidRuntimeConfigPayload({
    ok: true,
    source: "sheet",
    config: { feedback_images: "[]" },
  }), true);
});

test("parseProductDate treats slash dates as day/month/year", () => {
  const parsed = new Date(parseProductDate("07/08/2026 08:30"));
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 7);
  assert.equal(parsed.getDate(), 7);
  assert.equal(parseProductDate("31/02/2026"), 0);
});

test("mapProducts normalizes price, stock, popularity, level and date", () => {
  const [product] = mapProducts([
    {
      id: "HB-1",
      name: "Banh test",
      category: "birthday",
      price: "350k",
      in_stock: "yes",
      popular: "42",
      level: "premium",
      created_at: "24/07/2026 08:30",
    },
  ]);

  assert.equal(product.price, 350_000);
  assert.equal(product.inStock, true);
  assert.equal(product.popular, 42);
  assert.equal(product.level, "premium");
  assert.equal(product.createdAtTs, parseProductDate("24/07/2026 08:30"));
  assert.ok(product.createdAtTs > 0);
});

test("mapProducts parses priceBySize with attached Vietnamese units", () => {
  const [product] = mapProducts([
    {
      id: "HB-PRICE",
      name: "Banh gia",
      category: "birthday",
      priceBySize: "10cm: 350k, 12cm: 1,2tr",
    },
  ]);

  assert.deepEqual(product.priceBySize, {
    "10-0": 350_000,
    "12-0": 1_200_000,
  });
});

test("mapProducts derives out-of-stock from quantity", () => {
  const [product] = mapProducts([
    {
      id: "HB-2",
      name: "Banh het hang",
      category: "birthday",
      stock_quantity: "0",
    },
  ]);

  assert.equal(product.inStock, false);
  assert.equal(product.stockQuantity, 0);
});

test("catalog inspection detects duplicate product identities", () => {
  const result = inspectCatalogProducts([
    { id: "1", name: "A", category: "cake" },
    { id: "1", name: "B", category: "cake" },
  ]);

  assert.equal(result.duplicateCount, 1);
});

test("incomplete or empty snapshots never replace last-known-good data", () => {
  const previousProducts = products(100);

  assert.equal(evaluateCatalogSnapshot({
    products: [],
    previousProducts,
    sourceComplete: true,
  }).reason, "empty_products");

  assert.equal(evaluateCatalogSnapshot({
    products: products(80),
    previousProducts,
    sourceComplete: false,
  }).reason, "incomplete_product_tabs");
});

test("unknown source with severe count drop is rejected", () => {
  const result = evaluateCatalogSnapshot({
    products: products(30),
    previousProducts: products(100),
    sourceComplete: undefined,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "suspicious_product_drop");
});

test("mapping loss rejects snapshot before cache commit", () => {
  const result = evaluateCatalogSnapshot({
    products: products(9),
    previousProducts: products(10),
    sourceComplete: true,
    sourceProductCount: 10,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "mapped_product_count_mismatch");
});

test("complete source may intentionally publish a smaller valid catalog", () => {
  const result = evaluateCatalogSnapshot({
    products: products(30),
    previousProducts: products(100),
    sourceComplete: true,
  });

  assert.equal(result.ok, true);
});

test("API rejects incomplete product tabs", () => {
  const nextData = {
    products: products(10),
    _integrity: {
      productTabs: {
        complete: false,
        failedTabs: [{ key: "wedding" }],
      },
    },
  };

  assert.equal(shouldRejectRefresh(nextData, { data: { products: products(20) } }), true);
});

test("API preserves last-known-good ancillary sections when refresh fails", () => {
  const next = {
    products: products(2),
    menu: [],
    pages: [{ key: "about" }],
    _integrity: {
      productTabs: { complete: true },
      sections: {
        menu: { ok: false },
        pages: { ok: true },
      },
    },
  };
  const previous = {
    menu: [{ key: "product" }],
    pages: [{ key: "old" }],
  };

  const merged = preserveFailedSections(next, previous);
  assert.deepEqual(merged.menu, previous.menu);
  assert.deepEqual(merged.pages, next.pages);
});
