// src/services/cache.js
// Simple localStorage-backed text cache with TTL
export async function cachedText(url, ttlMs = 5 * 60 * 1000) {
  try {
    const key = "cache:" + url;
    const now = Date.now();
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && saved.v && (now - saved.t) < ttlMs) {
      return saved.v;
    }
    const txt = await fetch(url, { cache: "no-cache" }).then(r => r.text());
    try { localStorage.setItem(key, JSON.stringify({ t: now, v: txt })); } catch {}
    return txt;
  } catch (e) {
    // Fallback to network if cache fails
    return fetch(url, { cache: "no-cache" }).then(r => r.text());
  }
}
