import { queuedFetch } from "./fetchQueue.js";

export const SHEET_CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(url) {
  return "cache:" + url;
}

export function readTextCache(url, { ttlMs = SHEET_CACHE_TTL_MS } = {}) {
  const now = Date.now();
  try {
    const hit = JSON.parse(localStorage.getItem(cacheKey(url)) || "null");
    if (!hit || !hit.v) return { hit: null, fresh: false, ageMs: Infinity };
    const ageMs = now - Number(hit.t || 0);
    return { hit, fresh: ageMs >= 0 && ageMs < ttlMs, ageMs };
  } catch {
    return { hit: null, fresh: false, ageMs: Infinity };
  }
}

export function writeTextCache(url, value) {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), v: value }));
  } catch {}
}

export async function cachedText(url, { force = false, ttlMs = SHEET_CACHE_TTL_MS } = {}) {
  const { hit, fresh } = readTextCache(url, { ttlMs });
  if (!force && fresh) return hit.v;

  try {
    const v = await (await queuedFetch(url)).text();
    writeTextCache(url, v);
    return v;
  } catch (error) {
    if (hit?.v) return hit.v;
    throw error;
  }
}

export function clearTextCache() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("cache:")) localStorage.removeItem(key);
    });
  } catch {}
}
