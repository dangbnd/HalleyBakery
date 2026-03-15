// src/utils/config.js — Runtime config cho client app.
// Ưu tiên localStorage (Settings panel), fallback sang .env.

const PREFIX = "cfg:";

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
    GEMINI_API_KEY: "gemini_api_key",
    ENABLE_VISITOR_TRACKING: "enable_visitor_tracking",
    LAST_SYNC_AT: "last_sync_at",
};

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

function envValueFor(key) {
    const envKey = ENV_MAP[key];
    if (!envKey) return "";
    try {
        return normalizeValue(key, import.meta.env?.[envKey] ?? "");
    } catch {
        return "";
    }
}

/**
 * Đọc config value: localStorage ưu tiên, fallback .env.
 */
export function getConfig(key, fallback = "") {
    try {
        const ls = localStorage.getItem(PREFIX + key);
        if (ls !== null && ls !== "") return normalizeValue(key, ls);
    } catch { }
    const fromEnv = envValueFor(key);
    if (fromEnv !== "") return fromEnv;
    return fallback;
}

/**
 * Ghi config value vào localStorage
 */
export function setConfig(key, value) {
    const normalized = normalizeValue(key, value);
    try {
        if (normalized === "") {
            localStorage.removeItem(PREFIX + key);
        } else {
            localStorage.setItem(PREFIX + key, normalized);
        }
    } catch { }
}

/**
 * Đọc tất cả config (cho Settings panel)
 */
export function getAllConfig() {
    const result = {};
    for (const [, key] of Object.entries(KEYS)) {
        result[key] = getConfig(key);
    }
    return result;
}

/**
 * Ghi nhiều config cùng lúc
 */
export function setAllConfig(configObj) {
    for (const [key, value] of Object.entries(configObj)) {
        setConfig(key, value);
    }
}

/**
 * Xoá tất cả config (sẽ mất toàn bộ cấu hình!)
 */
export function resetAllConfig() {
    for (const [, key] of Object.entries(KEYS)) {
        localStorage.removeItem(PREFIX + key);
    }
}

export { KEYS };
