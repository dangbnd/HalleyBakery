import React, { useMemo, useState } from "react";
import { LS, authApi, writeLS, audit, isAllowedEmail } from "../../utils.js";
import { getConfig, KEYS } from "../../utils/config.js";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_PROFILE_SCOPE = "openid email profile";

let gisLoadPromise = null;

function s(v) {
  return v == null ? "" : String(v).trim();
}

// Super Admin lấy từ env để tránh lộ credential trong source.
const SUPER_ADMIN = {
  username: String(import.meta.env.VITE_SUPER_ADMIN_USERNAME || import.meta.env.VITE_ADMIN_USER || "").trim(),
  password: String(import.meta.env.VITE_SUPER_ADMIN_PASSWORD || import.meta.env.VITE_ADMIN_PASS || "").trim(),
  role: "owner",
  name: String(import.meta.env.VITE_SUPER_ADMIN_NAME || import.meta.env.VITE_ADMIN_NAME || "Super Admin").trim(),
  isSuper: true,
};

function inferRoleFromPermissions(perms = []) {
  const set = new Set(Array.isArray(perms) ? perms : []);
  if (set.has("users.manage")) return "owner";
  if (set.has("settings.edit")) return "manager";
  if ([...set].some((p) => p.endsWith(".edit") || p.endsWith(".delete"))) return "editor";
  if ([...set].some((p) => p.endsWith(".view"))) return "staff";
  return "staff";
}

function normalizeEmail(v = "") {
  return String(v || "").trim().toLowerCase();
}

function ensureGisLoaded() {
  if (typeof window === "undefined") return Promise.reject(new Error("Trình duyệt không khả dụng"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const onLoad = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error("Google Identity chưa sẵn sàng"));
    };

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") {
        onLoad();
        return;
      }
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", () => reject(new Error("Không tải được Google Identity Services")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.setAttribute("data-loaded", "1");
      onLoad();
    };
    script.onerror = () => reject(new Error("Không tải được Google Identity Services"));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

async function fetchGoogleUserInfo(accessToken = "") {
  const token = s(accessToken);
  if (!token) throw new Error("Thiếu access token Google");

  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(s(data?.error_description || data?.error || `Google userinfo lỗi HTTP ${res.status}`));
  }
  return data || {};
}

async function requestGoogleProfile(clientId = "") {
  const normalizedClientId = s(clientId);
  if (!normalizedClientId) throw new Error("Thiếu Google OAuth Client ID");

  await ensureGisLoaded();

  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("Hết thời gian chờ đăng nhập Google"));
    }, 60_000);

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: normalizedClientId,
      scope: GOOGLE_PROFILE_SCOPE,
      prompt: "select_account",
      callback: async (resp) => {
        if (done) return;
        if (resp?.error) {
          done = true;
          clearTimeout(timeout);
          reject(new Error(s(resp.error_description || resp.error || "Google OAuth bị từ chối")));
          return;
        }
        try {
          const profile = await fetchGoogleUserInfo(resp?.access_token);
          if (done) return;
          done = true;
          clearTimeout(timeout);
          resolve(profile);
        } catch (e) {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          reject(e);
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: "select_account" });
  });
}

function findUserByEmail(users = [], email = "") {
  const target = normalizeEmail(email);
  if (!target) return null;
  return (Array.isArray(users) ? users : []).find((x) => {
    const username = normalizeEmail(x?.username);
    const userEmail = normalizeEmail(x?.email);
    return username === target || userEmail === target;
  }) || null;
}

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const allowlistHint = useMemo(() => {
    const raw = s(getConfig(KEYS.ADMIN_ALLOWED_EMAILS, ""));
    if (!raw) return "Allowlist trống: dùng test users trong Google OAuth Console.";
    const count = raw
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean).length;
    return `Allowlist đang bật (${count} mục).`;
  }, []);

  function submit(e) {
    e.preventDefault();
    setErr("");

    const hasSuperCreds = !!(SUPER_ADMIN.username && SUPER_ADMIN.password);
    if (hasSuperCreds && u === SUPER_ADMIN.username && p === SUPER_ADMIN.password) {
      const session = { username: u, role: SUPER_ADMIN.role, name: SUPER_ADMIN.name, isSuper: true };
      writeLS(LS.AUTH, session);
      audit("user.login", { username: u, role: SUPER_ADMIN.role });
      window.location.reload();
      return;
    }

    const users = authApi.allUsers();
    const found = users.find((x) => x.username === u && x.password === p && x.active !== false);
    if (found) {
      const role = found.role || inferRoleFromPermissions(found.permissions || []);
      const session = {
        username: found.username,
        name: found.name || found.username,
        role,
        permissions: found.permissions || [],
        isSuper: !!found.isSuper,
      };
      writeLS(LS.AUTH, session);
      audit("user.login", { username: found.username, role });
      window.location.reload();
      return;
    }

    setErr("Sai tài khoản hoặc mật khẩu");
  }

  async function submitGoogle() {
    if (googleBusy) return;
    setErr("");
    setGoogleBusy(true);

    try {
      const clientId = s(getConfig(KEYS.GOOGLE_OAUTH_CLIENT_ID, ""));
      if (!clientId) {
        throw new Error("Thiếu Google OAuth Client ID trong Cấu hình.");
      }

      const profile = await requestGoogleProfile(clientId);
      const email = normalizeEmail(profile?.email);
      if (!email) throw new Error("Google không trả email hợp lệ.");
      if (profile?.email_verified === false) throw new Error("Email Google chưa xác minh.");

      const allowlistRaw = s(getConfig(KEYS.ADMIN_ALLOWED_EMAILS, ""));
      if (allowlistRaw && !isAllowedEmail(email, allowlistRaw)) {
        throw new Error("Email này chưa được cấp quyền vào admin.");
      }

      const users = authApi.allUsers();
      const found = findUserByEmail(users, email);
      if (found?.active === false) {
        throw new Error("Tài khoản này đã bị khóa.");
      }

      const role = found?.role || inferRoleFromPermissions(found?.permissions || []);
      const session = {
        username: found?.username || email,
        email,
        name: found?.name || s(profile?.name) || email,
        role,
        permissions: found?.permissions || [],
        isSuper: !!found?.isSuper,
        authProvider: "google",
        picture: s(profile?.picture),
      };

      writeLS(LS.AUTH, session);
      audit("user.login.google", { username: session.username, email, role });
      window.location.reload();
    } catch (e) {
      setErr(e?.message || "Đăng nhập Google thất bại");
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-8 shadow-xl space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-pink-500/20 mb-3">H</div>
          <h1 className="text-xl font-bold text-gray-800">Đăng nhập Admin</h1>
          <p className="text-xs text-gray-400 mt-1">Halley Bakery Management</p>
        </div>
        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">Tài khoản</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="Nhập tên đăng nhập"
            autoFocus
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">Mật khẩu</label>
          <div className="relative">
            <input
              className="w-full border border-gray-200 rounded-xl pl-4 pr-11 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              type={showPass ? "text" : "password"}
              value={p}
              onChange={(e) => setP(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute inset-y-0 right-0 w-10 grid place-items-center text-gray-500 hover:text-gray-700"
              aria-label={showPass ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              title={showPass ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPass ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l18 18" />
                  <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
                  <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8-1 2.82-3.02 5.06-5.61 6.33" />
                  <path d="M6.61 6.61C4.62 7.95 3.08 9.8 2 12c1.73 4.89 6 8 10 8 1.52 0 2.97-.36 4.27-1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <button className="w-full bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white rounded-xl py-2.5 font-medium text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
          Đăng nhập
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
            <span className="bg-white px-2 text-gray-400">hoặc</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submitGoogle}
          disabled={googleBusy}
          className="w-full h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          <span className="text-base leading-none">G</span>
          {googleBusy ? "Đang xác thực Google..." : "Đăng nhập bằng Google"}
        </button>
        <p className="text-[11px] text-gray-400 leading-4">{allowlistHint}</p>
      </form>
    </div>
  );
}
