// api/all.js - Unified data endpoint with short in-memory cache.
import { promises as fs } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

const CACHE_TTL_MS = 30 * 1000; // fresh 30s
const STALE_MS = 0; // do not serve stale catalog data during normal refreshes
const FETCH_TIMEOUT_MS = 7000;
const CACHE_ROOT =
  process.env.VERCEL_DEV === "1"
    ? join(process.cwd(), ".cache")
    : join(tmpdir(), "halley-bakery-cache");

const CACHE = new Map(); // key -> { data, refreshedAt, version }
const INFLIGHT = new Map(); // key -> Promise

function isTruthy(v) {
  return /^(1|true|yes|on)$/i.test(String(v || "").trim());
}

function normalizeSheetId(input = "") {
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  const cleaned = s.replace(/^['"]|['"]$/g, "");
  const m2 = cleaned.match(/^([a-zA-Z0-9-_]{10,})/);
  return m2 ? m2[1] : cleaned;
}

function normalizeGid(v = "") {
  const s = String(v || "").trim();
  const m = s.match(/(\d{1,})/);
  return m ? m[1] : "";
}

function normalizeText(s = "") {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseProductTabs(raw = "", gidFallback = "") {
  const out = [];
  const src = String(raw || "").trim();
  const toks = src
    .replace(/\r\n?/g, "\n")
    .split(/[;\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const tok of toks) {
    const m1 = tok.match(/^(\d+)\s*:\s*(.+)$/);
    if (m1) {
      out.push({ gid: normalizeGid(m1[1]), key: String(m1[2] || "product").trim() || "product" });
      continue;
    }
    const m2 = tok.match(/^(.+?)\s*:\s*(\d+)$/);
    if (m2) {
      out.push({ gid: normalizeGid(m2[2]), key: String(m2[1] || "product").trim() || "product" });
      continue;
    }
  }

  const dedup = [];
  const seen = new Set();
  for (const t of out) {
    if (!t.gid || seen.has(t.gid)) continue;
    seen.add(t.gid);
    dedup.push(t);
  }
  if (!dedup.length && gidFallback) dedup.push({ gid: normalizeGid(gidFallback), key: "product" });
  return dedup;
}

function pickFirst(row, keys = []) {
  for (const k of keys) {
    if (!(k in row)) continue;
    const v = row[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function compactObject(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    const s = typeof v === "string" ? v.trim() : String(v).trim();
    if (!s) continue;
    out[k] = typeof v === "string" ? s : v;
  }
  return out;
}

function normalizeProductRow(row = {}, tab = { gid: "", key: "" }) {
  const item = {
    id: pickFirst(row, ["id", "ID", "ma", "masp", "masanpham", "code", "sku"]),
    name: pickFirst(row, ["name", "title", "ten", "ten_san_pham"]),
    category: pickFirst(row, ["category", "danh_muc", "loai", "type"]) || tab.key,
    category_aliases: pickFirst(row, ["category_aliases", "categoryaliases", "category_alias", "category_aliases_keys", "category_keys", "categorykeys", "categories"]),
    type: pickFirst(row, ["type"]),
    typeid: pickFirst(row, ["typeid", "type_id"]),
    images: pickFirst(row, ["images", "image", "hinh", "hinhanh", "img"]),
    price: pickFirst(row, ["price", "gia"]),
    sizes: pickFirst(row, ["sizes", "size"]),
    priceBySize: pickFirst(row, ["priceBySize", "pricebysize", "price_by_size"]),
    pricebysize: pickFirst(row, ["pricebysize", "priceBySize", "price_by_size"]),
    tags: pickFirst(row, ["tags", "tag"]),
    banner: pickFirst(row, ["banner", "active"]),
    active: pickFirst(row, ["active", "banner"]),
    visibility: pickFirst(row, ["visibility", "show", "hienthi"]),
    priceVisibility: pickFirst(row, ["priceVisibility", "pricevisibility", "showPrice", "showprice", "show_price", "hienGia"]),
    description: pickFirst(row, ["description", "desc", "mota", "mo_ta"]),
    desc: pickFirst(row, ["desc", "description", "mota", "mo_ta"]),
    descriptionVisibility: pickFirst(row, [
      "descriptionVisibility",
      "descriptionvisibility",
      "descVisibility",
      "descvisibility",
      "showDesc",
      "showdesc",
      "showDescription",
      "showdescription",
      "hienMoTa",
      "hien_thi_mo_ta",
    ]),
    order: pickFirst(row, ["order", "thu_tu", "sapxep"]),
    popular: pickFirst(row, ["popular", "hot"]),
    createdAt: pickFirst(row, ["createdAt", "created_at", "created"]),
    _tab_gid: tab.gid,
    _tab_key: tab.key,
  };
  return compactObject(item);
}

function parseCSV(text = "") {
  const out = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") {
      cur += ch;
    }
  }
  row.push(cur);
  out.push(row);
  return out;
}

function normalizeHeader(h = "") {
  const n = normalizeText(h).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const alias = {
    ten: "name",
    tennsp: "name",
    tennsanpham: "name",
    gia: "price",
    hinh: "images",
    hinhanh: "images",
    image: "images",
    img: "images",
    danh_muc: "category",
    loai: "type",
    mota: "description",
    mo_ta: "description",
    thong_bao: "text",
    noi_dung: "content",
  };
  return alias[n] || n || String(h || "").trim();
}

async function fetchCsvTab({ sheetId, gid }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&_hb=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const raw = String(text || "").replace(/^\uFEFF/, "");
    const trimmed = raw.trimStart();
    if (!contentType.includes("csv") && /^<!doctype html|^<html\b/i.test(trimmed)) {
      throw new Error(`Expected CSV export, received HTML for gid=${gid}`);
    }
    const rows = parseCSV(raw);
    const rawHead = rows.shift() || [];
    if (!rawHead.some((cell) => String(cell || "").trim())) {
      throw new Error(`Empty CSV header for gid=${gid}`);
    }
    const head = rawHead.map(normalizeHeader);
    return rows
      .filter((r) => r.some((x) => String(x || "").trim() !== ""))
      .map((r) => Object.fromEntries(head.map((h, i) => [h, String(r[i] ?? "").trim()])));
  } finally {
    clearTimeout(timer);
  }
}

function pickGid(cfg, key) {
  return normalizeGid(cfg[key] || "");
}

async function loadUnifiedFromSheet(cfg) {
  const sheetId = normalizeSheetId(cfg.sheetId);
  if (!sheetId) throw new Error("Missing sheetId");

  const tabs = parseProductTabs(cfg.productTabs, cfg.gidProducts);
  if (!tabs.length) throw new Error("Missing product tabs");

  const plans = [];

  plans.push(
    Promise.all(
      tabs.map(async (t) => {
        try {
          const rows = await fetchCsvTab({ sheetId, gid: t.gid });
          return {
            ok: true,
            rows: rows.map((r) => normalizeProductRow(r, t)),
          };
        } catch (error) {
          return {
            ok: false,
            rows: [],
            error: error?.message || `Failed to load tab ${t.key}`,
            tab: t,
          };
        }
      })
    ).then((all) => {
      const successful = all.filter((x) => x.ok);
      if (!successful.length) {
        const reason =
          all
            .filter((x) => !x.ok)
            .map((x) => x.error)
            .filter(Boolean)
            .join("; ") || "No product tab could be loaded";
        throw new Error(reason);
      }
      return { key: "products", value: successful.flatMap((x) => x.rows) };
    })
  );

  const singleTabs = [
    ["menu", pickGid(cfg, "gidMenu")],
    ["pages", pickGid(cfg, "gidPages")],
    ["announcements", pickGid(cfg, "gidAnnouncements")],
    ["categories", pickGid(cfg, "gidCategories")],
    ["tags", pickGid(cfg, "gidTags")],
    ["types", pickGid(cfg, "gidTypes")],
    ["levels", pickGid(cfg, "gidLevels")],
    ["sizes", pickGid(cfg, "gidSizes")],
    ["fb", pickGid(cfg, "gidFb")],
  ];

  for (const [name, gid] of singleTabs) {
    if (!gid) continue;
    plans.push(
      fetchCsvTab({ sheetId, gid })
        .then((rows) => ({ key: name, value: rows }))
        .catch(() => ({ key: name, value: [] }))
    );
  }

  const settled = await Promise.all(plans);
  const out = Object.fromEntries(settled.map((x) => [x.key, x.value]));

  for (const key of [
    "products",
    "menu",
    "pages",
    "announcements",
    "categories",
    "tags",
    "types",
    "levels",
    "sizes",
    "fb",
  ]) {
    if (!Array.isArray(out[key])) out[key] = [];
  }

  return out;
}

function cfgFromRequest(req) {
  const q = req.query || {};
  return {
    sheetId: normalizeSheetId(q.sheetId || process.env.OG_SHEET_ID || process.env.VITE_SHEET_ID || ""),
    productTabs: String(q.productTabs || process.env.OG_PRODUCT_TABS || process.env.VITE_PRODUCT_TABS || "").trim(),
    gidProducts: normalizeGid(q.gidProducts || q.gid_products || process.env.VITE_SHEET_GID_PRODUCTS || ""),
    gidMenu: normalizeGid(q.gidMenu || q.gid_menu || process.env.OG_MENU_GID || process.env.VITE_SHEET_GID_MENU || ""),
    gidPages: normalizeGid(q.gidPages || q.gid_pages || process.env.VITE_SHEET_GID_PAGES || ""),
    gidAnnouncements: normalizeGid(q.gidAnnouncements || q.gid_announcements || process.env.VITE_SHEET_GID_ANNOUNCEMENTS || ""),
    gidCategories: normalizeGid(q.gidCategories || q.gid_categories || process.env.VITE_SHEET_GID_CATEGORIES || ""),
    gidTags: normalizeGid(q.gidTags || q.gid_tags || process.env.VITE_SHEET_GID_TAGS || ""),
    gidTypes: normalizeGid(q.gidTypes || q.gid_types || process.env.VITE_SHEET_GID_TYPES || ""),
    gidLevels: normalizeGid(q.gidLevels || q.gid_levels || process.env.VITE_SHEET_GID_LEVELS || ""),
    gidSizes: normalizeGid(q.gidSizes || q.gid_sizes || process.env.VITE_SHEET_GID_SIZES || ""),
    gidFb: normalizeGid(q.gidFb || q.gid_fb || process.env.VITE_SHEET_GID_FB || ""),
  };
}

function cacheKey(cfg) {
  return JSON.stringify({
    sheetId: cfg.sheetId,
    productTabs: cfg.productTabs,
    gidProducts: cfg.gidProducts,
    gidMenu: cfg.gidMenu,
    gidPages: cfg.gidPages,
    gidAnnouncements: cfg.gidAnnouncements,
    gidCategories: cfg.gidCategories,
    gidTags: cfg.gidTags,
    gidTypes: cfg.gidTypes,
    gidLevels: cfg.gidLevels,
    gidSizes: cfg.gidSizes,
    gidFb: cfg.gidFb,
  });
}

function cacheFilePath(key) {
  const hash = createHash("sha1").update(String(key || "")).digest("hex");
  return join(CACHE_ROOT, `api-all-${hash}.json`);
}

async function readDiskCache(key) {
  try {
    const file = cacheFilePath(key);
    const txt = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(txt);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.refreshedAt || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(key, entry) {
  try {
    await fs.mkdir(CACHE_ROOT, { recursive: true });
    const file = cacheFilePath(key);
    await fs.writeFile(file, JSON.stringify(entry), "utf8");
  } catch {
    // no-op: disk cache is best effort
  }
}

function withMeta(entry, opts = {}) {
  const now = Date.now();
  const ageMs = entry ? Math.max(0, now - entry.refreshedAt) : 0;
  return {
    ok: true,
    _meta: {
      refreshedAt: entry ? new Date(entry.refreshedAt).toISOString() : "",
      ageMs,
      ttlMs: CACHE_TTL_MS,
      staleWindowMs: STALE_MS,
      fromCache: !!opts.fromCache,
      stale: !!opts.stale,
      version: entry?.version || 0,
    },
    ...(opts.metaOnly ? {} : entry?.data),
  };
}

function countItems(v) {
  return Array.isArray(v) ? v.length : 0;
}

function hasAnyUnifiedContent(data = {}) {
  return [
    "products",
    "menu",
    "pages",
    "announcements",
    "categories",
    "tags",
    "types",
    "levels",
    "sizes",
    "fb",
  ].some((key) => countItems(data?.[key]) > 0);
}

function shouldRejectRefresh(nextData, prevEntry) {
  const nextProducts = countItems(nextData?.products);
  if (nextProducts > 0) return false;

  const prevProducts = countItems(prevEntry?.data?.products);
  if (prevProducts > 0) return true;

  return !hasAnyUnifiedContent(nextData);
}

function refreshCache(key, cfg) {
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);
  const p = loadUnifiedFromSheet(cfg)
    .then((data) => {
      const current = CACHE.get(key);
      if (shouldRejectRefresh(data, current)) {
        throw new Error("Suspicious empty unified payload");
      }
      const version = (current?.version || 0) + 1;
      const next = { data, refreshedAt: Date.now(), version };
      CACHE.set(key, next);
      writeDiskCache(key, next).catch(() => {});
      return next;
    })
    .finally(() => {
      INFLIGHT.delete(key);
    });
  INFLIGHT.set(key, p);
  return p;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const cfg = cfgFromRequest(req);
    const key = cacheKey(cfg);
    const now = Date.now();

    const force = isTruthy(req.query?.force);
    const metaOnly = isTruthy(req.query?.meta);

    if (!cfg.sheetId) {
      return res.status(400).json({ ok: false, error: "Missing sheetId" });
    }

    let hit = CACHE.get(key);
    if (!hit) {
      const disk = await readDiskCache(key);
      if (disk) {
        CACHE.set(key, disk);
        hit = disk;
      }
    }
    if (!force && hit) {
      const age = now - hit.refreshedAt;
      if (age <= CACHE_TTL_MS) {
        return res.status(200).json(withMeta(hit, { fromCache: true, metaOnly }));
      }
      if (STALE_MS > 0 && age <= CACHE_TTL_MS + STALE_MS) {
        refreshCache(key, cfg).catch(() => {});
        return res.status(200).json(withMeta(hit, { fromCache: true, stale: true, metaOnly }));
      }
    }

    const refreshed = await refreshCache(key, cfg);
    return res.status(200).json(withMeta(refreshed, { fromCache: false, metaOnly }));
  } catch (e) {
    const cfg = cfgFromRequest(req);
    const key = cacheKey(cfg);
    const stale = CACHE.get(key);
    if (stale) return res.status(200).json(withMeta(stale, { fromCache: true, stale: true }));
    return res.status(502).json({ ok: false, error: e?.message || "Failed to load unified data" });
  }
}
