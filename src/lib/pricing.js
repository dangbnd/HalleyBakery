// src/lib/pricing.js
const THOUSANDS_GROUP_RE = /^\d{1,3}([.,]\d{3})+$/;

const n = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").trim();
  if (!s) return NaN;

  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;

  const lower = s.toLowerCase();
  const unit = /(?:\btr\b|trieu)/.test(lower)
    ? 1_000_000
    : /(?:\bk\b|nghin|ngan)/.test(lower)
      ? 1_000
      : 1;

  const m = lower.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return NaN;
  const rawNum = m[1];
  const base = THOUSANDS_GROUP_RE.test(rawNum)
    ? Number(rawNum.replace(/[.,]/g, ""))
    : Number(rawNum.replace(",", "."));
  if (!Number.isFinite(base)) return NaN;
  return base * unit;
};

function normalizeSizeKey(key = "") {
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
      const price = n(v);
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
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const line of lines) {
    const rhs = line.includes(":") ? line.split(":").slice(1).join(":") : line;
    const price = n(rhs);
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

  if (!out.length) {
    for (const size of availableSizes) {
      const key = String(size?.key || size?.id || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: key,
        label: size?.label || key,
        price: NaN,
      });
    }
  }

  return out;
}

export function priceFor(p = {}, sizeId) {
  if (!p) return null;
  const bySize = coercePriceBySizeMap(p?.priceBySize);
  if (sizeId && n(bySize[sizeId]) > 0) return n(bySize[sizeId]);

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
