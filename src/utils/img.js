// src/utils/img.js — Hàm xử lý ảnh tập trung (gom từ ProductImage, ProductQuickView, sheets.js, sheets.multi.js)

/**
 * CDN resize + nén webp qua images.weserv.nl
 * @param {string} raw - URL ảnh gốc
 * @param {{ w?: number, h?: number, q?: number }} opts
 * @returns {string}
 */
export const cdn = (raw = "", { w = 600, h = 0, q = 65 } = {}) => {
  if (!raw) return "";
  const https = String(raw).replace(/^http:\/\//i, "https://");
  const noProto = https.replace(/^https?:\/\//i, "");
  // P5: tránh double-encode (encodeURIComponent biến %20→%2520)
  // Decode trước rồi encode lại để đảm bảo chỉ encode 1 lần
  let decoded;
  try { decoded = decodeURIComponent(noProto); } catch { decoded = noProto; }
  const url = encodeURIComponent(decoded);
  const wh = h ? `&w=${w}&h=${h}` : `&w=${w}`;
  return `https://images.weserv.nl/?url=${url}${wh}&fit=cover&output=webp&q=${q}`;
};

/**
 * CDN thumbnail nhỏ (cho danh sách gợi ý, grid thumbnail)
 */
export const cdnThumb = (raw = "", w = 96, h = 96, q = 65) =>
  cdn(raw, { w, h, q });

/**
 * Chuẩn hoá URL ảnh từ Google Drive / đường dẫn tương đối
 */
export function normalizeImageUrl(u, maxWidth = 2048) {
  if (!u) return "";
  const s = String(u).trim();
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
    s.match(/uc\?[^#?]*id=([A-Za-z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${maxWidth}`;
  if (/^https?:\/\//i.test(s)) return s;
  const base = (import.meta.env.VITE_IMAGE_BASE || "/images/").replace(/\/+$/, "") + "/";
  return encodeURI(base + s.replace(/^\/+/, ""));
}

/**
 * Lấy ảnh đầu tiên của sản phẩm
 */
export const firstImg = (p = {}) => {
  if (Array.isArray(p.images) && p.images.length) return p.images[0];
  if (typeof p.images === "string" && p.images) return p.images.split(/[\n,|]\s*/)[0].trim();
  return p.image || p.thumbnail || "";
};

/**
 * Prefetch 1 ảnh
 */
export const prefetchImage = (u) => {
  if (u) {
    const i = new Image();
    i.decoding = "async";
    i.src = u;
  }
};

/**
 * srcSet cho responsive images
 */
export const mkSrcSet = (raw, maxW = 960, h = 0, q = 65) => {
  const steps = [Math.min(480, maxW), Math.min(720, maxW), maxW];
  return steps.map((w) => `${cdn(raw, { w, h: h ? Math.round((h * w) / maxW) : 0, q })} ${w}w`).join(", ");
};

/**
 * Danh sách URL dự phòng khi CDN lỗi (CDN → Drive thumbnail → gốc)
 */
export const candidatesFor = (raw = "", w = 600, h = 0, q = 65) => {
  const out = [];
  if (!raw) return out;
  const https = raw.replace(/^http:\/\//i, "https://");
  out.push(cdn(https, { w, h, q }));
  const m1 = https.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) out.push(`https://drive.google.com/thumbnail?id=${m1[1]}&sz=w${w}`);
  const m2 = https.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) out.push(`https://drive.google.com/thumbnail?id=${m2[1]}&sz=w${w}`);
  out.push(https);
  return [...new Set(out)];
};

/**
 * Parse danh sách URL ảnh từ product object
 */
export const getImageUrls = (p) => {
  if (!p) return [];
  return Array.isArray(p?.images)
    ? p.images
    : String(p?.images || "").split(/\s*[\n,|]\s*/).filter(Boolean);
};

export const getImageUrl = (p, index = 0) => {
  const a = getImageUrls(p);
  return a[index] || a[0] || "";
};

export const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='100%' height='100%' fill='%23f3f4f6'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='16' fill='%239ca3af'>Không tải được ảnh</text></svg>";