// src/services/sheets.multi.js
import { normalizeImageUrl } from "../utils/img.js";
import { queuedFetch } from "./fetchQueue.js";
import { cachedText } from "./cache.js";

/* ---------- Parse env multi-tab ---------- */
export function readProductTabsFromEnv() {
  const raw0 = String(import.meta.env?.VITE_PRODUCT_TABS || "");
  const raw = raw0.trim().replace(/^['"]|['"]$/g, ""); // bỏ nháy bọc

  const tokens = raw
    .replace(/\r\n?/g, "\n")
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const tabs = [];
  for (const tok of tokens) {
    const m = tok.match(/^(\d+)\s*:\s*(.+)$/); // <gid>:<label>
    if (!m) continue;
    tabs.push({ gid: m[1], key: m[2].trim() });
  }
  return tabs;
}




/* ---------- GViz fetch + chuẩn hoá cột ---------- */
async function fetchGViz({ sheetId, gid }) {
  // P6: bỏ cache-buster t=Date.now() để cachedText có thể cache
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const txt = await cachedText(url);

  let json;
  try {
    const m = txt.match(/google\.visualization\.Query\.setResponse\((.*)\);?$/s);
    const payload = m ? m[1] : txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
    json = JSON.parse(payload);
  } catch (e) {
    console.error("GViz parse fail for gid", gid, e);
    return [];
  }

  const rawCols = (json.table?.cols || []).map((c, i) => (c?.label || c?.id || `col_${i}`).toString());

  const normKey = (s = "") =>
    s.toString()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  const alias = {
    ten: "name", name: "name", title: "name",
    gia: "price", price: "price",
    hinh: "images", hinhanh: "images", image: "images", images: "images", img: "images",
    size: "sizes", sizes: "sizes",
    price_by_size: "priceBySize", pricebysize: "priceBySize", price_by_sizes: "priceBySize",
    mo_ta: "description", mota: "description", desc: "description", description: "description",
    danh_muc: "category", category: "category",
    loai: "type", type: "type", typeid: "typeId", type_id: "typeId",
    banner: "banner",
    tag: "tags", tags: "tags",
    order: "order", sapxep: "order", thu_tu: "order", thutu: "order", sort: "order"
  };

  const cols = rawCols.map((c) => alias[normKey(c)] || normKey(c) || c);

  const rows = (json.table?.rows || []).map((r) => {
    const o = {};
    cols.forEach((key, i) => { o[key] = r.c?.[i]?.v ?? ""; });
    return o;
  });

  return rows;
}

/* ---------- util ---------- */
function slugify(s = "") {
  return s.toString()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/* ---------- Load nhiều tab sản phẩm ---------- */
export async function fetchProductsFromTabs({ sheetId, tabs, normalize, onTabDone }) {
  if (!Array.isArray(tabs) || !tabs.length) return [];

  // Tải qua hàng đợi (tối đa 4 song song nhờ queuedFetch)
  const lists = await Promise.all(
    tabs.map(async (t) => {
      try {
        const rows = await fetchGViz({ sheetId, gid: t.gid });
        const mapped = rows.map((r) => {
          // M5: thống nhất image field — fallback giống sheets.js
          const images = String(r.images || r.image || r.hinh || r.hinhanh || r.img || r["hình ảnh"] || "")
            .split(/[|,\n]/).map(s => s.trim()).filter(Boolean)
            .map(u => normalizeImageUrl(u, 700));

          const base = {
            ...r,
            images,
            _tab_gid: t.gid,
            _tab_key: t.key,
            category: r.category || r.type || t.key,
          };
          return normalize ? normalize(base) : base;
        });
        // Callback progressive: hiển sản phẩm ngay khi tab xong
        if (onTabDone) onTabDone(mapped, t);
        return mapped;
      } catch (e) {
        console.error(`[sheets.multi] Tab ${t.key} (gid=${t.gid}) fail:`, e);
        return []; // không crash toàn bộ nếu 1 tab fail
      }
    })
  );

  // gộp + chống trùng giữa các tab: id__gid
  const flat = lists.flat();
  const seen = new Set();
  const out = [];

  for (const p of flat) {
    const rawId = p.id ?? p.ID ?? p.sku ?? p.SKU ?? p.code ?? p.slug ?? "";
    const k = String(rawId).trim()
      ? `${String(rawId).trim()}__${p._tab_gid}`
      : `${slugify(String(p.name || p.title || ""))}-${p._tab_gid}`;

    if (!seen.has(k)) {
      seen.add(k);
      out.push({ ...p, _id: k });
    }
  }
  return out;
}

/* ---------- Fetch Unified Data (GAS) ---------- */
export async function fetchUnifiedData(apiUrl) {
  try {
    const res = await queuedFetch(apiUrl);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    // Chuẩn hoá sơ bộ products
    if (Array.isArray(data.products)) {
      data.products = data.products.map(p => ({
        ...p,
        images: String(p.images || p.image || "")
          .split(/[|,\n]/).map(s => s.trim()).filter(Boolean)
          .map(u => normalizeImageUrl(u, 700))
          .join(","),
      }));
    }
    return data;
  } catch (e) {
    console.error("Fetch Unified Data fail:", e);
    return null;
  }
}
