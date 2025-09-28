// src/utils/img.js
// utils/img.js
export const cdn = (raw = "", { w = 600, h = 0, q = 65 } = {}) => {
  if (!raw) return "";
  const https = String(raw).replace(/^http:\/\//i, "https://");
  const noProto = https.replace(/^https?:\/\//i, "");
  const url = encodeURIComponent(noProto);
  const wh = h ? `&w=${w}&h=${h}` : `&w=${w}`;
  return `https://images.weserv.nl/?url=${url}${wh}&fit=cover&output=webp&q=${q}`;
};

export const prefetchImage = (u) => { if (u) { const i = new Image(); i.src = u; } };
// prefetch queue nhỏ
const seen = new Set();
let inflight = 0;
const Q = [];
const MAX = 2;
function pump() {
  if (inflight >= MAX || !Q.length) return;
  const url = Q.shift();
  inflight++;
  const img = new Image();
  img.decoding = "async";
  img.onload = img.onerror = () => { inflight--; pump(); };
  img.src = url;
}
export const firstImg = (p = {}) => {
  if (Array.isArray(p.images) && p.images.length) return p.images[0];
  if (typeof p.images === "string" && p.images) return p.images.split(/[\n,|]\s*/)[0].trim();
  return p.image || p.thumbnail || "";
};