// Runtime config for the client app.
// Public-facing config is mirrored into a shared cookie so admin/public subdomains
// can read the same values. Sensitive admin-only fields stay in localStorage only.

const PREFIX = "cfg:";
const SHARED_COOKIE = "hb_public_cfg_v1";
const SHARED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;

const KEYS = {
  SHEET_ID: "sheet_id",
  DRIVE_FOLDER_ID: "drive_folder_id",
  SHEET_GID_CONFIG: "sheet_gid_config",
  PRODUCT_TABS: "product_tabs",
  SHEET_GID_FB: "sheet_gid_fb",
  SHEET_GID_PRODUCTS: "sheet_gid_products",
  SHEET_GID_CATEGORIES: "sheet_gid_categories",
  SHEET_GID_TAGS: "sheet_gid_tags",
  SHEET_GID_MENU: "sheet_gid_menu",
  SHEET_GID_PAGES: "sheet_gid_pages",
  SHEET_GID_TYPES: "sheet_gid_types",
  SHEET_GID_LEVELS: "sheet_gid_levels",
  SHEET_GID_SIZES: "sheet_gid_sizes",
  SHEET_GID_ANNOUNCEMENTS: "sheet_gid_announcements",
  MESSENGER_LINK: "messenger_link",
  ZALO_LINK: "zalo_link",
  API_ALL_URL: "api_all_url",
  GS_WEBAPP_URL: "gs_webapp_url",
  GS_WEBAPP_TOKEN: "gs_webapp_token",
  GOOGLE_OAUTH_CLIENT_ID: "google_oauth_client_id",
  SUPER_ADMIN_EMAIL: "super_admin_email",
  ADMIN_ALLOWED_EMAILS: "admin_allowed_emails",
  GEMINI_API_KEY: "gemini_api_key",
  GEMINI_API_KEYS: "gemini_api_keys",
  GEMINI_MODELS_ORDER: "gemini_models_order",
  AI_PROMPT_TEMPLATE: "ai_prompt_template",
  ENABLE_VISITOR_TRACKING: "enable_visitor_tracking",
  LAST_SYNC_AT: "last_sync_at",
};

const SHARED_KEYS = new Set([
  KEYS.SHEET_ID,
  KEYS.DRIVE_FOLDER_ID,
  KEYS.SHEET_GID_CONFIG,
  KEYS.PRODUCT_TABS,
  KEYS.SHEET_GID_FB,
  KEYS.SHEET_GID_PRODUCTS,
  KEYS.SHEET_GID_CATEGORIES,
  KEYS.SHEET_GID_TAGS,
  KEYS.SHEET_GID_MENU,
  KEYS.SHEET_GID_PAGES,
  KEYS.SHEET_GID_TYPES,
  KEYS.SHEET_GID_LEVELS,
  KEYS.SHEET_GID_SIZES,
  KEYS.SHEET_GID_ANNOUNCEMENTS,
  KEYS.MESSENGER_LINK,
  KEYS.ZALO_LINK,
  KEYS.API_ALL_URL,
  KEYS.SUPER_ADMIN_EMAIL,
  KEYS.ADMIN_ALLOWED_EMAILS,
  KEYS.ENABLE_VISITOR_TRACKING,
  KEYS.LAST_SYNC_AT,
]);

const ENV_MAP = {
  [KEYS.SHEET_ID]: "VITE_SHEET_ID",
  [KEYS.DRIVE_FOLDER_ID]: "VITE_DRIVE_FOLDER_ID",
  [KEYS.SHEET_GID_CONFIG]: "VITE_SHEET_GID_CONFIG",
  [KEYS.PRODUCT_TABS]: "VITE_PRODUCT_TABS",
  [KEYS.SHEET_GID_FB]: "VITE_SHEET_GID_FB",
  [KEYS.SHEET_GID_PRODUCTS]: "VITE_SHEET_GID_PRODUCTS",
  [KEYS.SHEET_GID_CATEGORIES]: "VITE_SHEET_GID_CATEGORIES",
  [KEYS.SHEET_GID_TAGS]: "VITE_SHEET_GID_TAGS",
  [KEYS.SHEET_GID_MENU]: "VITE_SHEET_GID_MENU",
  [KEYS.SHEET_GID_PAGES]: "VITE_SHEET_GID_PAGES",
  [KEYS.SHEET_GID_TYPES]: "VITE_SHEET_GID_TYPES",
  [KEYS.SHEET_GID_LEVELS]: "VITE_SHEET_GID_LEVELS",
  [KEYS.SHEET_GID_SIZES]: "VITE_SHEET_GID_SIZES",
  [KEYS.SHEET_GID_ANNOUNCEMENTS]: "VITE_SHEET_GID_ANNOUNCEMENTS",
  [KEYS.MESSENGER_LINK]: "VITE_MESSENGER_LINK",
  [KEYS.ZALO_LINK]: "VITE_ZALO_LINK",
  [KEYS.API_ALL_URL]: "VITE_API_ALL_URL",
  [KEYS.GS_WEBAPP_URL]: "VITE_GS_WEBAPP_URL",
  [KEYS.GS_WEBAPP_TOKEN]: "VITE_GS_WEBAPP_TOKEN",
  [KEYS.GOOGLE_OAUTH_CLIENT_ID]: "VITE_GOOGLE_OAUTH_CLIENT_ID",
  [KEYS.ADMIN_ALLOWED_EMAILS]: "VITE_ADMIN_ALLOWED_EMAILS",
  [KEYS.GEMINI_API_KEY]: "VITE_GEMINI_API_KEY",
  [KEYS.GEMINI_API_KEYS]: "VITE_GEMINI_API_KEYS",
  [KEYS.GEMINI_MODELS_ORDER]: "VITE_GEMINI_MODELS_ORDER",
  [KEYS.AI_PROMPT_TEMPLATE]: "VITE_AI_PROMPT_TEMPLATE",
  [KEYS.ENABLE_VISITOR_TRACKING]: "VITE_ENABLE_VISITOR_TRACKING",
};

const REMOTE_SNAPSHOT_KEY = `${PREFIX}remote_snapshot_v1`;
const REMOTE_SYNC_TTL_KEY = `${PREFIX}remote_sync_ts`;
const REMOTE_CONFIG_TTL_MS = 60 * 1000;
const REMOTE_FETCH_TIMEOUT_MS = 8000;

const CONFIG_TAB_MATCHERS = [
  /^url$/i,
  /^config$/i,
  /^settings?$/i,
  /^cau\s*hinh$/i,
  /^configuration$/i,
];

const REMOTE_ALIAS_MAP = {
  [KEYS.SHEET_ID]: ["sheet_id", "sheetid", "google_sheet_id", "spreadsheet_id"],
  [KEYS.DRIVE_FOLDER_ID]: ["drive_folder_id", "drivefolderid", "google_drive_folder_id", "folder_id"],
  [KEYS.SHEET_GID_CONFIG]: ["sheet_gid_config", "gid_config", "config_gid", "url_gid"],
  [KEYS.PRODUCT_TABS]: ["product_tabs", "producttabs", "tabs", "products_tabs"],
  [KEYS.SHEET_GID_PRODUCTS]: ["sheet_gid_products", "gid_products", "products_gid"],
  [KEYS.SHEET_GID_MENU]: ["sheet_gid_menu", "gid_menu", "menu_gid"],
  [KEYS.SHEET_GID_PAGES]: ["sheet_gid_pages", "gid_pages", "pages_gid"],
  [KEYS.SHEET_GID_ANNOUNCEMENTS]: ["sheet_gid_announcements", "gid_announcements", "announcements_gid", "thong_bao_gid"],
  [KEYS.SHEET_GID_CATEGORIES]: ["sheet_gid_categories", "gid_categories", "categories_gid"],
  [KEYS.SHEET_GID_TAGS]: ["sheet_gid_tags", "gid_tags", "tags_gid"],
  [KEYS.SHEET_GID_TYPES]: ["sheet_gid_types", "gid_types", "types_gid"],
  [KEYS.SHEET_GID_LEVELS]: ["sheet_gid_levels", "gid_levels", "levels_gid"],
  [KEYS.SHEET_GID_SIZES]: ["sheet_gid_sizes", "gid_sizes", "sizes_gid"],
  [KEYS.SHEET_GID_FB]: ["sheet_gid_fb", "gid_fb", "fb_gid", "facebook_gid", "sheet_gid_facebook"],
  [KEYS.MESSENGER_LINK]: ["messenger_link", "messenger", "fb_messenger_link"],
  [KEYS.ZALO_LINK]: ["zalo_link", "zalo", "zalo_url"],
  [KEYS.API_ALL_URL]: ["api_all_url", "api_all", "api_url", "all_url", "apps_script_all_url"],
  [KEYS.GS_WEBAPP_URL]: ["gs_webapp_url", "webapp_url", "admin_webapp_url"],
  [KEYS.GS_WEBAPP_TOKEN]: ["gs_webapp_token", "hb_admin_token", "admin_token", "webapp_admin_token"],
  [KEYS.GOOGLE_OAUTH_CLIENT_ID]: ["google_oauth_client_id", "oauth_client_id", "google_client_id"],
  [KEYS.SUPER_ADMIN_EMAIL]: ["super_admin_email", "google_super_admin_email", "owner_google_email"],
  [KEYS.ADMIN_ALLOWED_EMAILS]: ["admin_allowed_emails", "allowed_admin_emails", "oauth_allowlist"],
  [KEYS.GEMINI_API_KEYS]: ["gemini_api_keys", "gemini_keys", "ai_gemini_keys", "ai_keys"],
  [KEYS.GEMINI_API_KEY]: ["gemini_api_key", "gemini_key", "google_gemini_api_key"],
  [KEYS.GEMINI_MODELS_ORDER]: ["gemini_models_order", "ai_models_order", "models_order", "gemini_models"],
  [KEYS.AI_PROMPT_TEMPLATE]: ["ai_prompt_template", "gemini_prompt_template", "prompt_template", "ai_prompt"],
  [KEYS.ENABLE_VISITOR_TRACKING]: ["enable_visitor_tracking", "visitor_tracking", "track_visitors"],
};

let remoteSyncPromise = null;
const REMOTE_SYNC_KEYS = Object.keys(REMOTE_ALIAS_MAP);

function normalizeGeminiKeyList(list = []) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const value =
      typeof item === "object"
        ? String(item?.key || item?.value || "").trim()
        : String(item ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseGeminiKeysRaw(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return [];
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      const parsed = JSON.parse(text);
      return normalizeGeminiKeyList(parsed);
    } catch {}
  }
  return normalizeGeminiKeyList(
    text
      .split(/[\r\n,;|]+/)
      .map((x) => String(x || "").trim())
      .filter(Boolean)
  );
}

function readGeminiKeysLocalCache() {
  try {
    const raw = localStorage.getItem("ai_gemini_keys");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeGeminiKeyList(parsed);
  } catch {
    return [];
  }
}

function getConfigValueWithoutGeminiOverride(key, fallback = "") {
  const fromRemote = remoteSnapshotValueFor(key);
  if (fromRemote !== null) return fromRemote;

  const fromShared = sharedValueFor(key);
  if (fromShared !== "") return fromShared;

  try {
    const ls = localStorage.getItem(PREFIX + key);
    if (ls !== null && ls !== "") return normalizeValue(key, ls);
  } catch {}

  const fromEnv = envValueFor(key);
  if (fromEnv !== "") return fromEnv;
  return fallback;
}

export function getGeminiKeys() {
  const remoteListRaw = remoteSnapshotValueFor(KEYS.GEMINI_API_KEYS);
  if (remoteListRaw !== null) {
    const remoteList = parseGeminiKeysRaw(remoteListRaw);
    if (remoteList.length) return remoteList;
    const remoteSingleRaw = remoteSnapshotValueFor(KEYS.GEMINI_API_KEY);
    const remoteSingle = String(remoteSingleRaw == null ? "" : remoteSingleRaw).trim();
    return remoteSingle ? [remoteSingle] : [];
  }

  const fromConfigList = parseGeminiKeysRaw(getConfigValueWithoutGeminiOverride(KEYS.GEMINI_API_KEYS, ""));
  if (fromConfigList.length) return fromConfigList;

  const fromLocal = readGeminiKeysLocalCache();
  if (fromLocal.length) return fromLocal;

  const single = String(getConfigValueWithoutGeminiOverride(KEYS.GEMINI_API_KEY, "") || "").trim();
  if (!single) return [];
  return [single];
}

export function setGeminiKeys(nextKeys = []) {
  const keys = normalizeGeminiKeyList(nextKeys);
  const joined = keys.join("\n");

  try {
    localStorage.setItem("ai_gemini_keys", JSON.stringify(keys));
  } catch {}

  setConfig(KEYS.GEMINI_API_KEYS, joined);
  setConfig(KEYS.GEMINI_API_KEY, keys[0] || "");

  // Tự động lưu lên Sheet để đồng bộ thiết bị khác (chạy nền, không block)
  pushConfigKeyToSheet("gemini_api_keys", keys.join(",")).catch(() => {});

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hb:config-changed"));
  }

  return keys;
}

const sheetWriteTimers = {};

/**
 * Ghi một cặp key=value lên Config tab trong Google Sheet.
 * Dùng Sheets API + OAuth token đã cache trong localStorage.
 * Có debounce 2 giây để tránh gửi API liên tục khi gõ phím.
 * Nếu tìm thấy nhiều dòng có cùng key, sẽ ưu tiên dòng cuối cùng (giống logic đọc file).
 */
export async function pushConfigKeyToSheet(configKey, configValue) {
  if (typeof window === "undefined") return;

  const sheetId = extractSheetId(getConfig(KEYS.SHEET_ID, ""));
  if (!sheetId) return;

  // Debounce logic: clear timer cũ nếu có
  if (sheetWriteTimers[configKey]) {
    clearTimeout(sheetWriteTimers[configKey]);
  }

  // Tỷ lệ debounced (2 giây) để tránh race condition khi gõ phím
  return new Promise((resolve) => {
    sheetWriteTimers[configKey] = setTimeout(async () => {
      delete sheetWriteTimers[configKey];
      await executePushConfig(sheetId, configKey, configValue);
      resolve();
    }, 2000);
  });
}

async function executePushConfig(sheetId, configKey, configValue) {
  
  // Lấy OAuth token từ cache upload panel
  let token = "";
  try {
    const oauthCache = JSON.parse(localStorage.getItem("admin.upload.oauth.v1") || "{}");
    if (oauthCache.accessToken && oauthCache.expiresAt > Date.now()) {
      token = oauthCache.accessToken;
    }
  } catch {}
  if (!token) return; // Không có token → bỏ qua, không block UX

  const gidConfig = getConfig(KEYS.SHEET_GID_CONFIG, "");
  
  // Tìm tên tab config
  let tabTitle = "Config";
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const tabs = meta?.sheets || [];
      if (gidConfig) {
        const match = tabs.find(t => String(t?.properties?.sheetId) === gidConfig);
        if (match) tabTitle = match.properties.title;
      }
    }
  } catch {}

  // Đọc cột A để tìm dòng chứa key
  const rangeA = `${tabTitle}!A:A`;
  try {
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(rangeA)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!readRes.ok) return;
    const readData = await readRes.json();
    const rows = readData?.values || [];
    
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const cellKey = String(rows[i]?.[0] || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (cellKey === configKey.toLowerCase().replace(/[^a-z0-9_]/g, "_")) {
        rowIndex = i + 1; // 1-indexed (ghi nhận lại mỗi khi tìm thấy, để lấy dòng cuối)
      }
    }

    if (rowIndex > 0) {
      // Update existing row
      const updateRange = `${tabTitle}!B${rowIndex}`;
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[configValue]] }),
        }
      );
    } else {
      // Append new row
      const appendRange = `${tabTitle}!A:B`;
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[configKey, configValue]] }),
        }
      );
    }
  } catch (e) {
    console.warn("[pushConfigKeyToSheet] Lỗi:", e?.message);
  }
}

function extractSheetId(input = "") {
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return s.replace(/^['"]|['"]$/g, "");
}

function extractDriveFolderId(input = "") {
  const s = String(input || "").trim();
  if (!s) return "";
  const m1 = s.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (m2) return m2[1];
  return s.replace(/^['"]|['"]$/g, "");
}

function normalizeValue(key, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (key === KEYS.SHEET_ID) return extractSheetId(raw);
  if (key === KEYS.DRIVE_FOLDER_ID) return extractDriveFolderId(raw);
  if (key === KEYS.SUPER_ADMIN_EMAIL) return raw.toLowerCase();
  return raw;
}

function hasDocument() {
  return typeof document !== "undefined";
}

function isLocalHost(host = "") {
  const h = String(host || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0";
}

function isPublicHostRuntime() {
  if (typeof window === "undefined") return false;
  const host = String(window.location?.hostname || "").toLowerCase();
  return !!host && !isLocalHost(host);
}

function getSharedCookieDomain() {
  if (typeof window === "undefined") return "";
  const host = String(window.location?.hostname || "").toLowerCase();
  if (!host || isLocalHost(host)) return "";
  if (host === "halleybakery.io.vn" || host.endsWith(".halleybakery.io.vn")) {
    return ".halleybakery.io.vn";
  }
  return "";
}

function readCookie(name) {
  if (!hasDocument()) return "";
  const encodedName = encodeURIComponent(String(name || ""));
  const pairs = String(document.cookie || "").split(/;\s*/);
  for (const pair of pairs) {
    if (!pair) continue;
    const idx = pair.indexOf("=");
    const key = idx >= 0 ? pair.slice(0, idx) : pair;
    if (key !== encodedName) continue;
    const value = idx >= 0 ? pair.slice(idx + 1) : "";
    return decodeURIComponent(value || "");
  }
  return "";
}

function writeCookie(name, value, { maxAge = SHARED_COOKIE_MAX_AGE, domain = "" } = {}) {
  if (!hasDocument()) return;
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
    "SameSite=Lax",
  ];
  if (domain) parts.push(`Domain=${domain}`);
  document.cookie = parts.join("; ");
}

function deleteCookie(name, domain = "") {
  writeCookie(name, "", { maxAge: 0, domain });
}

function readSharedConfig() {
  try {
    const raw = readCookie(SHARED_COOKIE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const key of SHARED_KEYS) {
      const normalized = normalizeValue(key, parsed[key]);
      if (normalized !== "") out[key] = normalized;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSharedConfig(config = {}) {
  if (!hasDocument()) return;
  const next = {};
  for (const key of SHARED_KEYS) {
    const normalized = normalizeValue(key, config[key]);
    if (normalized !== "") next[key] = normalized;
  }
  const domain = getSharedCookieDomain();
  if (!Object.keys(next).length) {
    deleteCookie(SHARED_COOKIE);
    if (domain) deleteCookie(SHARED_COOKIE, domain);
    return;
  }
  writeCookie(SHARED_COOKIE, JSON.stringify(next), { domain });
}

function sharedValueFor(key) {
  if (!SHARED_KEYS.has(key)) return "";
  const shared = readSharedConfig();
  return normalizeValue(key, shared[key] ?? "");
}

function updateSharedConfigKey(key, value) {
  if (!SHARED_KEYS.has(key)) return;
  const shared = readSharedConfig();
  const normalized = normalizeValue(key, value);
  if (normalized === "") delete shared[key];
  else shared[key] = normalized;
  writeSharedConfig(shared);
}

function readRemoteSnapshot() {
  try {
    const raw = localStorage.getItem(REMOTE_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeRemoteSnapshot(snapshot = {}) {
  try {
    localStorage.setItem(REMOTE_SNAPSHOT_KEY, JSON.stringify(snapshot || {}));
  } catch {}
}

function remoteSnapshotValueFor(key) {
  try {
    const snapshot = readRemoteSnapshot();
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) return null;
    return normalizeValue(key, snapshot[key] ?? "");
  } catch {
    return null;
  }
}

function updateRemoteSnapshotKey(key, value) {
  if (!REMOTE_SYNC_KEYS.includes(key)) return;
  const snapshot = readRemoteSnapshot();
  const normalized = normalizeValue(key, value);
  snapshot[key] = normalized;
  writeRemoteSnapshot(snapshot);
}

function bootstrapValueFor(key) {
  const shared = sharedValueFor(key);
  if (shared !== "") return shared;
  try {
    const ls = localStorage.getItem(PREFIX + key);
    if (ls !== null) return normalizeValue(key, ls);
  } catch {}
  return envValueFor(key);
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
    // Nối tất cả cột từ cột B trở đi — fix lỗi value chứa dấu phẩy bị CSV tách ra nhiều cột
    const valueParts = row.slice(1);
    out[key] = valueParts.join(",").trim();
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
    const gid = String(m[2] || "").trim();
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    out.push({ gid, title: decodeEscapedText(m[3] || "") });
  }
  return out;
}

function pickConfigGid(tabs = []) {
  for (const tab of tabs) {
    const title = String(tab?.title || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (CONFIG_TAB_MATCHERS.some((rx) => rx.test(title))) return String(tab.gid || "").trim();
  }
  return "";
}

async function fetchWithTimeout(url, timeoutMs = REMOTE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function pickAliasEntry(map = {}, aliases = []) {
  for (const alias of aliases) {
    const key = normalizeCfgKey(alias);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return { found: true, value: String(map[key] || "").trim() };
    }
  }
  return { found: false, value: "" };
}

function mapRemoteConfig(map = {}) {
  const out = {};
  for (const key of REMOTE_SYNC_KEYS) {
    const hit = pickAliasEntry(map, REMOTE_ALIAS_MAP[key] || []);
    if (!hit.found) continue;
    out[key] = hit.value;
  }
  return out;
}

async function fetchRemoteConfigViaApi({ sheetId = "", gidConfig = "" } = {}) {
  const q = new URLSearchParams();
  if (sheetId) q.set("sheetId", sheetId);
  if (gidConfig) q.set("gidConfig", gidConfig);
  const url = `/api/runtime-config${q.toString() ? `?${q}` : ""}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Runtime config HTTP ${res.status}`);
  }
  return data;
}

async function fetchRemoteConfigDirectSheet({ sheetId = "", gidConfig = "" } = {}) {
  const id = extractSheetId(sheetId);
  if (!id) return { config: {}, gidConfig: "" };

  let gid = String(gidConfig || "").trim().replace(/[^\d]/g, "");
  if (!gid) {
    const editRes = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${id}/edit`);
    if (editRes.ok) {
      const html = await editRes.text();
      gid = pickConfigGid(parseTabsFromEditHtml(html));
    }
  }
  if (!gid) return { config: {}, gidConfig: "" };

  const csvRes = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
  if (!csvRes.ok) throw new Error(`Khong doc duoc config tab (HTTP ${csvRes.status})`);
  const csvText = await csvRes.text();
  return { config: parseKeyValueTable(csvText), gidConfig: gid };
}

export async function syncConfigFromRemote({ force = false } = {}) {
  if (typeof window === "undefined") return { ok: false, changed: false, reason: "ssr" };

  if (!force) {
    try {
      const last = Number(localStorage.getItem(REMOTE_SYNC_TTL_KEY) || 0);
      if (last && Date.now() - last < REMOTE_CONFIG_TTL_MS) {
        return { ok: true, changed: false, cached: true };
      }
    } catch {}
  }

  if (remoteSyncPromise) return remoteSyncPromise;

  remoteSyncPromise = (async () => {
    const sheetId = bootstrapValueFor(KEYS.SHEET_ID);
    const gidConfig = bootstrapValueFor(KEYS.SHEET_GID_CONFIG);
    console.log("[ConfigSync] sheetId:", sheetId, "gidConfig:", gidConfig);
    if (!sheetId) return { ok: false, changed: false, reason: "missing_sheet_id" };

    let payload = {};
    try {
      payload = await fetchRemoteConfigViaApi({ sheetId, gidConfig });
      console.log("[ConfigSync] API payload:", Object.keys(payload?.config || {}));
    } catch (apiErr) {
      if (isPublicHostRuntime()) {
        console.warn("[ConfigSync] API failed on public host. Skip direct sheet fallback:", apiErr?.message);
        return { ok: false, changed: false, error: String(apiErr?.message || "runtime_config_api_failed") };
      }
      console.log("[ConfigSync] API failed, trying direct sheet:", apiErr?.message);
      try {
        payload = await fetchRemoteConfigDirectSheet({ sheetId, gidConfig });
        console.log("[ConfigSync] Direct sheet payload:", Object.keys(payload?.config || {}));
      } catch (sheetErr) {
        console.error("[ConfigSync] Direct sheet also failed:", sheetErr?.message);
        throw sheetErr;
      }
    }

    const rawMap = payload?.config && typeof payload.config === "object" ? payload.config : {};
    const mapped = mapRemoteConfig(rawMap);
    console.log("[ConfigSync] mapped keys:", Object.keys(mapped), "values:", JSON.stringify(mapped).substring(0, 300));
    const effectiveGid = String(payload?.gidConfig || mapped[KEYS.SHEET_GID_CONFIG] || gidConfig || "").trim();
    if (effectiveGid) mapped[KEYS.SHEET_GID_CONFIG] = effectiveGid;
    if (!mapped[KEYS.SHEET_ID]) mapped[KEYS.SHEET_ID] = extractSheetId(sheetId);

    const prevSnapshot = readRemoteSnapshot();
    let changed = false;
    const nextSnapshot = { ...prevSnapshot };
    for (const key of Object.keys(mapped)) {
      if (!REMOTE_SYNC_KEYS.includes(key)) continue;
      const nextVal = normalizeValue(key, mapped[key] ?? "");
      const prevVal = normalizeValue(key, prevSnapshot[key] ?? "");
      if (!Object.prototype.hasOwnProperty.call(prevSnapshot, key) || nextVal !== prevVal) {
        changed = true;
      }
      nextSnapshot[key] = nextVal;
      if (SHARED_KEYS.has(key)) updateSharedConfigKey(key, nextVal);
      try {
        if (nextVal === "") localStorage.removeItem(PREFIX + key);
        else localStorage.setItem(PREFIX + key, nextVal);
      } catch {}
    }
    writeRemoteSnapshot(nextSnapshot);
    try {
      localStorage.setItem(REMOTE_SYNC_TTL_KEY, String(Date.now()));
    } catch {}
    if (changed) window.dispatchEvent(new Event("hb:config-changed"));
    console.log("[ConfigSync] done. changed:", changed, "keys synced:", Object.keys(mapped).length);
    return { ok: true, changed, source: payload?.source || "remote" };
  })()
    .catch((error) => ({ ok: false, changed: false, error: String(error?.message || error || "sync_failed") }))
    .finally(() => {
      remoteSyncPromise = null;
    });

  return remoteSyncPromise;
}

function envValueFor(key) {
  const envKey = ENV_MAP[key];
  if (!envKey) return "";
  try {
    return normalizeValue(key, import.meta.env?.[envKey] ?? "");
  } catch {
    return "";
  }
}

export function getConfig(key, fallback = "") {
  if (key === KEYS.GEMINI_API_KEY) {
    const keys = getGeminiKeys();
    return keys[0] || fallback;
  }
  if (key === KEYS.GEMINI_API_KEYS) return getGeminiKeys().join("\n");

  return getConfigValueWithoutGeminiOverride(key, fallback);
}

export function setConfig(key, value) {
  const normalized = normalizeValue(key, value);
  try {
    if (normalized === "") localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, normalized);
  } catch {}
  updateRemoteSnapshotKey(key, normalized);
  updateSharedConfigKey(key, normalized);
}

export function getAllConfig() {
  const result = {};
  for (const [, key] of Object.entries(KEYS)) {
    result[key] = getConfig(key);
  }
  return result;
}

export function setAllConfig(configObj) {
  const shared = readSharedConfig();
  const snapshot = readRemoteSnapshot();
  for (const [key, value] of Object.entries(configObj)) {
    if (key === KEYS.GEMINI_API_KEY || key === KEYS.GEMINI_API_KEYS) continue;
    const normalized = normalizeValue(key, value);
    try {
      if (normalized === "") localStorage.removeItem(PREFIX + key);
      else localStorage.setItem(PREFIX + key, normalized);
    } catch {}
    if (SHARED_KEYS.has(key)) {
      if (normalized === "") delete shared[key];
      else shared[key] = normalized;
    }
    if (REMOTE_SYNC_KEYS.includes(key)) snapshot[key] = normalized;
  }
  writeSharedConfig(shared);
  writeRemoteSnapshot(snapshot);
}

export function resetAllConfig() {
  for (const [, key] of Object.entries(KEYS)) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {}
  }
  try {
    localStorage.removeItem(REMOTE_SNAPSHOT_KEY);
    localStorage.removeItem(REMOTE_SYNC_TTL_KEY);
  } catch {}
  writeSharedConfig({});
}

export { KEYS };
