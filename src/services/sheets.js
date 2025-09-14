/* ===================== Fetch helpers ===================== */

// gviz JSON (ổn cho tab tổng quát)
export async function fetchSheetRows({ sheetId, gid = "0" }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&t=${Date.now()}`;
  const txt = await fetch(url, { cache: "no-store" }).then((r) => r.text());
  const json = JSON.parse(txt.substring(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  const cols = json.table.cols.map((c) => (c.label || "").trim().toLowerCase());
  return (json.table.rows || []).map((r) =>
    Object.fromEntries(
      (r.c || []).map((cell, i) => [cols[i] || `col${i}`, cell?.v != null ? String(cell.v) : ""])
    )
  );
}

// CSV robust (giữ dấu phẩy/xuống dòng trong ô)
function parseCSV(text = "") {
  const out = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (ch !== "\r") { cur += ch; }
  }
  row.push(cur); out.push(row);
  return out;
}

// CSV export (ổn cho tab có dấu phẩy)
export async function fetchTabAsObjects({ sheetId, gid }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const rows = parseCSV(text.replace(/^\uFEFF/, ""));
  const head = (rows.shift() || []).map((s) => String(s || "").trim().toLowerCase());
  return rows
    .filter((r) => r.some((x) => String(x || "").trim() !== ""))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, String(r[i] ?? "").trim()])));
}

/* ===================== FB URLs ===================== */

export async function fetchFbUrls({ sheetId, gid }) {
  const rows = await fetchTabAsObjects({ sheetId, gid });
  const pick = (r) => r.url || r.fb || r.fb_url || r.post || r.link || r.col0 || r.col1 || "";
  const out = [];
  for (const r of rows) {
    String(pick(r))
      .split(/[\n,;|]/)
      .map((s) => s.trim())
      .filter((s) => /^(https?:\/\/)?((m|www)\.)?(facebook\.com|fb\.watch)\//i.test(s))
      .forEach((s) => out.push(s));
  }
  return [...new Set(out)];
}

/* ===================== Image URL ===================== */

export function normalizeImageUrl(u) {
  if (!u) return "";
  const s = String(u).trim();
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
    s.match(/uc\?id=([A-Za-z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2048`;
  if (/^https?:\/\//i.test(s)) return s;
  const base = (import.meta.env.VITE_IMAGE_BASE || "/images/").replace(/\/+$/, "") + "/";
  return encodeURI(base + s.replace(/^\/+/, ""));
}

/* ===================== Parsers ===================== */

export function parseSizesCell(cell) {
  return String(cell ?? "")
    .split(/[,;/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// "key|label" tách theo xuống dòng/;
function parseSizesPairs(s = "") {
  return String(s)
    .split(/[\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [key, label] = x.split("|");
      return { key: (key || "").trim(), label: (label || key || "").trim() };
    });
}

// danh sách size cho Type: nhận "20x20@3|Size 20x20x3cm", "12@0", "12"
function parseSizeCodesList(v = "") {
  let arr = [];
  const s = String(v).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try { arr = JSON.parse(s); } catch { arr = []; }
  } else {
    arr = s.split(/[,;|\n]+/).map(x => x.trim()).filter(Boolean);
  }
  return arr.map(x => {
    const [raw, labelOverride] = String(x).split("|");
    const [codeRaw, hRaw] = String(raw).split("@");
    const code = String(codeRaw || "").trim();
    const h = Number(hRaw || "");
    const key = Number.isFinite(h) ? `${code}-${h}` : `${code}-0`;
    let label;
    if (labelOverride && labelOverride.trim()) {
      label = labelOverride.trim().startsWith("Size")
        ? labelOverride.trim()
        : `Size ${labelOverride.trim()}`;
    } else if (Number.isFinite(h) && h > 0) {
      label = /[x×]/i.test(code) ? `Size ${code}x${h}cm` : `Size ${code}cm cao ${h}cm`;
    } else {
      label = `Size ${code}cm`;
    }
    return code ? { key, label } : null;
  }).filter(Boolean);
}

/* ===================== Mappers ===================== */

// ID ổn định khi sheet không có cột id
function makeStableId(r) {
  const id = r.id || r.ID;
  if (id) return String(id).trim();
  const name = String(r.name || "").trim().toLowerCase();
  const cat  = String(r.category || "").trim().toLowerCase();
  return name ? `${name}|${cat}` : (crypto.randomUUID?.() || String(Date.now() + Math.random()));
}

// parse "priceBySize": JSON hoặc dạng text "Size 20x20x3cm: 300k"
function parsePriceBySize(input = "") {
  const s = String(input || "").trim();
  if (!s) return {};
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" ? obj : {};
  } catch {}
  const out = {};
  const toNumber = (numStr, unit = "") => {
    let n = Number(String(numStr).replace(/\./g, "").replace(/\s/g, ""));
    const u = unit.toLowerCase();
    if (/k|ngh?ìn|ngan/.test(u)) n *= 1000;
    if (/tr|triệu/.test(u)) n *= 1_000_000;
    return Number.isFinite(n) ? n : 0;
  };
  for (const raw of s.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean)) {
    const line = raw.replace(/×/g, "x").toLowerCase();
    let code = null, h = 0, m;
    if ((m = line.match(/(\d{1,2}\s*x\s*\d{1,2})\s*x\s*(\d{1,2})\s*cm/))) {
      code = m[1].replace(/\s+/g, "").replace(/x+/g, "x"); h = Number(m[2]);
    } else if ((m = line.match(/(\d{1,2})\s*cm/))) {
      code = m[1]; h = 0;
    } else { continue; }
    const rhs = line.split(":").slice(1).join(":").trim() || line;
    const pm = rhs.match(/([\d\.]+)\s*([a-zA-ZÀ-ỹ]*)/i);
    if (!pm) continue;
    const price = toNumber(pm[1], pm[2] || "");
    if (price <= 0) continue;
    out[`${code}-${h}`] = price;
  }
  return out;
}

export function mapProducts(rows = [], imageIndex) {
  const norm = (s) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const parseImages = (s) =>
    String(s || "").split(/\s*[|,\n]\s*/).filter(Boolean).map(normalizeImageUrl);

  const byName = (name) => {
    if (!imageIndex) return [];
    const k = norm(name);
    const exact = imageIndex.map.get(k) || [];
    if (exact.length) return exact;
    const pref = [...imageIndex.map.keys()].filter(
      (x) => x.startsWith(k + " ") || x.startsWith(k + "-")
    );
    return pref.flatMap((x) => imageIndex.map.get(x) || []);
  };

  return rows
    .map((r) => {
      let images = parseImages(r.images);
      if (!images.length && r.name) images = byName(r.name);

      const nPrice = Number(String(r.price || "").replace(/[^\d.]/g, ""));
      const price = Number.isFinite(nPrice) && nPrice > 0 ? nPrice : null;

      return {
        id: makeStableId(r),
        name: r.name || "",
        category: String(r.category || "").trim(),
        typeId: r.typeid || r.type || "",
        images,
        banner: /^(1|true|yes|x)$/i.test(r.banner || ""),
        tags: String(r.tags || "").split(/\s*,\s*/).filter(Boolean),
        price,
        sizes: parseSizesCell(r.sizes ?? r.size ?? r.Sizes ?? r.Size),
        priceBySize: parsePriceBySize(r.pricebysize ?? r.priceBySize),
        // FIX: dùng r, không phải row
        desc: String(r.description || r.desc || "").trim(),
        description: String(r.description || r.desc || "").trim(),
      };
    })
    .filter((p) => p.name);
}

// Sizes meta (không dedupe theo code; key = `${code}-${height}`)
export function mapSizes(rows = []) {
  const S = v => (v == null ? "" : String(v).trim());
  const out = [];
  for (const r of rows) {
    let code = S(r.code ?? r.Code);
    let label = S(r.label ?? r.Label);
    let height = Number(r.height ?? r.Height ?? NaN);
    const createdAt = r.createdAt ?? r.CreatedAt ?? null;

    if (!Number.isFinite(height)) {
      if (code.includes("@")) {
        const [c, h] = code.split("@"); const n = Number(h);
        if (Number.isFinite(n)) { height = n; code = S(c); }
      } else if (/@(\d+)/.test(label)) {
        height = Number(RegExp.$1);
      }
    }

    if (!code) continue;
    if (!label) label = `Size ${code}`;
    if (!Number.isFinite(height)) height = 0;

    const key = `${code}-${height}`;
    const id = S(r.id ?? r.ID) || key;

    out.push({ id, code, label, height: Number(height), key, createdAt });
  }

  const num = v => (/^\d+$/.test(v) ? Number(v) : NaN);
  out.sort((a, b) => {
    const na = num(a.code), nb = num(b.code);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
      return a.height - b.height;
    }
    const c = a.code.localeCompare(b.code, "vi");
    if (c !== 0) return c;
    return a.height - b.height;
  });
  return out;
}

export const mapCategories = (rows = []) =>
  rows.filter((r) => r.key).map((r) => ({ key: r.key, title: r.title || r.key }));

export const mapTags = (rows = []) =>
  rows
    .filter((r) => r.id || r.label)
    .map((r) => ({
      id: r.id || (r.label || "").toLowerCase().replace(/\s+/g, "-"),
      label: r.label || r.id,
    }));

export function mapLevels(rows = []) {
  const parsePricesObj = (v) => {
    if (!v) return {};
    if (typeof v === "object") return v;
    try { const o = JSON.parse(String(v)); return o && typeof o === "object" ? o : {}; }
    catch { return {}; }
  };
  return rows
    .map(r => ({
      id: r.id || r.key || r.name,
      name: r.name || r.title,
      schemeId: r.schemeid || r.schemeId || "",
      prices: parsePricesObj(r.prices || r.priceTable || r.price_by_size)
    }))
    .filter(l => l.id);
}

/* ---- helpers ---- */
function labelFromKey(key) {
  const m = String(key).match(/^(.+)-(\d+)$/);
  if (!m) return { key: String(key), label: `Size ${key}` };
  const code = m[1], h = Number(m[2]);
  const label =
    h > 0
      ? (/[x×]/i.test(code) ? `Size ${code}x${h}cm` : `Size ${code}cm cao ${h}cm`)
      : `Size ${code}cm`;
  return { key: `${code}-${h}`, label };
}

export const mapPages = (rows = []) =>
  rows.filter((r) => r.key).map((r) => ({ key: r.key, title: r.title || r.key, body: r.body || "" }));

export const mapMenu = (rows = []) => {
  const items = rows.filter((r) => r.key).map((r) => ({
    key: r.key,
    title: r.label || r.title || r.key,
    parent: r.parent || "",
    order: Number(r.order || 0),
  }));
  const byKey = Object.fromEntries(items.map((i) => [i.key, { ...i, children: [] }]));
  const roots = [];
  items.forEach((i) => {
    if (i.parent && byKey[i.parent]) byKey[i.parent].children.push(byKey[i.key]);
    else roots.push(byKey[i.key]);
  });
  const sortTree = (nodes) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);
  const clean = (n) => ({ key: n.key, title: n.title, children: n.children.map(clean) });
  return roots.map(clean);
};

export function mapTypes(rows = []) {
  return rows
    .filter(r => r.id || r.key || r.code)
    .map(r => {
      const items = parseSizeCodesList(r.sizecodes ?? r.sizeCodes ?? r.sizes ?? "");
      return {
        id: String(r.id ?? r.key ?? r.code).trim(),
        code: String(r.code ?? r.key ?? r.id).trim(),
        name: String(r.name ?? r.title ?? r.code ?? r.id).trim(),
        sizes: items.map(x => x.key),
        schemeId: r.schemeid || r.schemeId || r.scheme || "",
        order: Number(r.order || 0),
      };
    })
    .sort((a, b) => a.order - b.order);
}

export function sizesForProduct(product, types = []) {
  const t = types.find(x =>
    x.id === product?.typeId ||
    x.id === product?.type   ||
    x.code === product?.type ||
    x.code === product?.typeId
  );
  const typeSizesRaw = t?.sizes || [];
  const typeSizes = typeSizesRaw.map(s => (s && typeof s === "object" && s.key) ? s : labelFromKey(s));

  if (product?.sizes?.length) {
    const set = new Set(
      product.sizes.map(s => {
        const [c, h] = String(s).split("@");
        const n = Number(h);
        return Number.isFinite(n) ? `${c}-${n}` : String(s);
      })
    );
    return typeSizes.filter((sz) => set.has(String(sz.key)));
  }
  return typeSizes;
}

export function enrichProductPricing(p, types = [], levels = []) {
  const type = types.find(t => t.id === (p.typeId || p.type) || t.code === (p.typeId || p.type)) || null;
  const schemeId = type?.schemeId || null;
  const level = schemeId ? levels.find(l => l.schemeId === schemeId) : null;

  // chuẩn hoá priceBySize: "10" -> "10-0", loại giá <= 0
  const pbRaw = p.priceBySize || {};
  const pb = {};
  for (const [k, v] of Object.entries(pbRaw)) {
    const key = /^\d+$/.test(k) ? `${k}-0` : String(k).trim();
    const num = Number(v);
    if (Number.isFinite(num) && num > 0) pb[key] = num;
  }

  const keysFromPB = Object.keys(pb);
  const keysFromProduct = Array.isArray(p.sizes) && p.sizes.length
    ? p.sizes.map(s => {
        const [c,h] = String(s).split("@");
        const n = Number(h);
        return Number.isFinite(n) ? `${c}-${n}` : `${s}-0`;
      })
    : [];
  const keysFromLevel = Object.keys(level?.prices || {});
  const keys = (keysFromPB.length ? keysFromPB :
               (keysFromProduct.length ? keysFromProduct : keysFromLevel));

  const typeSizes = (type ? type.sizes : []).map(s => (s && typeof s === "object") ? s : labelFromKey(s));
  const sizeDict = new Map(typeSizes.map(s => [s.key, s]));

  const table = [...new Set(keys)]
    .map(k => {
      const meta = sizeDict.get(k) || labelFromKey(k);
      const val = pb[k] ?? level?.prices?.[k] ?? null;
      const num = Number(val);
      return { key: k, label: meta.label, price: Number.isFinite(num) && num > 0 ? num : null };
    })
    .filter(r => r.price != null);

  return { ...p, pricing: { schemeId, table } };
}

export function mapSchemes(rows = []) {
  return rows.filter((r) => r.id || r.key).map((r) => ({
    id: String(r.id ?? r.key).trim(),
    name: String(r.name ?? r.title ?? r.id).trim(),
    sizes: parseSizesPairs(r.sizes || ""),
  }));
}

export const mapAnnouncements = (rows = []) => {
  const now = Date.now();
  const toTs = s => {
    const t = Date.parse(String(s||"").trim());
    return Number.isFinite(t) ? t : null;
  };
  return rows
    .map(r => ({
      text: String(r.text || r.message || "").trim(),
      active: /^(1|true|yes|x)$/i.test(String(r.active||"")),
      order: Number(r.order || 0),
      start: toTs(r.start || r.from),
      end: toTs(r.end || r.until),
    }))
    .filter(x => x.text && x.active)
    .filter(x => (x.start ? now >= x.start : true) && (x.end ? now <= x.end : true))
    .sort((a,b) => a.order - b.order)
    .map(x => x.text);
};
