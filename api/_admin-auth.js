import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { text } from "./_http.js";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "hb_admin_session_v1";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_PREFIX = "scrypt";
const OUTBOUND_TIMEOUT_MS = 10_000;

function configured(name, fallbacks = []) {
  for (const key of [name, ...fallbacks]) {
    const value = text(process.env[key] || "");
    if (value) return value;
  }
  return "";
}

export function configuredWebAppUrl() {
  return configured("GS_WEBAPP_URL");
}

export function configuredAdminToken() {
  return configured("GS_WEBAPP_TOKEN", ["HB_ADMIN_TOKEN"]);
}

export function configuredTrackingSheetId() {
  return configured("TRACKING_SHEET_ID");
}

export function sessionSecret() {
  return configured("ADMIN_SESSION_SECRET");
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload) {
  const secret = sessionSecret();
  if (secret.length < 32) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(req = {}) {
  const out = {};
  for (const part of String(req.headers?.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    if (key) out[key] = value;
  }
  return out;
}

function normalizePermissions(raw = []) {
  if (Array.isArray(raw)) return raw.map(text).filter(Boolean);
  const source = text(raw);
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  } catch {}
  return source.split(/[\n,;|]+/).map(text).filter(Boolean);
}

function booleanValue(value, fallback = true) {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on", "active"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "inactive", "disabled", "locked"].includes(normalized)) return false;
  return fallback;
}

export function safeAdminUser(row = {}) {
  const username = text(row.username || row.user || row.account || row.email).toLowerCase();
  return {
    id: text(row.id || row.userId || row.uid || username),
    username,
    email: text(row.email || username).toLowerCase(),
    name: text(row.name || row.displayName || row.fullname || username),
    role: text(row.role || "staff").toLowerCase() || "staff",
    permissions: normalizePermissions(row.permissions || row.perms),
    active: booleanValue(row.active, true),
    isSuper: booleanValue(row.isSuper || row.super, false),
    authProvider: text(row.authProvider || "password"),
    picture: text(row.picture),
  };
}

export function createSessionToken(user = {}) {
  const now = Date.now();
  const payload = encode(JSON.stringify({
    v: 1,
    iat: now,
    exp: now + SESSION_TTL_MS,
    user: safeAdminUser(user),
  }));
  const signature = sign(payload);
  if (!signature) throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters");
  return `${payload}.${signature}`;
}

export function readAdminSession(req = {}) {
  const token = parseCookies(req)[SESSION_COOKIE] || "";
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (!expected || !safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(decode(payload));
    if (parsed?.v !== 1 || Number(parsed?.exp || 0) <= Date.now()) return null;
    const user = safeAdminUser(parsed.user || {});
    if (!user.username || user.active === false) return null;
    return { user, expiresAt: Number(parsed.exp) };
  } catch {
    return null;
  }
}

export function setAdminSession(res, user = {}) {
  const token = createSessionToken(user);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

export function clearAdminSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

function isAllowedWebApp(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" &&
      (host === "script.google.com" || host.endsWith(".script.google.com") ||
        host === "script.googleusercontent.com" || host.endsWith(".script.googleusercontent.com"));
  } catch {
    return false;
  }
}

async function readAppsScriptResponse(res) {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: raw || `Apps Script HTTP ${res.status}` };
  }
}

async function fetchWithTimeout(url, init = {}, timeoutMs = OUTBOUND_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function postToConfiguredAppsScript(payload = {}) {
  const webApp = configuredWebAppUrl();
  const token = configuredAdminToken();
  if (!isAllowedWebApp(webApp)) throw new Error("GS_WEBAPP_URL is missing or invalid");
  if (!token) throw new Error("GS_WEBAPP_TOKEN is missing");

  const body = {
    ...payload,
    _auth: {
      token,
      ts: Date.now(),
      user: payload?._sessionUser || { username: "server", role: "owner", isSuper: true },
    },
  };
  delete body._sessionUser;

  const res = await fetchWithTimeout(webApp, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify(body),
  });
  const data = await readAppsScriptResponse(res);
  if (!res.ok || data?.ok === false) {
    throw new Error(text(data?.error || data?.message || data?.msg) || `Apps Script HTTP ${res.status}`);
  }
  return data;
}

export async function hashPassword(password = "") {
  const value = String(password);
  if (!value) return "";
  if (value.startsWith(`${PASSWORD_PREFIX}$`)) return value;
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64);
  return `${PASSWORD_PREFIX}$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password = "", stored = "") {
  const value = String(stored || "");
  if (!value) return false;
  if (!value.startsWith(`${PASSWORD_PREFIX}$`)) return safeEqual(String(password), value);
  const [, saltRaw, hashRaw] = value.split("$");
  if (!saltRaw || !hashRaw) return false;
  const expected = Buffer.from(hashRaw, "base64url");
  const actual = Buffer.from(await scrypt(String(password), Buffer.from(saltRaw, "base64url"), expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function listUsers() {
  const candidates = ["Users", "User", "Nguoi dung", "Người dùng"];
  let lastError = null;
  for (const sheet of candidates) {
    try {
      const data = await postToConfiguredAppsScript({ action: "list", sheet });
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      return { sheet, rows };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Users sheet unavailable");
}

function rowPassword(row = {}) {
  return text(row.password || row.pass || row.matkhau);
}

function findUser(rows = [], identity = "") {
  const target = text(identity).toLowerCase();
  return rows.find((row) => {
    const username = text(row.username || row.user || row.account || row.email).toLowerCase();
    const email = text(row.email || row.username).toLowerCase();
    return username === target || email === target;
  }) || null;
}

async function migratePlaintextPassword(sheet, row, password) {
  const stored = rowPassword(row);
  if (!stored || stored.startsWith(`${PASSWORD_PREFIX}$`)) return;
  const id = text(row.id || row.userId || row.uid || row.username || row.email);
  if (!id) return;
  const hashed = await hashPassword(password);
  await postToConfiguredAppsScript({
    action: "update",
    sheet,
    row: { ...row, id, password: hashed, updatedAt: new Date().toISOString(), updatedBy: "auth-migration" },
  });
}

export async function authenticatePassword(username = "", password = "") {
  const normalizedUsername = text(username);
  const normalizedPassword = String(password || "");
  if (!normalizedUsername || !normalizedPassword) return null;

  const superUsername = configured("ADMIN_SUPER_USERNAME");
  const superPassword = configured("ADMIN_SUPER_PASSWORD");
  if (superUsername && superPassword &&
      safeEqual(normalizedUsername, superUsername) &&
      safeEqual(normalizedPassword, superPassword)) {
    return safeAdminUser({
      username: superUsername,
      name: configured("ADMIN_SUPER_NAME") || "Super Admin",
      email: configured("SUPER_ADMIN_EMAIL"),
      role: "owner",
      isSuper: true,
      active: true,
    });
  }

  const { sheet, rows } = await listUsers();
  const row = findUser(rows, normalizedUsername);
  if (!row || !booleanValue(row.active, true)) return null;
  if (!await verifyPassword(normalizedPassword, rowPassword(row))) return null;
  migratePlaintextPassword(sheet, row, normalizedPassword).catch(() => {});
  return safeAdminUser(row);
}

export async function authenticateGoogle(accessToken = "") {
  const token = text(accessToken);
  if (!token) return null;
  const res = await fetchWithTimeout("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profile = await res.json().catch(() => ({}));
  if (!res.ok || !profile?.email || profile?.email_verified === false) return null;

  const email = text(profile.email).toLowerCase();
  const superEmail = configured("SUPER_ADMIN_EMAIL").toLowerCase();
  if (superEmail && email === superEmail) {
    return safeAdminUser({
      username: configured("ADMIN_SUPER_USERNAME") || email,
      email,
      name: configured("ADMIN_SUPER_NAME") || text(profile.name) || "Super Admin",
      role: "owner",
      isSuper: true,
      active: true,
      authProvider: "google",
      picture: text(profile.picture),
    });
  }

  const { rows } = await listUsers();
  const row = findUser(rows, email);
  if (!row || !booleanValue(row.active, true)) return null;
  return safeAdminUser({
    ...row,
    email,
    authProvider: "google",
    picture: text(profile.picture),
  });
}

export function canUseAdminProxy(user = {}, payload = {}) {
  const role = text(user.role || "viewer").toLowerCase();
  const action = text(payload.action || payload.op || payload.operation).toLowerCase();
  const sheet = text(payload.sheet || payload.sheetName || payload.tab)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const isWrite = /insert|add|append|create|update|edit|patch|save|delete|remove|erase|upload/.test(action);
  const sensitiveSheet = /^(users?|nguoi_dung|config|url|settings?|cau_hinh)$/.test(sheet);

  if (role === "owner") return true;
  if (role === "manager") return !sensitiveSheet && !/delete|remove|erase/.test(action);
  if (role === "editor") return !sensitiveSheet && !/delete|remove|erase/.test(action);
  return !isWrite && !sensitiveSheet;
}
