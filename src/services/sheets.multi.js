// src/services/sheets.multi.js
import { normalizeImageUrl } from "../utils/img.js";
import { cachedText } from "./cache.js";
import { getConfig } from "../utils/config.js";
import { inspectCatalogProducts } from "../lib/catalogIntegrity.js";

function isPlaceholderUrl(v = "") {
  return String(v || "").includes("...");
}

function isHttpUrl(v = "") {
  return /^https?:\/\//i.test(String(v || "").trim());
}

function isRelativeApi(v = "") {
  return String(v || "").trim().startsWith("/");
}

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const h = String(window.location?.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0";
}

function addRuntimeFreshParams(u, { force = false } = {}) {
  if (!force) return;
  u.searchParams.set("force", "1");
  u.searchParams.set("_hb", String(Date.now()));
}

export function buildUnifiedApiUrl({
  apiAllUrl = "",
  forceLocal = false,
  force = false,
  meta = false,
} = {}) {
  const raw = String(apiAllUrl || "").trim();

  let base = "";
  if (raw && !isPlaceholderUrl(raw) && (isHttpUrl(raw) || isRelativeApi(raw))) {
    base = raw;
  } else if (!raw) {
    base = "/api/all";
  }

  if (!base) return "";

  // If user uses custom remote API, do not override its query contract.
  if (isHttpUrl(base)) {
    try {
      const u = new URL(base);
      const isNativeAll = /\/api\/all$/i.test(u.pathname);
      if (!isNativeAll) return u.toString();
      addRuntimeFreshParams(u, { force });
      if (meta) u.searchParams.set("meta", "1");
      return u.toString();
    } catch {
      return "";
    }
  }

  if (isRelativeApi(base)) {
    const origin = (typeof window !== "undefined" && window.location?.origin) || "http://localhost";
    const u = new URL(base, origin);
    addRuntimeFreshParams(u, { force });
    if (meta) u.searchParams.set("meta", "1");
    return `${u.pathname}${u.search}`;
  }

  return "";
}

/* ---------- Parse env multi-tab ---------- */
export function readProductTabsFromEnv() {
  const raw0 = getConfig("product_tabs");
  const raw = raw0.trim().replace(/^['"]|['"]$/g, ""); // bỏ nháy bọc

  const tokens = raw
    .replace(/\r\n?/g, "\n")
    .split(/[;\n,]+/)           // thêm tách bằng dấu ;
    .map(s => s.trim())
    .filter(Boolean);

  const tabs = [];
  for (const tok of tokens) {
    // Format 1: GID:Label (ví dụ: 541884820:Product)
    const m1 = tok.match(/^(\d+)\s*:\s*(.+)$/);
    if (m1) { tabs.push({ gid: m1[1], key: m1[2].trim() }); continue; }
    // Format 2: Label:GID (ví dụ: Product:541884820)
    const m2 = tok.match(/^(.+?)\s*:\s*(\d+)$/);
    if (m2) { tabs.push({ gid: m2[2], key: m2[1].trim() }); continue; }
  }
  return tabs;
}




/* ---------- CSV fetch (thay GViz vì GViz tự đánh kiểu cột gây mất dữ liệu) ---------- */
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

async function fetchTabCSV({ sheetId, gid, force = false }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const txt = await cachedText(url, { force });
  const rows = parseCSV(txt.replace(/^\uFEFF/, ""));
  const rawHead = rows.shift() || [];

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
    active: "active",
    tag: "tags", tags: "tags",
    order: "order", sapxep: "order", thu_tu: "order", thutu: "order", sort: "order",
    sameday: "sameDay", same_day: "sameDay", banhtrongngay: "sameDay", banh_trong_ngay: "sameDay", trongngay: "sameDay", trong_ngay: "sameDay"
  };

  const head = rawHead.map(s => {
    const nk = normKey(String(s || "").trim());
    return alias[nk] || nk || s;
  });

  return rows
    .filter(r => r.some(x => String(x || "").trim() !== ""))
    .map(r => Object.fromEntries(head.map((h, i) => [h, String(r[i] ?? "").trim()])));
}


/* ---------- util ---------- */
function slugify(s = "") {
  return s.toString()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/* ---------- Load nhiều tab sản phẩm ---------- */
export async function fetchProductsFromTabs({
  sheetId,
  tabs,
  normalize,
  onTabDone,
  force = false,
  withDiagnostics = false,
}) {
  if (!Array.isArray(tabs) || !tabs.length) {
    const empty = {
      products: [],
      integrity: {
        complete: true,
        configuredTabs: 0,
        loadedTabs: 0,
        failedTabs: [],
        tabRows: {},
      },
    };
    return withDiagnostics ? empty : empty.products;
  }

  // Tải qua hàng đợi (tối đa 4 song song nhờ queuedFetch)
  const lists = await Promise.all(
    tabs.map(async (t) => {
      try {
        const rows = await fetchTabCSV({ sheetId, gid: t.gid, force });
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
        return { ok: true, rows: mapped, tab: t };
      } catch (e) {
        console.error(`[sheets.multi] Tab ${t.key} (gid=${t.gid}) fail:`, e);
        return {
          ok: false,
          rows: [],
          tab: t,
          error: String(e?.message || e || "tab_load_failed"),
        };
      }
    })
  );

  // gộp + chống trùng giữa các tab: id__gid
  const flat = lists.flatMap((result) => result.rows);
  const sourceInspection = inspectCatalogProducts(flat);
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
  const failedTabs = lists
    .filter((result) => !result.ok)
    .map((result) => ({
      gid: String(result.tab?.gid || ""),
      key: String(result.tab?.key || ""),
      error: result.error || "tab_load_failed",
    }));
  const tabRows = Object.fromEntries(
    lists.map((result) => [
      String(result.tab?.key || result.tab?.gid || ""),
      result.rows.length,
    ])
  );
  const snapshot = {
    products: out,
    integrity: {
      complete:
        failedTabs.length === 0 &&
        sourceInspection.missingName === 0 &&
        sourceInspection.duplicateCount === 0,
      configuredTabs: tabs.length,
      loadedTabs: lists.length - failedTabs.length,
      failedTabs,
      tabRows,
      sourceInspection,
    },
  };
  return withDiagnostics ? snapshot : snapshot.products;
}

/* ---------- Fetch Unified Data (GAS) ---------- */
export async function fetchUnifiedData(apiUrl, { force = false } = {}) {
  try {
    const url = String(apiUrl || "").trim();
    if (!url || url.includes("...")) return null;
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return null;

    const read = async (urlToRead, forceRead = false) => JSON.parse(await cachedText(urlToRead, {
      force: forceRead,
      ttlMs: 15 * 1000,
    }));

    let data = null;
    if (url.startsWith("/api/all")) {
      const ubuntuBase = "https://img.halley.io.vn/catalog/all";
      const ubuntuUrl = `${ubuntuBase}${force ? `?force=1&_hb=${Date.now()}` : ""}`;
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 2800);
        try {
          const r = await fetch(ubuntuUrl, {
            signal: ctl.signal,
            cache: force ? "no-store" : "default",
          });
          if (r.ok) {
            const parsed = JSON.parse(await r.text());
            if (Array.isArray(parsed?.products) && parsed.products.length > 0) {
              data = parsed;
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        data = null;
      }
    }
    if (!data) {
      data = await read(url, force);
      if (data?._meta?.stale && !force) {
        const freshUrl = buildUnifiedApiUrl({ apiAllUrl: url, force: true });
        data = await read(freshUrl || url, true);
      }
    }

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
    if (e?.name !== "AbortError") console.error("Fetch Unified Data fail:", e);
    return null;
  }
}
