// src/lib/pricing.js
const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
};

export function sizeOptions(p = {}) {
  const table = Array.isArray(p?.pricing?.table) ? p.pricing.table : [];
  const bySize = p?.priceBySize && typeof p.priceBySize === "object" ? p.priceBySize : {};

  // ưu tiên thứ tự theo table
  const seen = new Set();
  const out = [];

  for (const r of table) {
    if (!r?.key) continue;
    seen.add(String(r.key));
    out.push({
      id: String(r.key),
      label: r.label || String(r.key),
      price: n(r.price),
    });
  }

  // thêm các key chỉ có trong priceBySize
  for (const [key, v] of Object.entries(bySize)) {
    const k = String(key);
    if (seen.has(k)) continue;
    out.push({ id: k, label: k, price: n(v) });
  }

  return out;
}

export function priceFor(p = {}, sizeId) {
  if (!p) return null;
  const bySize = p?.priceBySize || {};
  if (sizeId && n(bySize[sizeId]) > 0) return n(bySize[sizeId]);

  const row = (p?.pricing?.table || []).find((r) => r.key === sizeId);
  if (row && n(row.price) > 0) return n(row.price);

  const base = n(p?.price);
  return base > 0 ? base : null;
}

export function pickDefaultSize(p = {}, filter) {
  const opts = sizeOptions(p);
  if (!opts.length) return null;

  // lọc theo filter giá nếu có
  let cand = opts.filter((o) => o.price > 0);
  if (filter?.priceActive && Array.isArray(filter.price)) {
    const [min, max] = filter.price;
    const lo = Number(min) || 0;
    const hi = Number(max) || Number.MAX_SAFE_INTEGER;
    const inRange = cand.filter((o) => o.price >= lo && o.price <= hi);
    if (inRange.length) cand = inRange;
  }

  // chọn giá thấp nhất
  cand.sort((a, b) => a.price - b.price);
  return cand[0]?.id ?? opts[0].id;
}
