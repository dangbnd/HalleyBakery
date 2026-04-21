export const LS = {
  AUTH: 'auth', USERS: 'users', AUDIT: 'audit',
  PRODUCTS: 'products', CATEGORIES: 'categories', MENU: 'menu', PAGES: 'pages',
  TAGS: 'tags', SCHEMES: 'schemes', TYPES: 'types', LEVELS: 'levels',
  FB_URLS: 'fb_urls',
  SIZES: 'sizes',
  ANNOUNCEMENTS: "halley_announcements",
};

const hasLS = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export function readLS(key, fallback = null) {
  try {
    if (!hasLS()) return fallback;
    const v = window.localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLS(key, value) {
  try {
    if (!hasLS()) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Xử lý tràn localStorage (QuotaExceededError)
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      // Xoá tất cả cache entries để giải phóng dung lượng
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('cache:')) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => window.localStorage.removeItem(k));
      // Thử ghi lại một lần
      try { window.localStorage.setItem(key, JSON.stringify(value)); }
      catch { console.warn('localStorage vẫn đầy sau khi xoá cache', key); }
    }
  }
}

export function removeLS(key) {
  try {
    if (!hasLS()) return;
    window.localStorage.removeItem(key);
  } catch { }
}

// ⚠️ CẢNH BÁO BẢO MẬT: Đây là auth client-side đơn giản (localStorage).
// Mật khẩu hiển thị trong source code & DevTools. KHÔNG dùng cho dữ liệu nhạy cảm.
// Nếu cần bảo mật thật: authenticate qua server (Firebase Auth, Supabase, v.v.)
const defaultUsers = import.meta.env.DEV
  ? [
      // Seed user chỉ dành cho local dev, tránh tồn tại account mặc định trên production.
      { id: 'u-dev-owner', username: 'dev-owner', password: 'dev-owner', role: 'owner', name: 'Dev Owner' },
    ]
  : [];

export const authApi = {
  allUsers() {
    const users = readLS(LS.USERS, defaultUsers);
    if (!readLS(LS.USERS, null)) writeLS(LS.USERS, users);
    return users;
  },
  setUsers(list) { writeLS(LS.USERS, list); },
  login(username, password) {
    const u = this.allUsers().find(x => x.username === username && x.password === password);
    if (!u) return null;
    writeLS(LS.AUTH, u);
    return u;
  },
  logout() { removeLS(LS.AUTH); },
};

export const roleOrder = { owner: 5, manager: 4, editor: 3, staff: 2, viewer: 1 };

const ROLE_DEFAULT_PERMISSIONS = {
  viewer: ["products.view"],
  staff: ["products.view", "upload.view", "aitags.view", "audit.view", "analytics.view"],
  editor: [
    "products.view", "products.edit",
    "upload.view", "upload.edit",
    "aitags.view", "aitags.edit",
    "categories.view", "categories.edit",
    "typesize.view", "typesize.edit",
    "pages.view", "pages.edit",
    "audit.view",
    "analytics.view",
    "settings.view",
  ],
  manager: [
    "products.view", "products.edit", "products.delete",
    "upload.view", "upload.edit",
    "aitags.view", "aitags.edit",
    "categories.view", "categories.edit",
    "typesize.view", "typesize.edit",
    "pages.view", "pages.edit",
    "audit.view",
    "analytics.view",
    "settings.view", "settings.edit",
  ],
  owner: [
    "products.view", "products.edit", "products.delete",
    "upload.view", "upload.edit",
    "aitags.view", "aitags.edit",
    "categories.view", "categories.edit",
    "typesize.view", "typesize.edit",
    "pages.view", "pages.edit",
    "audit.view",
    "analytics.view",
    "settings.view", "settings.edit",
    "users.manage",
  ],
};

const ADMIN_TAB_PERMISSIONS = {
  products: ["products.view", "products.edit", "products.delete"],
  upload: ["upload.view", "upload.edit"],
  analytics: ["analytics.view"],
  users: ["users.manage"],
  aitags: ["aitags.view", "aitags.edit"],
  audit: ["audit.view"],
  settings: ["settings.view", "settings.edit"],
  typesize: ["typesize.view", "typesize.edit"],
  categories: ["categories.view", "categories.edit"],
  pages: ["pages.view", "pages.edit"],
};

export function parseBooleanLike(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value == null) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (/^(1|true|yes|y|on|x)$/i.test(raw)) return true;
  if (/^(0|false|no|n|off)$/i.test(raw)) return false;
  return fallback;
}

export function getAuthUser() {
  return readLS(LS.AUTH, null);
}

export function getEffectivePermissions(user) {
  if (!user || typeof user !== "object") return new Set();
  const perms = new Set(ROLE_DEFAULT_PERMISSIONS[user.role] || []);
  if (Array.isArray(user.permissions)) {
    user.permissions
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .forEach((p) => perms.add(p));
  }
  if (user.isSuper === true || user.role === "owner") {
    Object.values(ADMIN_TAB_PERMISSIONS).flat().forEach((p) => perms.add(p));
    perms.add("users.manage");
  }
  return perms;
}

export function hasPermission(user, permission) {
  if (!permission) return false;
  if (user?.isSuper === true) return true;
  return getEffectivePermissions(user).has(String(permission).trim());
}

export function hasAnyPermission(user, permissions = []) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function canAccessAdminTab(user, tabKey) {
  return hasAnyPermission(user, ADMIN_TAB_PERMISSIONS[tabKey] || []);
}

export function getUserLevel(user) {
  if (user?.isSuper === true) return 99;
  let level = roleOrder[user?.role || "viewer"] || 0;
  const perms = getEffectivePermissions(user);
  if (perms.has("users.manage")) level = Math.max(level, roleOrder.owner);
  else if (perms.has("settings.edit")) level = Math.max(level, roleOrder.manager);
  else if ([...perms].some((p) => p.endsWith(".edit") || p.endsWith(".delete"))) level = Math.max(level, roleOrder.editor);
  else if ([...perms].some((p) => p.endsWith(".view"))) level = Math.max(level, roleOrder.staff);
  return level;
}

export function can(user, action, resource) {
  if (!resource) return false;
  if (action === "read") {
    const keys = resource === "users"
      ? ["users.manage"]
      : [`${resource}.view`, `${resource}.edit`, `${resource}.delete`, `${resource}.manage`];
    return hasAnyPermission(user, keys);
  }
  if (action === "create" || action === "update") {
    if (resource === "users") return hasPermission(user, "users.manage");
    if (resource === "settings") return hasPermission(user, "settings.edit");
    return hasPermission(user, `${resource}.edit`);
  }
  if (action === "delete") return hasPermission(user, `${resource}.delete`);
  if (action === "manage" && resource === "users") return hasPermission(user, "users.manage");
  return false;
}

export function guard(user, action, resource, fn) {
  return (...args) => { if (!can(user, action, resource)) return; return fn(...args); };
}

export function parseEmailAllowlist(raw = "") {
  return new Set(
    String(raw || "")
      .split(/[\n,;]+/)
      .map((x) => String(x || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedEmail(email = "", allowlistRaw = "") {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return false;
  const allow = parseEmailAllowlist(allowlistRaw);
  if (!allow.size) return false;
  if (allow.has(target)) return true;

  const at = target.indexOf("@");
  if (at < 0) return false;
  const domain = target.slice(at + 1);
  if (!domain) return false;

  for (const entry of allow) {
    const rule = String(entry || "").trim().toLowerCase();
    if (!rule) continue;
    if (rule.startsWith("@") && domain === rule.slice(1)) return true;
    if (rule.startsWith("*@") && domain === rule.slice(2)) return true;
  }
  return false;
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export function audit(event, payload) {
  const list = readLS(LS.AUDIT, []);
  list.unshift({ id: uid(), ts: Date.now(), event, payload });
  writeLS(LS.AUDIT, list.slice(0, 500));
}

export function readAudit() { return readLS(LS.AUDIT, []); }
