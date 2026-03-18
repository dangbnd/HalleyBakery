// src/components/Admin/shared/sheets.js
import { LS, readLS } from "../../../utils.js";
import { KEYS, getConfig, setConfig } from "../../../utils/config.js";

export function getWebappUrl(override = "") {
  return s(override || getConfig(KEYS.GS_WEBAPP_URL, getConfig("gs_webapp_url", "")));
}

export function setGsWebappUrl(url) {
  setConfig("gs_webapp_url", url);
}

function s(v) {
  return v == null ? "" : String(v).trim();
}

function uniq(list = []) {
  return [...new Set(list.map((v) => s(v)).filter(Boolean))];
}

function pickArray(data = {}, keys = []) {
  for (const key of keys) {
    const v = data?.[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function responseMessage(data = {}) {
  return s(data?.msg || data?.message || data?.error || data?.reason || "");
}

function getAdminAuth({ tokenOverride = "" } = {}) {
  const token = s(tokenOverride || getConfig(KEYS.GS_WEBAPP_TOKEN, ""));
  const user = readLS(LS.AUTH, null);
  if (!token) return null;
  return {
    token,
    ts: Date.now(),
    user: user
      ? {
          username: s(user.username),
          role: s(user.role || "staff"),
          isSuper: !!user.isSuper,
        }
      : null,
  };
}

const UNKNOWN_ACTION_RE =
  /no action|unknown action|unknown op|invalid action|unsupported action|action not supported|unknown action\/op/i;

function isUnknownAction(data) {
  const msg = responseMessage(data).toLowerCase();
  return UNKNOWN_ACTION_RE.test(msg);
}

async function postBody(body = {}, { requireAuth = false, authToken = "", webappUrl = "" } = {}) {
  const webApp = getWebappUrl(webappUrl);
  if (!webApp) throw new Error("Chưa cấu hình GS WebApp URL");
  const adminAuth = getAdminAuth({ tokenOverride: authToken });
  if (requireAuth && !adminAuth?.token) {
    throw new Error("Chưa cấu hình GS WebApp Admin Token");
  }

  const res = await fetch(webApp, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify(adminAuth ? { ...body, _auth: adminAuth } : body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(responseMessage(data) || `GS WebApp lỗi HTTP ${res.status}`);
  }

  return data;
}

async function call(action, payload = {}, options = {}) {
  return postBody({ action, ...payload }, options);
}

async function callOp(op, payload = {}, options = {}) {
  return postBody({ op, ...payload }, options);
}

async function callDriveOp(op, payload = {}, options = {}) {
  return postBody({ action: "drive", op, ...payload }, options);
}

async function callDriveOperation(op, payload = {}, options = {}) {
  return postBody({ action: "drive", operation: op, ...payload }, options);
}

async function callWithAliases(actions = [], payload = {}, options = {}) {
  let lastErr = null;
  for (const action of actions) {
    const runners = [
      () => call(action, payload, options),
      () => callOp(action, payload, options),
      () => callDriveOp(action, payload, options),
      () => callDriveOperation(action, payload, options),
    ];

    for (const run of runners) {
      try {
        const data = await run();

        if (isUnknownAction(data)) {
          lastErr = new Error(responseMessage(data) || "Action chưa được hỗ trợ bởi GS WebApp");
          continue;
        }

        if (data?.ok === false) {
          lastErr = new Error(responseMessage(data) || `GS WebApp trả lỗi ở action: ${action}`);
          continue;
        }

        return data;
      } catch (e) {
        lastErr = e;
      }
    }
  }

  throw lastErr || new Error("GS WebApp chưa hỗ trợ action cần thiết");
}

// Basic sheet APIs
export const listSheet = (sheet, options = {}) => call("list", { sheet }, options);
export const insertToSheet = (sheet, row, options = {}) => call("insert", { sheet, row }, { requireAuth: true, ...options });
export const updateToSheet = (sheet, row, options = {}) => call("update", { sheet, row }, { requireAuth: true, ...options });
export const deleteFromSheet = (sheet, id, options = {}) => call("delete", { sheet, id }, { requireAuth: true, ...options });

const RUNTIME_CONFIG_KEYS = [
  KEYS.SHEET_ID,
  KEYS.DRIVE_FOLDER_ID,
  KEYS.SHEET_GID_CONFIG,
  KEYS.PRODUCT_TABS,
  KEYS.SHEET_GID_PRODUCTS,
  KEYS.SHEET_GID_MENU,
  KEYS.SHEET_GID_PAGES,
  KEYS.SHEET_GID_ANNOUNCEMENTS,
  KEYS.SHEET_GID_CATEGORIES,
  KEYS.SHEET_GID_TAGS,
  KEYS.SHEET_GID_TYPES,
  KEYS.SHEET_GID_LEVELS,
  KEYS.SHEET_GID_SIZES,
  KEYS.SHEET_GID_FB,
  KEYS.MESSENGER_LINK,
  KEYS.ZALO_LINK,
  KEYS.API_ALL_URL,
  KEYS.GS_WEBAPP_URL,
  KEYS.GS_WEBAPP_TOKEN,
  KEYS.GOOGLE_OAUTH_CLIENT_ID,
  KEYS.SUPER_ADMIN_EMAIL,
  KEYS.ADMIN_ALLOWED_EMAILS,
  KEYS.GEMINI_API_KEYS,
  KEYS.GEMINI_API_KEY,
  KEYS.GEMINI_MODELS_ORDER,
  KEYS.AI_PROMPT_TEMPLATE,
  KEYS.ENABLE_VISITOR_TRACKING,
];

const CONFIG_SHEET_CANDIDATES = ["Config", "config", "Cấu hình", "Cau hinh", "Settings", "URL"];
const USER_SHEET_CANDIDATES = ["Users", "User", "Nguoi dung", "Người dùng"];

function normalizeCfgKey(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeGeminiKeyList(list = []) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const value =
      typeof item === "object"
        ? s(item?.key || item?.value || "")
        : s(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function detectKeyField(row = {}) {
  if (Object.prototype.hasOwnProperty.call(row, "key")) return "key";
  if (Object.prototype.hasOwnProperty.call(row, "name")) return "name";
  if (Object.prototype.hasOwnProperty.call(row, "config_key")) return "config_key";
  return "key";
}

function detectValueField(row = {}) {
  if (Object.prototype.hasOwnProperty.call(row, "value")) return "value";
  if (Object.prototype.hasOwnProperty.call(row, "url")) return "url";
  if (Object.prototype.hasOwnProperty.call(row, "link")) return "link";
  if (Object.prototype.hasOwnProperty.call(row, "config_value")) return "config_value";
  return "value";
}

function extractRowConfigKey(row = {}) {
  const keyField = detectKeyField(row);
  return normalizeCfgKey(row?.[keyField] ?? "");
}

async function resolveConfigSheet(options = {}) {
  let lastError = null;
  for (const sheetName of CONFIG_SHEET_CANDIDATES) {
    try {
      const data = await listSheet(sheetName, options);
      if (data?.ok) return { sheetName, rows: pickArray(data, ["rows", "data", "items"]) };
      lastError = new Error(responseMessage(data) || `Không đọc được tab ${sheetName}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Không tìm thấy tab URL/Config để đồng bộ cấu hình");
}

async function upsertConfigEntries(entries = [], { authToken = "", webappUrl = "" } = {}) {
  const auth = getAdminAuth({ tokenOverride: authToken });
  if (!auth?.token) throw new Error("Thiếu GS WebApp Admin Token để đồng bộ cấu hình");
  const transportOptions = { authToken: auth.token, webappUrl };

  const { sheetName, rows } = await resolveConfigSheet({ webappUrl });
  const byKey = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const cfgKey = extractRowConfigKey(row);
    if (cfgKey) byKey.set(cfgKey, row);
  }

  let inserted = 0;
  let updated = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const cfgKey = normalizeCfgKey(entry?.key || "");
    if (!cfgKey) continue;
    const value = s(entry?.value ?? "");
    const existing = byKey.get(cfgKey);

    if (existing) {
      const keyField = detectKeyField(existing);
      const valueField = detectValueField(existing);
      const oldValue = s(existing?.[valueField] ?? "");
      if (oldValue === value) continue;
      const payload = { ...existing, [keyField]: cfgKey, [valueField]: value };
      try {
        await updateToSheet(sheetName, payload, transportOptions);
        updated += 1;
        byKey.set(cfgKey, payload);
      } catch {
        await insertToSheet(sheetName, { key: cfgKey, value }, transportOptions);
        inserted += 1;
        byKey.set(cfgKey, { key: cfgKey, value });
      }
      continue;
    }

    await insertToSheet(sheetName, { key: cfgKey, value }, transportOptions);
    inserted += 1;
    byKey.set(cfgKey, { key: cfgKey, value });
  }

  return { ok: true, sheetName, inserted, updated };
}

export async function saveRuntimeConfigToSheet(config = {}, options = {}) {
  const entries = RUNTIME_CONFIG_KEYS.map((key) => ({
    key,
    value: s(config?.[key] ?? ""),
  }));
  const effectiveWebappUrl = s(options?.webappUrl || config?.[KEYS.GS_WEBAPP_URL] || "");
  return upsertConfigEntries(entries, { ...options, webappUrl: effectiveWebappUrl });
}

export async function saveGeminiKeysToSheet(keys = [], options = {}) {
  const normalized = normalizeGeminiKeyList(keys);
  const entries = [
    { key: KEYS.GEMINI_API_KEYS, value: normalized.join("\n") },
    { key: KEYS.GEMINI_API_KEY, value: normalized[0] || "" },
  ];
  const result = await upsertConfigEntries(entries, options);
  return { ...result, keyCount: normalized.length };
}

export async function saveAITagsConfigToSheet({ keys = [], models = [], prompt = "" } = {}, options = {}) {
  const normalizedKeys = normalizeGeminiKeyList(keys);
  const normalizedModels = uniq((Array.isArray(models) ? models : []).map((x) => s(x)));
  const entries = [
    { key: KEYS.GEMINI_API_KEYS, value: normalizedKeys.join("\n") },
    { key: KEYS.GEMINI_API_KEY, value: normalizedKeys[0] || "" },
    { key: KEYS.GEMINI_MODELS_ORDER, value: JSON.stringify(normalizedModels) },
    { key: KEYS.AI_PROMPT_TEMPLATE, value: s(prompt) },
  ];
  const result = await upsertConfigEntries(entries, options);
  return { ...result, keyCount: normalizedKeys.length, modelCount: normalizedModels.length };
}

function parseBooleanLike(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (/^(1|true|yes|on|active)$/i.test(raw)) return true;
  if (/^(0|false|no|off|inactive|disabled|locked)$/i.test(raw)) return false;
  return fallback;
}

function parsePermissions(raw = []) {
  if (Array.isArray(raw)) return raw.map((x) => s(x)).filter(Boolean);
  const text = s(raw);
  if (!text) return [];
  const trimmed = text.trim();
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((x) => s(x)).filter(Boolean);
    } catch {}
  }
  return text.split(/[\n,;|]+/).map((x) => s(x)).filter(Boolean);
}

function normalizeUserRow(row = {}) {
  const username = s(row.username || row.user || row.account || row.email).toLowerCase();
  const email = s(row.email || row.username).toLowerCase();
  return {
    ...row,
    id: s(row.id || row.userId || row.uid || username),
    username,
    email,
    password: s(row.password || row.pass || row.matkhau),
    role: s(row.role || "staff") || "staff",
    permissions: parsePermissions(row.permissions || row.perms),
    active: parseBooleanLike(row.active, true),
    isSuper: parseBooleanLike(row.isSuper || row.super, false),
    name: s(row.name || row.displayName || row.fullname || username),
  };
}

export async function listAdminUsersFromSheet() {
  const users = await listUsersFromSheet({ includeInactive: false });
  return users.filter((u) => u.username && u.active !== false);
}

async function resolveUserSheet() {
  let lastError = null;
  for (const sheetName of USER_SHEET_CANDIDATES) {
    try {
      const data = await listSheet(sheetName);
      if (!data?.ok) {
        lastError = new Error(responseMessage(data) || `Không đọc được tab ${sheetName}`);
        continue;
      }
      const rows = pickArray(data, ["rows", "data", "items"]);
      return { sheetName, rows: Array.isArray(rows) ? rows : [] };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Không tìm thấy tab Users");
}

function findExistingUserRow(rows = [], user = {}) {
  const id = s(user?.id).toLowerCase();
  const username = s(user?.username).toLowerCase();
  const email = s(user?.email || user?.username).toLowerCase();
  const normalizedRows = rows.map((r) => normalizeUserRow(r));

  if (id) {
    const hitById = normalizedRows.find((r) => s(r.id).toLowerCase() === id);
    if (hitById) return hitById;
  }
  if (username) {
    const hitByUsername = normalizedRows.find((r) => s(r.username).toLowerCase() === username);
    if (hitByUsername) return hitByUsername;
  }
  if (email) {
    const hitByEmail = normalizedRows.find((r) => s(r.email).toLowerCase() === email);
    if (hitByEmail) return hitByEmail;
  }
  return null;
}

function serializePermissions(perms = []) {
  const arr = Array.isArray(perms) ? perms.map((x) => s(x)).filter(Boolean) : [];
  return JSON.stringify(arr);
}

function buildUserRowPayload(input = {}, existing = null) {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const nowIso = new Date().toISOString();
  const createdAt = s(input.createdAt || base.createdAt || nowIso);
  const id = s(input.id || base.id || input.username || input.email).toLowerCase();
  const username = s(input.username || base.username || input.email).toLowerCase();
  const email = s(input.email || base.email || username).toLowerCase();
  return {
    ...base,
    id,
    username,
    email,
    password: s(input.password !== undefined ? input.password : base.password),
    name: s(input.name || base.name || username),
    role: s(input.role || base.role || "staff"),
    permissions: serializePermissions(input.permissions !== undefined ? input.permissions : base.permissions),
    active: input.active === false ? "0" : "1",
    isSuper: input.isSuper === true ? "1" : "0",
    createdAt,
    createdBy: s(input.createdBy || base.createdBy),
    updatedAt: nowIso,
    updatedBy: s(input.updatedBy || base.updatedBy),
  };
}

export async function listUsersFromSheet({ includeInactive = true } = {}) {
  const { rows } = await resolveUserSheet();
  const mapped = rows.map(normalizeUserRow).filter((u) => u.username);
  if (includeInactive) return mapped;
  return mapped.filter((u) => u.active !== false);
}

export async function upsertAdminUserToSheet(user = {}) {
  const auth = getAdminAuth();
  if (!auth?.token) throw new Error("Chưa cấu hình GS WebApp Admin Token");
  const { sheetName, rows } = await resolveUserSheet();
  const existing = findExistingUserRow(rows, user);
  const payload = buildUserRowPayload(user, existing);

  if (existing) {
    try {
      await updateToSheet(sheetName, payload);
    } catch {
      await insertToSheet(sheetName, payload);
    }
  } else {
    await insertToSheet(sheetName, payload);
  }
  return { ok: true, sheetName, id: payload.id, username: payload.username };
}

export async function deleteAdminUserFromSheet(user = {}) {
  const auth = getAdminAuth();
  if (!auth?.token) throw new Error("Chưa cấu hình GS WebApp Admin Token");
  const { sheetName, rows } = await resolveUserSheet();
  const existing = findExistingUserRow(rows, user);
  if (!existing) return { ok: true, sheetName, skipped: true };

  const targetId = s(existing.id || user.id).toLowerCase();
  if (!targetId) {
    const softPayload = buildUserRowPayload({ ...existing, active: false }, existing);
    await updateToSheet(sheetName, softPayload);
    return { ok: true, sheetName, softDeleted: true };
  }

  try {
    await deleteFromSheet(sheetName, targetId);
    return { ok: true, sheetName, deleted: true };
  } catch {
    const softPayload = buildUserRowPayload({ ...existing, active: false }, existing);
    await updateToSheet(sheetName, softPayload);
    return { ok: true, sheetName, softDeleted: true };
  }
}

const SHEET_TITLE_CACHE = new Map();

function decodeEscapedText(raw = "") {
  return String(raw || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function parseTabsFromEditHtml(html = "") {
  const out = [];
  const seen = new Set();
  const re = /\[(\d+),0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)\\"/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const gid = s(m[2]);
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    out.push({ gid, title: decodeEscapedText(m[3] || "") });
  }
  return out;
}

async function fetchSheetTitleMap(sheetId = "") {
  const id = s(sheetId);
  if (!id) return new Map();
  if (!SHEET_TITLE_CACHE.has(id)) {
    SHEET_TITLE_CACHE.set(
      id,
      fetch(`https://docs.google.com/spreadsheets/d/${id}/edit`)
        .then((res) => (res.ok ? res.text() : ""))
        .then((html) => {
          const map = new Map();
          parseTabsFromEditHtml(html).forEach((tab) => {
            if (tab.gid && tab.title) map.set(tab.gid, tab.title);
          });
          return map;
        })
        .catch(() => new Map())
    );
  }
  return SHEET_TITLE_CACHE.get(id);
}

export async function resolveSheetTitleByGid({ sheetId = "", gid = "" } = {}) {
  const cleanGid = s(gid).replace(/[^\d]/g, "");
  if (!sheetId || !cleanGid) return "";
  const map = await fetchSheetTitleMap(sheetId);
  return s(map.get(cleanGid));
}

function parseProductTabLabel(raw = "") {
  const first = String(raw || "")
    .replace(/\r\n?/g, "\n")
    .split(/[;\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)[0] || "";

  const m1 = first.match(/^(\d+)\s*:\s*(.+)$/);
  if (m1) return s(m1[2]);

  const m2 = first.match(/^(.+?)\s*:\s*(\d+)$/);
  if (m2) return s(m2[1]);

  return "";
}

function titleCaseWord(v = "") {
  const word = s(v);
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export async function getConfiguredProductSheetNames() {
  const sheetId = s(getConfig(KEYS.SHEET_ID, ""));
  const gid = s(getConfig(KEYS.SHEET_GID_PRODUCTS, ""));
  const fromGid = await resolveSheetTitleByGid({ sheetId, gid }).catch(() => "");
  const fromTabs = parseProductTabLabel(getConfig(KEYS.PRODUCT_TABS, ""));
  return uniq([fromGid, fromTabs, titleCaseWord(fromTabs), "Product", "Products"]);
}

export async function listConfiguredProductSheet() {
  let last = null;
  for (const name of await getConfiguredProductSheetNames()) {
    try {
      const data = await listSheet(name);
      if (data?.ok) return data;
      last = new Error(responseMessage(data) || `Khong doc duoc tab ${name}`);
    } catch (e) {
      last = e;
    }
  }
  if (last) throw last;
  throw new Error("Khong xac dinh duoc tab san pham de doc");
}

export async function updateConfiguredProductRow(row) {
  let last = null;
  for (const name of await getConfiguredProductSheetNames()) {
    try {
      return await updateToSheet(name, row);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("Khong xac dinh duoc tab san pham de cap nhat");
}

export async function deleteConfiguredProductRow(id) {
  let last = null;
  for (const name of await getConfiguredProductSheetNames()) {
    try {
      return await deleteFromSheet(name, id);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("Khong xac dinh duoc tab san pham de xoa");
}

function normalizeFolderRow(row = {}) {
  const id = s(row.id || row.folderId || row.driveId || row.fileId);
  const name = s(row.name || row.title || row.folderName);
  const path = s(row.path || row.fullPath || row.folderPath);
  const parentId = s(row.parentId || row.parent || row.parentFolderId);
  const levelRaw = Number(row.level ?? row.depth ?? NaN);
  const level = Number.isFinite(levelRaw) ? levelRaw : null;
  const hasChildren = String(row.hasChildren ?? row.hasSubfolders ?? "").toLowerCase() === "true";
  return { id, name, path, parentId, level, hasChildren };
}

function deriveLeafFolders(rows = [], rootFolderId = "") {
  if (!rows.length) return [];

  const hasParentInfo = rows.some((x) => x.parentId);
  if (!hasParentInfo) return rows;

  const parentIds = new Set(rows.map((x) => x.parentId).filter(Boolean));
  let leaves = rows.filter((x) => !parentIds.has(x.id));

  if (rootFolderId) {
    leaves = leaves.filter((x) => x.id !== rootFolderId);
  }

  return leaves;
}

export async function listDriveFolders({ rootFolderId = "" } = {}) {
  const data = await callWithAliases(
    [
      "drive.listFolders",
      "drive_list_folders",
      "listDriveFolders",
      "list_folders",
      "listFolders",
      "driveListFolders",
      "drive.list_folders",
      "drive/list_folders",
      "driveFolders",
      "drive.folders",
      "folders.list",
    ],
    {
      rootFolderId,
      folderId: rootFolderId,
      parentId: rootFolderId,
      recursive: true,
      includeRoot: true,
      includeLeafOnly: false,
    },
    { requireAuth: true }
  );

  const rowsRaw = pickArray(data, ["folders", "rows", "data", "items", "result"]);
  return rowsRaw.map(normalizeFolderRow).filter((x) => x.id && x.name);
}

export async function listDriveLeafFolders({ rootFolderId = "" } = {}) {
  try {
    const data = await callWithAliases(
      [
        "drive.listLeafFolders",
        "drive_list_leaf_folders",
        "listDriveLeafFolders",
        "list_leaf_folders",
        "listLeafFolders",
        "driveListLeafFolders",
        "drive.list_leaf_folders",
        "drive/list_leaf_folders",
        "leaf_folders",
      ],
      {
        rootFolderId,
        folderId: rootFolderId,
        parentId: rootFolderId,
        recursive: true,
        includeRoot: false,
        includeLeafOnly: true,
      },
      { requireAuth: true }
    );

    const rowsRaw = pickArray(data, ["folders", "rows", "data", "items", "result"]);
    return rowsRaw.map(normalizeFolderRow).filter((x) => x.id && x.name);
  } catch {
    const all = await listDriveFolders({ rootFolderId });
    return deriveLeafFolders(all, rootFolderId);
  }
}

function normalizeHashRow(row = {}) {
  const id = s(row.id || row.fileId || row.driveId);
  const name = s(row.name || row.fileName || row.title);
  const folderId = s(row.folderId || row.parentId || row.parentFolderId);
  const path = s(row.path || row.fullPath || row.folderPath);

  let hash = s(
    row.hash ||
    row.sha256 ||
    row.sha_256 ||
    row.sha1 ||
    row.sha1Checksum ||
    row.md5 ||
    row.md5Checksum ||
    row.checksum
  ).toLowerCase();
  hash = hash.replace(/[^a-f0-9]/g, "");

  let algo = s(row.hashAlgo || row.algo || row.algorithm).toLowerCase();
  if (!algo) {
    if (hash.length === 64) algo = "sha256";
    else if (hash.length === 40) algo = "sha1";
    else if (hash.length === 32) algo = "md5";
  }

  return {
    id,
    name,
    folderId,
    path,
    hash,
    algo,
    size: Number(row.size || row.fileSize || 0) || 0,
    mimeType: s(row.mimeType || row.type),
    url: s(row.url || row.webViewLink || row.fileUrl),
  };
}

export async function listDriveFileHashes({ rootFolderId = "" } = {}) {
  const data = await callWithAliases(
    [
      "drive.listFileHashes",
      "drive_list_file_hashes",
      "listDriveFileHashes",
      "list_file_hashes",
      "listFiles",
      "list_files",
      "drive.list_files",
      "drive/list_files",
      "drive.listFiles",
      "driveListFiles",
      "drive.hashes",
      "drive.listFilesWithHash",
    ],
    {
      rootFolderId,
      folderId: rootFolderId,
      parentId: rootFolderId,
      recursive: true,
      includeHash: true,
      includeMd5: true,
      includeSha256: true,
    },
    { requireAuth: true }
  );

  const rowsRaw = pickArray(data, ["files", "rows", "data", "items", "result"]);
  return rowsRaw
    .map(normalizeHashRow)
    .filter((x) => x.id && x.hash && x.algo && (x.hash.length === 64 || x.hash.length === 40 || x.hash.length === 32));
}

export async function uploadDriveFile({
  folderId = "",
  fileName = "",
  mimeType = "image/jpeg",
  base64 = "",
  category = "",
  tags = "",
  rootFolderId = "",
} = {}) {
  if (!folderId) throw new Error("Thiếu folderId upload");
  if (!base64) throw new Error("Thiếu nội dung file");

  const data = await callWithAliases(
    [
      "drive.uploadFile",
      "drive_upload_file",
      "uploadDriveFile",
      "upload_file",
      "drive.upload_file",
      "drive/upload_file",
      "uploadFile",
      "driveUpload",
      "drive.uploadImage",
    ],
    {
      folderId,
      rootFolderId,
      fileName,
      mimeType,
      base64,
      data: base64,
      contentBase64: base64,
      category,
      tags,
    },
    { requireAuth: true }
  );

  return {
    id: s(data?.id || data?.fileId || data?.driveId),
    name: s(data?.name || data?.fileName || fileName),
    url: s(data?.url || data?.webViewLink || data?.fileUrl || data?.downloadUrl || data?.imageUrl),
    raw: data,
  };
}
