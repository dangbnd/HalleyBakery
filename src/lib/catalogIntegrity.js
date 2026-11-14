const DEFAULT_LARGE_DROP_RATIO = 0.5;

function productKey(product = {}, index = 0) {
  const explicit = String(
    product.uid ||
    product.code ||
    product.slug ||
    product.sku ||
    product.id ||
    ""
  ).trim();
  if (explicit) {
    const source = String(
      product._tab_gid ||
      product.category ||
      product._tab_key ||
      ""
    ).trim();
    return `${source}:${explicit}`;
  }
  const name = String(product.name || product.title || "").trim().toLowerCase();
  const category = String(product.category || product._tab_key || "").trim().toLowerCase();
  return name ? `${category}:${name}` : `missing:${index}`;
}

export function inspectCatalogProducts(products = []) {
  const list = Array.isArray(products) ? products : [];
  const seen = new Set();
  let missingName = 0;
  let duplicateCount = 0;

  list.forEach((product, index) => {
    if (!String(product?.name || product?.title || "").trim()) missingName += 1;
    const key = productKey(product, index);
    if (seen.has(key)) duplicateCount += 1;
    else seen.add(key);
  });

  return {
    total: list.length,
    missingName,
    duplicateCount,
    uniqueCount: seen.size,
  };
}

export function evaluateCatalogSnapshot({
  products,
  previousProducts = [],
  sourceComplete,
  sourceProductCount,
  largeDropRatio = DEFAULT_LARGE_DROP_RATIO,
} = {}) {
  const next = inspectCatalogProducts(products);
  const previous = inspectCatalogProducts(previousProducts);

  if (!Array.isArray(products)) {
    return { ok: false, reason: "products_not_array", next, previous };
  }
  if (next.total === 0) {
    return { ok: false, reason: "empty_products", next, previous };
  }
  if (sourceComplete === false) {
    return { ok: false, reason: "incomplete_product_tabs", next, previous };
  }
  const sourceCount = Number(sourceProductCount);
  if (
    Number.isFinite(sourceCount) &&
    sourceCount >= 0 &&
    next.total !== sourceCount
  ) {
    return {
      ok: false,
      reason: "mapped_product_count_mismatch",
      next,
      previous,
      sourceProductCount: sourceCount,
    };
  }
  if (next.missingName > 0) {
    return { ok: false, reason: "missing_product_names", next, previous };
  }
  if (next.duplicateCount > 0) {
    return { ok: false, reason: "duplicate_product_ids", next, previous };
  }

  const ratio = Number(largeDropRatio);
  const thresholdRatio = Number.isFinite(ratio) && ratio > 0 && ratio < 1
    ? ratio
    : DEFAULT_LARGE_DROP_RATIO;
  const severeDrop =
    sourceComplete !== true &&
    previous.total >= 20 &&
    next.total < Math.max(4, Math.floor(previous.total * thresholdRatio));

  if (severeDrop) {
    return { ok: false, reason: "suspicious_product_drop", next, previous };
  }

  return { ok: true, reason: "accepted", next, previous };
}

export function productTabsComplete(integrity) {
  const value = integrity?.productTabs?.complete;
  return typeof value === "boolean" ? value : undefined;
}

export function hasStockMetadata(products = []) {
  return (Array.isArray(products) ? products : []).some((product) =>
    typeof product?.inStock === "boolean" || Number.isFinite(product?.stockQuantity)
  );
}

export function hasReliableCreatedAtMetadata(products = [], minimumRatio = 0.05) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) return false;
  const dated = list.filter((product) => {
    const timestamp = Number(product?.createdAtTs || Date.parse(product?.createdAt || ""));
    return Number.isFinite(timestamp) && timestamp > 0;
  }).length;
  return dated >= 2 && dated / list.length >= minimumRatio;
}
