// cache.js
const TTL_MS = 15 * 60 * 1000; // 15 phút

export async function cachedText(url) {
  const k = "cache:" + url;
  const now = Date.now();
  try {
    const hit = JSON.parse(localStorage.getItem(k) || "null");
    if (hit && now - hit.t < TTL_MS && hit.v) {
      // revalidate ở nền
      fetch(url, { cache: "no-cache" }).then(r => r.text()).then(v => {
        localStorage.setItem(k, JSON.stringify({ t: now, v }));
      }).catch(()=>{});
      return hit.v;
    }
  } catch {}
  const v = await (await fetch(url, { cache: "no-cache" })).text();
  localStorage.setItem(k, JSON.stringify({ t: now, v }));
  return v;
}
