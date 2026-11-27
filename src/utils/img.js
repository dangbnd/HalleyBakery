const MEDIA_CACHE_BASE = (
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_MEDIA_CACHE_URL) ||
  "https://img.halley.io.vn"
).replace(/\/+$/, "");

export function driveIdOf(raw = "") {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Do not treat local Ubuntu media IDs (loc_*) as Google Drive file IDs
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
    s.match(/uc\?[^#?]*id=([A-Za-z0-9_-]+)/) ||
    s.match(/img\.halley\.io\.vn\/img\/([A-Za-z0-9_-]{20,})(?:[/?#]|$)/);
  if (m && m[1].startsWith("loc_")) return "";
  return m ? m[1] : "";
}

export function mediaCacheIdOf(raw = "") {
  const s = String(raw || "").trim();
  if (!s) return "";
  const localMatch = s.match(/\/img\/([A-Za-z0-9_-]{4,80})(?:[/?#]|$)/);
  if (localMatch) return localMatch[1];
  return driveIdOf(s);
}

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
export const cdnThumb = (raw = "", w = 96, h = 96, q = 65) => {
  const mediaId = mediaCacheIdOf(raw);
  if (mediaId && MEDIA_CACHE_BASE) return `${MEDIA_CACHE_BASE}/img/${mediaId}?w=${Math.max(320, Number(w) || 320)}`;
  return cdn(raw, { w, h, q });
};

/**
 * Chuẩn hoá URL ảnh từ Ubuntu Media / Google Drive / đường dẫn tương đối
 */
export function normalizeImageUrl(u, maxWidth = 2048) {
  if (!u) return "";
  const s = String(u).trim().replace(/^\[\s*"?|"+\s*\]$/g, "").replace(/^"+|"+$/g, "").trim();
  if (!s) return "";
  const localMatch = s.match(/\/img\/([A-Za-z0-9_-]{4,80})(?:[/?#]|$)/);
  if (localMatch && MEDIA_CACHE_BASE) {
    const gdMatch = s.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
    const gdSuffix = gdMatch && !gdMatch[1].startsWith("loc_") ? `&id=${gdMatch[1]}` : "";
    return `${MEDIA_CACHE_BASE}/img/${localMatch[1]}?w=${Math.min(1200, Math.max(320, Number(maxWidth) || 720))}${gdSuffix}`;
  }
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
    s.match(/uc\?[^#?]*id=([A-Za-z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${maxWidth}`;
  if (/^https?:\/\//i.test(s)) return s;
  const base = "/images/";
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
  const steps = [...new Set([320, 480, 720, maxW].filter((w) => w > 0 && w <= maxW))];
  const mediaId = mediaCacheIdOf(raw);
  if (mediaId && MEDIA_CACHE_BASE) {
    return steps.map((w) => `${MEDIA_CACHE_BASE}/img/${mediaId}?w=${w} ${w}w`).join(", ");
  }
  return steps.map((w) => `${cdn(raw, { w, h: h ? Math.round((h * w) / maxW) : 0, q })} ${w}w`).join(", ");
};

/**
 * Danh sách URL dự phòng khi CDN lỗi (Ubuntu SSD → Drive thumbnail → CDN → gốc)
 */
export const candidatesFor = (raw = "", w = 600, h = 0, q = 65) => {
  const out = [];
  if (!raw) return out;
  const https = String(raw).trim().replace(/^http:\/\//i, "https://");
  const driveId = driveIdOf(https);
  const mediaId = mediaCacheIdOf(https);
  if (mediaId && MEDIA_CACHE_BASE) {
    out.push(`${MEDIA_CACHE_BASE}/img/${mediaId}?w=${w}`);
  }
  if (driveId) {
    out.push(`https://drive.google.com/thumbnail?id=${driveId}&sz=w${w}`);
    out.push(`https://lh3.googleusercontent.com/d/${driveId}=w${w}`);
  }
  out.push(cdn(https, { w, h, q }));
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
