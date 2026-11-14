// src/lib/pricing.js
const THOUSANDS_GROUP_RE = /^\d{1,3}([.,]\d{3})+$/;

export const parsePriceValue = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").trim();
  if (!s) return NaN;

  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;

  const lower = s.toLowerCase();
  const unit = /(?:tr(?:ieu|iệu)?|triệu)\b/.test(lower)
    ? 1_000_000
    : /(?:k|nghìn|nghin|ngàn|ngan)\b/.test(lower)
      ? 1_000
      : 1;

  const m = lower.match(/(\d[\d.,\s]*)/);
  if (!m) return NaN;
  const rawNum = m[1].replace(/\s+/g, "").replace(/[.,]+$/, "");
  const base = unit === 1 && THOUSANDS_GROUP_RE.test(rawNum)
    ? Number(rawNum.replace(/[.,]/g, ""))
    : Number(rawNum.replace(",", "."));
  if (!Number.isFinite(base)) return NaN;
  return base * unit;
};

export function normalizeSizeKey(key = "") {
  const raw = String(key ?? "").trim();
  if (!raw) return "";
  if (/^\d+\s*-\s*\d+$/.test(raw)) return raw.replace(/\s+/g, "");

  const lower = raw.toLowerCase().replace(/\s+/g, "");
  if (/^\d+$/.test(lower)) return `${lower}-0`;

  let m = lower.match(/^(\d{1,2})cm$/);
  if (m) return `${m[1]}-0`;

  m = lower.match(/^(\d{1,2}x\d{1,2})x(\d{1,2})cm?$/);
  if (m) return `${m[1]}-${m[2]}`;

  m = lower.match(/^(\d{1,2}x\d{1,2})$/);
  if (m) return `${m[1]}-0`;

  return raw;
}

function detectSizeKeyFromLine(line = "") {
  const src = String(line || "");
  const lower = src.toLowerCase();

  let m = lower.match(/(\d{1,2}\s*x\s*\d{1,2})\s*x\s*(\d{1,2})\s*cm/);
  if (m) return `${m[1].replace(/\s+/g, "").replace(/x+/g, "x")}-${m[2]}`;

  m = lower.match(/(\d{1,2})\s*cm/);
  if (m) return `${m[1]}-0`;

  m = src.match(/size\s*[:\-]?\s*([a-z0-9x-]+)/i);
  if (m) return normalizeSizeKey(m[1]);

  return "";
}

export function coercePriceBySizeMap(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = normalizeSizeKey(k);
      const price = parsePriceValue(v);
      if (key && Number.isFinite(price) && price > 0) out[key] = price;
    }
    return out;
  }

  const text = String(raw ?? "").trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return coercePriceBySizeMap(parsed);
    }
  } catch {
    // keep parsing as free text
  }

  const out = {};
  const lines = text
    .split(
      /[\n;]+|,(?=\s*(?:size\s*)?(?:\d{1,2}(?:\s*x\s*\d{1,2})?(?:\s*x\s*\d{1,2})?\s*cm|[a-z0-9x-]{1,20}\s*[:=-]))/i
    )
    .map((x) => x.trim())
    .filter(Boolean);

  for (const line of lines) {
    const rhs = line.includes(":") ? line.split(":").slice(1).join(":") : line;
    const price = parsePriceValue(rhs);
    if (!Number.isFinite(price) || price <= 0) continue;

    let key = detectSizeKeyFromLine(line);
    if (!key) {
      const kv = line.match(/^(.+?)\s*[:=-]\s*(.+)$/);
      if (!kv) continue;
      key = normalizeSizeKey(kv[1].replace(/^[-*\s]+/, "").replace(/^size\s+/i, "").trim());
    }
    if (!key) continue;
    out[key] = price;
  }
  return out;
}

export function sizeOptions(p = {}) {
  const table = Array.isArray(p?.pricing?.table) ? p.pricing.table : [];
  const bySize = coercePriceBySizeMap(p?.priceBySize);
  const availableSizes = Array.isArray(p?.availableSizes) ? p.availableSizes : [];
  const declaredSizes = Array.isArray(p?.sizes) ? p.sizes : [];

  // ưu tiên thứ tự theo table
  const seen = new Set();
  const out = [];

  for (const r of table) {
    const key = normalizeSizeKey(r?.key || r?.id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      label: r.label || key,
      price: parsePriceValue(r.price),
    });
  }

  // thêm các key chỉ có trong priceBySize
  for (const [key, v] of Object.entries(bySize)) {
    const k = normalizeSizeKey(key);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ id: k, label: k, price: parsePriceValue(v) });
  }

  for (const size of availableSizes) {
    const key = normalizeSizeKey(size?.key || size?.id || size?.code || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      label: size?.label || key,
      price: NaN,
    });
  }

  for (const size of declaredSizes) {
    const raw = typeof size === "object"
      ? size?.key || size?.id || size?.code || size?.label
      : size;
    const key = normalizeSizeKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      label: typeof size === "object" ? size?.label || key : String(size),
      price: NaN,
    });
  }

  return out;
}

export function priceFor(p = {}, sizeId) {
  if (!p) return null;
  const bySize = coercePriceBySizeMap(p?.priceBySize);
  if (sizeId && parsePriceValue(bySize[sizeId]) > 0) return parsePriceValue(bySize[sizeId]);

  const base = parsePriceValue(p?.price);
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
