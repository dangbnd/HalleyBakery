// cache.js
import { queuedFetch } from "./fetchQueue.js";
const TTL_MS = 15 * 60 * 1000; // 15 phút

export async function cachedText(url) {
  const k = "cache:" + url;
  const now = Date.now();
  try {
    const hit = JSON.parse(localStorage.getItem(k) || "null");
    if (hit && now - hit.t < TTL_MS && hit.v) {
      // P10: revalidate ở nền — dùng Date.now() tại lúc fetch thành công
      queuedFetch(url).then(r => r.text()).then(v => {
        localStorage.setItem(k, JSON.stringify({ t: Date.now(), v }));
      }).catch(() => { });
      return hit.v;
    }
  } catch { }
  const v = await (await queuedFetch(url)).text();
  try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch { }
  return v;
}

