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
const defaultUsers = [
  { id: 'u1', username: 'owner', password: 'owner', role: 'owner', name: 'Owner' },
  { id: 'u2', username: 'manager', password: 'manager', role: 'manager', name: 'Manager' },
  { id: 'u3', username: 'editor', password: 'editor', role: 'editor', name: 'Editor' },
  { id: 'u4', username: 'staff', password: 'staff', role: 'staff', name: 'Staff' },
];

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

const roleOrder = { owner: 5, manager: 4, editor: 3, staff: 2, viewer: 1 };

export function can(user, action, resource) {
  const lvl = roleOrder[user?.role || 'viewer'] || 0;
  if (action === 'read') return true;
  if (['create', 'update'].includes(action)) return lvl >= 3;
  if (action === 'delete') return lvl >= 4;
  if (action === 'manage' && resource === 'users') return lvl >= 5;
  if (action === 'update' && resource === 'settings') return lvl >= 3;
  return false;
}

export function guard(user, action, resource, fn) {
  return (...args) => { if (!can(user, action, resource)) return; return fn(...args); };
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export function audit(event, payload) {
  const list = readLS(LS.AUDIT, []);
  list.unshift({ id: uid(), ts: Date.now(), event, payload });
  writeLS(LS.AUDIT, list.slice(0, 500));
}

export function readAudit() { return readLS(LS.AUDIT, []); }
