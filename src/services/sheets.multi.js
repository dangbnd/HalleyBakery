// src/services/sheets.multi.js

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

/* ---------- Ảnh Drive → thumbnail ---------- */
export function normalizeImageUrl(u, max = 700) {
  if (!u) return "";
  const s = String(u).trim();
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
    s.match(/uc\?[^#?]*id=([A-Za-z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${max}`;
  if (/^https?:\/\//i.test(s)) return s;
  const base = (import.meta.env.VITE_IMAGE_BASE || "/images/").replace(/\/+$/, "") + "/";
  return encodeURI(base + s.replace(/^\/+/, ""));
}

/* ---------- GViz fetch + chuẩn hoá cột ---------- */
async function fetchGViz({ sheetId, gid }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&t=${Date.now()}`;
  const txt = await fetch(url, { cache: "no-store" }).then(r => r.text());

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
    tag: "tags", tags: "tags"
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
export async function fetchProductsFromTabs({ sheetId, tabs, normalize }) {
  if (!Array.isArray(tabs) || !tabs.length) return [];

  // tải song song các tab
  const lists = await Promise.all(
    tabs.map(async (t) => {
      const rows = await fetchGViz({ sheetId, gid: t.gid });
      return rows.map((r) => {
        // chuẩn hoá ảnh NGAY tại đây nếu muốn nhỏ hơn
        const images = String(r.images || r.image || "")
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
