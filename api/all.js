// api/all.js - Unified data endpoint with short in-memory cache.
import { promises as fs } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { inspectCatalogProducts } from "../src/lib/catalogIntegrity.js";
import { coercePriceBySizeMap, normalizeSizeKey } from "../src/lib/pricing.js";
import { tagKey, toTagArray } from "../src/utils/tagKey.js";
import { readPublicRuntimeConfig } from "./runtime-config.js";

const CACHE_TTL_MS = 30 * 1000; // fresh 30s
const STALE_MS = 0; // do not serve stale catalog data during normal refreshes
const MAX_ERROR_STALE_MS = 2 * 60 * 60 * 1000;
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

export function normalizeProductRow(row = {}, tab = { gid: "", key: "" }) {
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
    banner: pickFirst(row, ["banner"]),
    active: pickFirst(row, ["active"]),
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
    sameDay: pickFirst(row, ["sameDay", "sameday", "same_day", "banhTrongNgay", "banhtrongngay", "banh_trong_ngay", "trongNgay", "trongngay", "trong_ngay"]),
    inStock: pickFirst(row, ["inStock", "instock", "in_stock", "available", "con_hang"]),
    stockQuantity: pickFirst(row, ["stockQuantity", "stock_quantity", "quantity", "so_luong", "soluong"]),
    level: pickFirst(row, ["level", "level_id", "levelid", "cap_do"]),
    createdAt: pickFirst(row, ["createdAt", "createdat", "created_at", "created"]),
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

export async function fetchCsvTab({ sheetId, gid }) {
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

export function deriveCatalogMetadata(data = {}) {
  const out = { ...data };
  const products = Array.isArray(out.products) ? out.products : [];
  const menu = Array.isArray(out.menu) ? out.menu : [];
  const menuLabels = new Map();
  for (const item of menu) {
    const key = String(item?.key || item?.slug || item?.code || "").trim();
    if (!key) continue;
    menuLabels.set(key, String(item?.label || item?.title || item?.name || key).trim());
  }

  if (!Array.isArray(out.categories) || !out.categories.length) {
    const categories = new Map();
    for (const product of products) {
      const key = String(product?.category || product?._tab_key || "").trim();
      if (!key || categories.has(key)) continue;
      categories.set(key, {
        key,
        title: menuLabels.get(key) || key,
      });
    }
    out.categories = [...categories.values()];
  }

  if (!Array.isArray(out.tags) || !out.tags.length) {
    const tags = new Map();
    for (const product of products) {
      for (const label of toTagArray(product?.tags)) {
        const key = tagKey(label);
        if (!key || tags.has(key)) continue;
        tags.set(key, { key, label });
      }
    }
    out.tags = [...tags.values()];
  }

  if (!Array.isArray(out.sizes) || !out.sizes.length) {
    const sizes = new Map();
    const addSize = (value) => {
      const key = normalizeSizeKey(value);
      if (!key || sizes.has(key)) return;
      const match = key.match(/^(.+)-(\d+)$/);
      const code = match?.[1] || key;
      const height = Number(match?.[2] || 0);
      const label = height > 0
        ? `Size ${code}x${height}cm`
        : `Size ${code}cm`;
      sizes.set(key, { id: key, key, code, height, label });
    };
    for (const product of products) {
      Object.keys(coercePriceBySizeMap(product?.priceBySize)).forEach(addSize);
      const declared = Array.isArray(product?.sizes)
        ? product.sizes
        : String(product?.sizes || "").split(/[|,;\n]+/);
      declared.forEach((size) => addSize(
        typeof size === "object" ? size?.key || size?.id || size?.code || size?.label : size
      ));
    }
    out.sizes = [...sizes.values()];
  }

  if (!Array.isArray(out.levels) || !out.levels.length) {
    const levels = new Map();
    for (const product of products) {
      const id = String(product?.level || "").trim();
      if (id && !levels.has(id)) levels.set(id, { id, name: id });
    }
    out.levels = [...levels.values()];
  }

  if (!Array.isArray(out.types) || !out.types.length) {
    const types = new Map();
    for (const product of products) {
      const id = String(product?.typeid || product?.type || "").trim();
      if (id && !types.has(id)) types.set(id, { id, code: id, name: id });
    }
    out.types = [...types.values()];
  }

  return out;
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
            tab: t,
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
      const products = all.flatMap((result) => result.rows);
      const sourceInspection = inspectCatalogProducts(products);
      const failedTabs = all
        .filter((result) => !result.ok)
        .map((result) => ({
          gid: String(result.tab?.gid || ""),
          key: String(result.tab?.key || ""),
          error: result.error || "tab_load_failed",
        }));
      return {
        key: "products",
        value: products,
        ok:
          failedTabs.length === 0 &&
          sourceInspection.missingName === 0 &&
          sourceInspection.duplicateCount === 0,
        integrity: {
          complete:
            failedTabs.length === 0 &&
            sourceInspection.missingName === 0 &&
            sourceInspection.duplicateCount === 0,
          configuredTabs: tabs.length,
          loadedTabs: all.length - failedTabs.length,
          failedTabs,
          tabRows: Object.fromEntries(
            all.map((result) => [
              String(result.tab?.key || result.tab?.gid || ""),
              result.rows.length,
            ])
          ),
          sourceInspection,
        },
      };
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
  ];

  for (const [name, gid] of singleTabs) {
    if (!gid) continue;
    plans.push(
      fetchCsvTab({ sheetId, gid })
        .then((rows) => ({ key: name, value: rows, ok: true }))
        .catch((error) => ({
          key: name,
          value: [],
          ok: false,
          error: String(error?.message || error || "tab_load_failed"),
        }))
    );
  }

  const settled = await Promise.all(plans);
  const out = Object.fromEntries(settled.map((x) => [x.key, x.value]));
  const productResult = settled.find((result) => result.key === "products");
  const sectionResults = Object.fromEntries(
    settled
      .filter((result) => result.key !== "products")
      .map((result) => [
        result.key,
        {
          ok: result.ok !== false,
          count: Array.isArray(result.value) ? result.value.length : 0,
          error: result.error || "",
        },
      ])
  );

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
  ]) {
    if (!Array.isArray(out[key])) out[key] = [];
  }

  const enrichedOut = deriveCatalogMetadata(out);
  enrichedOut._integrity = {
    productTabs: productResult?.integrity || {
      complete: false,
      configuredTabs: tabs.length,
      loadedTabs: 0,
      failedTabs: [],
      tabRows: {},
    },
    sections: sectionResults,
  };

  return enrichedOut;
}

export function cfgFromRequest(req, env = process.env) {
  const q = req.query || {};
  const configuredSheetId = normalizeSheetId(env.OG_SHEET_ID || env.VITE_SHEET_ID || "");
  const requestedSheetId = normalizeSheetId(q.sheetId || "");
  const useRequestConfig = !configuredSheetId && env.VERCEL_DEV === "1";
  const configuredProductTabs = String(
    env.OG_PRODUCT_TABS || env.VITE_PRODUCT_TABS || ""
  ).trim();
  const configuredGid = (name) => normalizeGid(env[name] || "");
  const requestGid = (...names) => {
    if (!useRequestConfig) return "";
    for (const name of names) {
      const gid = normalizeGid(q[name] || "");
      if (gid) return gid;
    }
    return "";
  };
  return {
    sheetId: configuredSheetId || (useRequestConfig ? requestedSheetId : ""),
    configuredSheetId,
    requestedSheetId,
    productTabs: configuredProductTabs || (useRequestConfig ? String(q.productTabs || "").trim() : ""),
    gidProducts: configuredGid("VITE_SHEET_GID_PRODUCTS") || requestGid("gidProducts", "gid_products"),
    gidMenu:
      configuredGid("OG_MENU_GID") ||
      configuredGid("VITE_SHEET_GID_MENU") ||
      requestGid("gidMenu", "gid_menu"),
    gidPages: configuredGid("VITE_SHEET_GID_PAGES") || requestGid("gidPages", "gid_pages"),
    gidAnnouncements:
      configuredGid("VITE_SHEET_GID_ANNOUNCEMENTS") ||
      requestGid("gidAnnouncements", "gid_announcements"),
    gidCategories:
      configuredGid("VITE_SHEET_GID_CATEGORIES") ||
      requestGid("gidCategories", "gid_categories"),
    gidTags: configuredGid("VITE_SHEET_GID_TAGS") || requestGid("gidTags", "gid_tags"),
    gidTypes: configuredGid("VITE_SHEET_GID_TYPES") || requestGid("gidTypes", "gid_types"),
    gidLevels: configuredGid("VITE_SHEET_GID_LEVELS") || requestGid("gidLevels", "gid_levels"),
    gidSizes: configuredGid("VITE_SHEET_GID_SIZES") || requestGid("gidSizes", "gid_sizes"),
  };
}

const RUNTIME_CATALOG_KEYS = {
  productTabs: "product_tabs",
  gidProducts: "sheet_gid_products",
  gidMenu: "sheet_gid_menu",
  gidPages: "sheet_gid_pages",
  gidAnnouncements: "sheet_gid_announcements",
  gidCategories: "sheet_gid_categories",
  gidTags: "sheet_gid_tags",
  gidTypes: "sheet_gid_types",
  gidLevels: "sheet_gid_levels",
  gidSizes: "sheet_gid_sizes",
};

export function mergeRuntimeCatalogConfig(base = {}, runtimeConfig = {}) {
  const merged = { ...base };
  for (const [targetKey, runtimeKey] of Object.entries(RUNTIME_CATALOG_KEYS)) {
    if (!Object.prototype.hasOwnProperty.call(runtimeConfig || {}, runtimeKey)) continue;
    merged[targetKey] = targetKey === "productTabs"
      ? String(runtimeConfig[runtimeKey] || "").trim()
      : normalizeGid(runtimeConfig[runtimeKey] || "");
  }
  return merged;
}

export async function cfgWithRuntime(req, env = process.env) {
  const base = cfgFromRequest(req, env);
  if (!base.sheetId) return base;
  const gidConfig = normalizeGid(env.OG_SHEET_GID_CONFIG || env.VITE_SHEET_GID_CONFIG || "");
  try {
    const runtime = await readPublicRuntimeConfig({
      sheetId: base.sheetId,
      gidConfig,
    });
    return mergeRuntimeCatalogConfig(base, runtime?.config || {});
  } catch {
    return base;
  }
}

export function shouldForceRefresh(query = {}, env = process.env) {
  return env.VERCEL_DEV === "1" && isTruthy(query.force);
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
      staleReason: opts.staleReason || "",
      refreshError: opts.refreshError || "",
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
  ].some((key) => countItems(data?.[key]) > 0);
}

export function shouldRejectRefresh(nextData, prevEntry) {
  if (nextData?._integrity?.productTabs?.complete === false) return true;

  const nextProducts = countItems(nextData?.products);
  if (nextProducts > 0) return false;

  const prevProducts = countItems(prevEntry?.data?.products);
  if (prevProducts > 0) return true;

  return !hasAnyUnifiedContent(nextData);
}

export function preserveFailedSections(nextData = {}, previousData = {}) {
  const next = { ...nextData };
  const sections = nextData?._integrity?.sections || {};
  for (const [key, status] of Object.entries(sections)) {
    if (status?.ok !== false) continue;
    if (Array.isArray(previousData?.[key]) && previousData[key].length) {
      next[key] = previousData[key];
    }
  }
  return next;
}

function refreshCache(key, cfg) {
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);
  const p = loadUnifiedFromSheet(cfg)
    .then((data) => {
      const current = CACHE.get(key);
      if (shouldRejectRefresh(data, current)) {
        const failed = data?._integrity?.productTabs?.failedTabs || [];
        const detail = failed.map((tab) => tab.key || tab.gid).filter(Boolean).join(", ");
        throw new Error(detail ? `Incomplete product tabs: ${detail}` : "Suspicious empty unified payload");
      }
      const mergedData = preserveFailedSections(data, current?.data || {});
      const version = createHash("sha1")
        .update(JSON.stringify(mergedData))
        .digest("hex")
        .slice(0, 16);
      const next = { data: mergedData, refreshedAt: Date.now(), version };
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

  let cfg = cfgFromRequest(req);
  try {
    cfg = await cfgWithRuntime(req);
    if (cfg.configuredSheetId && cfg.requestedSheetId && cfg.requestedSheetId !== cfg.configuredSheetId) {
      return res.status(403).json({ ok: false, error: "Sheet is not allowed" });
    }
    const key = cacheKey(cfg);
    const now = Date.now();

    const force = shouldForceRefresh(req.query || {});
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
    const key = cacheKey(cfg);
    const stale = CACHE.get(key);
    const staleAge = stale ? Date.now() - stale.refreshedAt : Infinity;
    if (stale && staleAge <= MAX_ERROR_STALE_MS) {
      return res.status(200).json(withMeta(stale, {
        fromCache: true,
        stale: true,
        staleReason: "refresh_failed",
        refreshError: e?.message || "Failed to refresh unified data",
      }));
    }
    return res.status(502).json({ ok: false, error: e?.message || "Failed to load unified data" });
  }
}
