// src/utils/img.js
export const cdn = (raw, { w=480, h=0, q=70 } = {}) => {
  if (!raw) return "";
  const noProto = String(raw).replace(/^https?:\/\//, "");
  const url = encodeURIComponent(noProto);
  const wh = h ? `&w=${w}&h=${h}` : `&w=${w}`;
  return `https://images.weserv.nl/?url=${url}${wh}&fit=cover&output=webp&q=${q}`;
};

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
export function prefetchImage(url) {
  if (!url || seen.has(url)) return;
  seen.add(url); Q.push(url); pump();
}
export const firstImg = (p = {}) => {
  if (Array.isArray(p.images) && p.images.length) return p.images[0];
  if (typeof p.images === "string" && p.images) return p.images.split(/[\n,|]\s*/)[0].trim();
  return p.image || p.thumbnail || "";
};