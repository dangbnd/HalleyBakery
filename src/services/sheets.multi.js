// src/services/sheets.multi.js

/* -------------------------------------------------------
   Multi-tab loader for product sheets (robust version)
   - VITE_PRODUCT_TABS supports commas or newlines
     Format per item:  <gid>:<label>
   - Example:
     VITE_PRODUCT_TABS=1320694377:100k,1704842938:Basic
     or
     VITE_PRODUCT_TABS="1320694377:100k
                         1704842938:Basic"
------------------------------------------------------- */

/** Parse env VITE_PRODUCT_TABS → [{ gid, key }] */
export function readProductTabsFromEnv() {
  const raw0 = String(import.meta.env?.VITE_PRODUCT_TABS || "");
  // cắt khoảng trắng và NHÁY bọc 2 đầu
  const raw = raw0.trim().replace(/^['"]|['"]$/g, "");

  // cho phép xuống dòng hoặc dấu phẩy
  const tokens = raw
    .replace(/\r\n?/g, "\n")
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const tabs = [];
  for (const tok of tokens) {
    const m = tok.match(/^(\d+)\s*:\s*(.+)$/);  // <gid>:<label>
    if (!m) continue;
    tabs.push({ gid: m[1], key: m[2].trim() });
  }
  return tabs;
}


/** Read a Google Sheet tab using the GViz endpoint */
/** Read a Google Sheet tab using the GViz endpoint */
async function fetchGViz({ sheetId, gid }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&t=${Date.now()}`;
  const txt = await fetch(url, { cache: "no-store" }).then((r) => r.text());

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

  // chuẩn hóa tên cột: bỏ dấu, lower-case, thay khoảng trắng bằng "_"
  const normKey = (s="") =>
    s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
     .toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");

  // ánh xạ synonym -> key chuẩn app dùng
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
    tag: "tags", tags: "tags"
  };

  const cols = rawCols.map((c) => {
    const nk = normKey(c);
    return alias[nk] || nk || c;
  });

  const rows = (json.table?.rows || []).map((r) => {
    const o = {};
    cols.forEach((key, i) => { o[key] = r.c?.[i]?.v ?? ""; });
    return o;
  });

  return rows;
}

function slugify(s = "") {
  return s
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * Load products from multiple tabs.
 * Each record gets:
 *  - _tab_gid: gid string
 *  - _tab_key: label from env
 *  - category: keep existing category/type or fallback to tab label
 *  - _id: stable dedup id
 */
export async function fetchProductsFromTabs({ sheetId, tabs, normalize }) {
  if (!Array.isArray(tabs) || !tabs.length) return [];

  // Fetch all tabs in parallel
  const lists = await Promise.all(
    tabs.map(async (t) => {
      const rows = await fetchGViz({ sheetId, gid: t.gid });
      return rows.map((r) => {
        const base = {
          ...r,
          _tab_gid: t.gid,
          _tab_key: t.key,
          category: r.category || r.type || t.key,
        };
        return normalize ? normalize(base) : base;
      });
    })
  );
  // Flatten and de-duplicate  ✅ include _tab_gid to avoid cross-tab collisions
  const flat = lists.flat();
  const seen = new Set();
  const out = [];

  for (const p of flat) {
    const rawId =
      p.id ?? p.ID ?? p.sku ?? p.SKU ?? p.code ?? p.slug ?? "";

    let k;
    if (String(rawId).trim()) {
      // id của từng tab có thể trùng nhau -> gắn gid
      k = `${String(rawId).trim()}__${p._tab_gid}`;
    } else {
      const base = String(p.name || p.title || "");
      k = `${slugify(base)}-${p._tab_gid}`;
    }

    if (!seen.has(k)) {
      seen.add(k);
      out.push({ ...p, _id: k });
    }
  }

return out;
}
