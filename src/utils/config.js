// Runtime config for the client app.
// Public-facing config is mirrored into a shared cookie so admin/public subdomains
// can read the same values. Sensitive admin-only fields stay in localStorage only.

const PREFIX = "cfg:";
const SHARED_COOKIE = "hb_public_cfg_v1";
const SHARED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;

const KEYS = {
  SHEET_ID: "sheet_id",
  DRIVE_FOLDER_ID: "drive_folder_id",
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
  GEMINI_API_KEY: "gemini_api_key",
  ENABLE_VISITOR_TRACKING: "enable_visitor_tracking",
  LAST_SYNC_AT: "last_sync_at",
};

const SHARED_KEYS = new Set([
  KEYS.SHEET_ID,
  KEYS.DRIVE_FOLDER_ID,
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
  KEYS.ENABLE_VISITOR_TRACKING,
  KEYS.LAST_SYNC_AT,
]);

const ENV_MAP = {
  [KEYS.SHEET_ID]: "VITE_SHEET_ID",
  [KEYS.DRIVE_FOLDER_ID]: "VITE_DRIVE_FOLDER_ID",
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
  [KEYS.GOOGLE_OAUTH_CLIENT_ID]: "VITE_GOOGLE_OAUTH_CLIENT_ID",
  [KEYS.GEMINI_API_KEY]: "VITE_GEMINI_API_KEY",
  [KEYS.ENABLE_VISITOR_TRACKING]: "VITE_ENABLE_VISITOR_TRACKING",
};

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
  return raw;
}

function hasDocument() {
  return typeof document !== "undefined";
}

function isLocalHost(host = "") {
  const h = String(host || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0";
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
    try {
      const aiKeys = JSON.parse(localStorage.getItem("ai_gemini_keys"));
      if (Array.isArray(aiKeys) && aiKeys.length > 0 && aiKeys[0]) {
        return aiKeys[0];
      }
    } catch {}
  }

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

export function setConfig(key, value) {
  const normalized = normalizeValue(key, value);
  try {
    if (normalized === "") localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, normalized);
  } catch {}
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
  for (const [key, value] of Object.entries(configObj)) {
    if (key === KEYS.GEMINI_API_KEY) continue;
    const normalized = normalizeValue(key, value);
    try {
      if (normalized === "") localStorage.removeItem(PREFIX + key);
      else localStorage.setItem(PREFIX + key, normalized);
    } catch {}
    if (SHARED_KEYS.has(key)) {
      if (normalized === "") delete shared[key];
      else shared[key] = normalized;
    }
  }
  writeSharedConfig(shared);
}

export function resetAllConfig() {
  for (const [, key] of Object.entries(KEYS)) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {}
  }
  writeSharedConfig({});
}

export { KEYS };
