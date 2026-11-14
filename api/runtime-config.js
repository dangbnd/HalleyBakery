// api/runtime-config.js
// Central runtime config reader (sheet URL/config tab) with short in-memory cache.

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7000;
const CACHE = new Map(); // key => { at, data }
const INFLIGHT = new Map(); // key => Promise<data>
const PUBLIC_CONFIG_KEYS = new Set([
  "sheet_id",
  "drive_folder_id",
  "feedback_drive_folder_id",
  "feedback_images",
  "product_tabs",
  "sheet_gid_products",
  "sheet_gid_categories",
  "sheet_gid_tags",
  "sheet_gid_menu",
  "sheet_gid_pages",
  "sheet_gid_types",
  "sheet_gid_levels",
  "sheet_gid_sizes",
  "sheet_gid_announcements",
  "messenger_link",
  "zalo_link",
  "api_all_url",
  "google_oauth_client_id",
  "gemini_models_order",
  "ai_prompt_template",
  "enable_visitor_tracking",
]);
const OPTIONAL_GID_KEYS = new Set([
  "sheet_gid_products",
  "sheet_gid_categories",
  "sheet_gid_tags",
  "sheet_gid_menu",
  "sheet_gid_pages",
  "sheet_gid_types",
  "sheet_gid_levels",
  "sheet_gid_sizes",
  "sheet_gid_announcements",
]);

function normalizeSheetId(input = "") {
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  const cleaned = s.replace(/^['"]|['"]$/g, "");
  const m2 = cleaned.match(/^([a-zA-Z0-9-_]{10,})/);
  return m2 ? m2[1] : cleaned;
}

function normalizeGid(input = "") {
  const s = String(input || "").trim();
  const m = s.match(/(\d{1,})/);
  return m ? m[1] : "";
}

function normalizeCfgKey(k = "") {
  return String(k || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function parseKeyValueTable(text = "") {
  const rows = parseCSV(String(text || "").replace(/^\uFEFF/, ""));
  if (!rows.length) return {};

  const first = rows[0] || [];
  const f0 = normalizeCfgKey(first[0] || "");
  const f1 = normalizeCfgKey(first[1] || "");
  const hasHeader =
    (f0 === "key" || f0 === "name" || f0 === "config_key") &&
    (f1 === "value" || f1 === "url" || f1 === "link" || f1 === "config_value");

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const out = {};
  for (const row of dataRows) {
    const key = normalizeCfgKey(row[0] || "");
    if (!key) continue;
    // Runtime config expects key/value in first 2 columns; ignore extra analytics columns.
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = String(row[1] ?? "").trim();
    }
  }
  return out;
}

export function publicConfig(config = {}, validGids = new Set()) {
  const out = {};
  for (const [key, value] of Object.entries(config || {})) {
    const normalizedKey = normalizeCfgKey(key);
    if (!PUBLIC_CONFIG_KEYS.has(normalizedKey)) continue;
    if (OPTIONAL_GID_KEYS.has(normalizedKey)) {
      const gid = normalizeGid(value);
      out[normalizedKey] = gid && validGids.has(gid) ? gid : "";
      continue;
    }
    out[normalizedKey] = value;
  }
  return out;
}

export function resolveRuntimeRequestConfig(query = {}, env = process.env) {
  const configuredSheetId = normalizeSheetId(env.OG_SHEET_ID || env.VITE_SHEET_ID || "");
  const requestedSheetId = normalizeSheetId(query.sheetId || "");
  const allowRequestConfig = env.VERCEL_DEV === "1" && !configuredSheetId;
  const configuredGid = normalizeGid(env.OG_SHEET_GID_CONFIG || env.VITE_SHEET_GID_CONFIG || "");

  return {
    configuredSheetId,
    requestedSheetId,
    sheetId: configuredSheetId || (allowRequestConfig ? requestedSheetId : ""),
    gidConfig: configuredGid || (allowRequestConfig ? normalizeGid(query.gidConfig || "") : ""),
  };
}

function decodeEscapedText(raw = "") {
  return String(raw || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseTabsFromEditHtml(html = "") {
  const out = [];
  const seen = new Set();
  const re = /\[(\d+),0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)\\"/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const gid = normalizeGid(m[2] || "");
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    out.push({ gid, title: decodeEscapedText(m[3] || "") });
  }
  return out;
}

function pickConfigTabGid(tabs = []) {
  const patterns = [
    /^url$/i,
    /^config$/i,
    /^settings?$/i,
    /^cau\s*hinh$/i,
    /^configuration$/i,
  ];
  for (const tab of tabs) {
    const title = String(tab?.title || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (patterns.some((rx) => rx.test(title))) return normalizeGid(tab.gid);
  }
  return "";
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function inferConfigGid(sheetId = "") {
  const id = normalizeSheetId(sheetId);
  if (!id) return "";
  const res = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${id}/edit`);
  if (!res.ok) return "";
  const html = await res.text();
  return pickConfigTabGid(parseTabsFromEditHtml(html));
}

async function readSheetTabs(sheetId = "") {
  const id = normalizeSheetId(sheetId);
  if (!id) return [];
  const res = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${id}/edit`);
  if (!res.ok) return [];
  return parseTabsFromEditHtml(await res.text());
}

async function readConfigFromSheet({ sheetId = "", gidConfig = "" } = {}) {
  const id = normalizeSheetId(sheetId);
  if (!id) throw new Error("Missing sheetId");
  let gid = normalizeGid(gidConfig);
  if (!gid) gid = await inferConfigGid(id);
  if (!gid) return { config: {}, gidConfig: "" };

  let res = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
  if (!res.ok) {
    const inferred = await inferConfigGid(id);
    if (!inferred || inferred === gid) throw new Error(`Config tab HTTP ${res.status}`);
    gid = inferred;
    res = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
    if (!res.ok) throw new Error(`Config tab HTTP ${res.status}`);
  }

  const csv = await res.text();
  return { config: parseKeyValueTable(csv), gidConfig: gid };
}

export async function readPublicRuntimeConfig({
  sheetId = "",
  gidConfig = "",
  force = false,
} = {}) {
  const id = normalizeSheetId(sheetId);
  if (!id) return { sheetId: "", config: {}, gidConfig: "", source: "missing_sheet" };

  const cacheKey = `${id}:${normalizeGid(gidConfig) || "auto"}`;
  const now = Date.now();
  const hit = CACHE.get(cacheKey);
  if (!force && hit && now - hit.at < CACHE_TTL_MS) {
    return { ...hit.data, cached: true };
  }

  if (!force && INFLIGHT.has(cacheKey)) {
    const shared = await INFLIGHT.get(cacheKey);
    return { ...shared, cached: false };
  }

  const load = (async () => {
    const [loaded, tabs] = await Promise.all([
      readConfigFromSheet({ sheetId: id, gidConfig }),
      readSheetTabs(id),
    ]);
    const validGids = new Set(tabs.map((tab) => normalizeGid(tab.gid)).filter(Boolean));
    const payload = {
      sheetId: id,
      gidConfig: loaded.gidConfig || "",
      config: publicConfig(loaded.config || {}, validGids),
      fetchedAt: new Date().toISOString(),
      source: "sheet",
    };
    CACHE.set(cacheKey, { at: Date.now(), data: payload });
    return payload;
  })();

  if (!force) INFLIGHT.set(cacheKey, load);
  try {
    const payload = await load;
    return { ...payload, cached: false };
  } finally {
    if (!force && INFLIGHT.get(cacheKey) === load) INFLIGHT.delete(cacheKey);
  }
}

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const q = req.query || {};
    const {
      configuredSheetId,
      requestedSheetId,
      sheetId,
      gidConfig,
    } = resolveRuntimeRequestConfig(q);
    if (configuredSheetId && requestedSheetId && requestedSheetId !== configuredSheetId) {
      return json(res, 403, { ok: false, error: "Sheet is not allowed" });
    }
    if (!sheetId) {
      return json(res, 400, { ok: false, error: "Missing sheetId" });
    }

    const payload = await readPublicRuntimeConfig({ sheetId, gidConfig });
    return json(res, 200, { ok: true, ...payload });
  } catch (e) {
    // Fail-soft for storefront: return empty config instead of 500 to avoid client fallback storms.
    return json(res, 200, {
      ok: true,
      sheetId: "",
      config: {},
      fetchedAt: new Date().toISOString(),
      source: "error_fallback",
      error: String(e?.message || "runtime_config_failed"),
      cached: false,
    });
  }
}
