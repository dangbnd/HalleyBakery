// api/runtime-config.js
// Central runtime config reader (sheet URL/config tab) with short in-memory cache.

const CACHE_TTL_MS = 2 * 1000; // 2 seconds to prevent stale config F5 loops
const FETCH_TIMEOUT_MS = 7000;
const CACHE = new Map(); // key => { at, data }

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
    out[key] = String(row[1] ?? "").trim();
  }
  return out;
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
    const sheetId = normalizeSheetId(q.sheetId || process.env.OG_SHEET_ID || process.env.VITE_SHEET_ID || "");
    const gidConfig = normalizeGid(q.gidConfig || process.env.OG_SHEET_GID_CONFIG || process.env.VITE_SHEET_GID_CONFIG || "");
    if (!sheetId) {
      return json(res, 400, { ok: false, error: "Missing sheetId" });
    }

    const cacheKey = `${sheetId}:${gidConfig || "auto"}`;
    const now = Date.now();
    const hit = CACHE.get(cacheKey);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      return json(res, 200, { ok: true, ...hit.data, cached: true });
    }

    const loaded = await readConfigFromSheet({ sheetId, gidConfig });
    const payload = {
      sheetId,
      gidConfig: loaded.gidConfig || "",
      config: loaded.config || {},
      fetchedAt: new Date().toISOString(),
      source: "sheet",
    };

    CACHE.set(cacheKey, { at: now, data: payload });
    return json(res, 200, { ok: true, ...payload, cached: false });
  } catch (e) {
    // Fail-soft for storefront: return empty config instead of 500 to avoid client fallback storms.
    return json(res, 200, {
      ok: true,
      sheetId: "",
      gidConfig: "",
      config: {},
      fetchedAt: new Date().toISOString(),
      source: "error_fallback",
      error: String(e?.message || "runtime_config_failed"),
      cached: false,
    });
  }
}
