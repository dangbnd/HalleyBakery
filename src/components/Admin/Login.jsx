import React, { useMemo, useState } from "react";
import { LS, authApi, writeLS, audit } from "../../utils.js";
import { getConfig, KEYS } from "../../utils/config.js";
import { listAdminUsersFromSheet } from "./shared/sheets.js";
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_USERNAME,
  isSuperAdminEmail,
  isSuperAdminPasswordLogin,
} from "./shared/superAdmin.js";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_PROFILE_SCOPE = "openid email profile";

let gisLoadPromise = null;

function s(v) {
  return v == null ? "" : String(v).trim();
}

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

async function loadUsersForAuth() {
  try {
    const users = await listAdminUsersFromSheet();
    return Array.isArray(users) ? users : [];
  } catch {
    if (import.meta.env.DEV) return authApi.allUsers();
    return [];
  }
}

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const superAdminEmail = normalizeEmail(getConfig(KEYS.SUPER_ADMIN_EMAIL, DEFAULT_SUPER_ADMIN_EMAIL));

  const allowlistHint = useMemo(() => {
    return `Google OAuth dạng Testing: chỉ email nằm trong Test Users của Google mới đăng nhập được.`;
  }, [superAdminEmail]);

  async function submit(e) {
    e.preventDefault();
    setErr("");

    if (isSuperAdminPasswordLogin(u, p)) {
      const session = { username: SUPER_ADMIN_USERNAME, role: "owner", name: SUPER_ADMIN_NAME, isSuper: true };
      writeLS(LS.AUTH, session);
      audit("user.login", { username: SUPER_ADMIN_USERNAME, role: "owner" });
      window.location.reload();
      return;
    }

    const users = await loadUsersForAuth();
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
      const isGoogleSuperAdmin = isSuperAdminEmail(email, superAdminEmail);

      const users = await loadUsersForAuth();
      const found = findUserByEmail(users, email);
      if (!isGoogleSuperAdmin && found?.active === false) {
        throw new Error("Tài khoản này đã bị khóa.");
      }

      const role = isGoogleSuperAdmin
        ? "owner"
        : (found?.role || (found ? inferRoleFromPermissions(found?.permissions || []) : "viewer"));
      const session = {
        username: isGoogleSuperAdmin ? SUPER_ADMIN_USERNAME : (found?.username || email),
        email,
        name: isGoogleSuperAdmin ? SUPER_ADMIN_NAME : (found?.name || s(profile?.name) || email),
        role,
        permissions: isGoogleSuperAdmin ? [] : (found?.permissions || []),
        isSuper: isGoogleSuperAdmin || !!found?.isSuper,
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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(217,70,239,0.10),_transparent_20%),linear-gradient(180deg,#020617,#0f172a)] px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-[28px] border border-slate-800 bg-slate-900/92 p-8 shadow-[0_32px_80px_rgba(2,6,23,0.55)] backdrop-blur"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 text-2xl font-bold text-white shadow-[0_16px_30px_rgba(244,63,94,0.28)]">
            H
          </div>
          <h1 className="text-xl font-bold text-white">Đăng nhập Admin</h1>
          <p className="mt-1 text-xs text-slate-500">HALLEY Bakery • Bảng điều hành nội bộ</p>
        </div>
        {err ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</div>
        ) : null}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Tài khoản</label>
          <input
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="Nhập tên đăng nhập"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Mật khẩu</label>
          <div className="relative">
            <input
              className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-4 pr-11 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              type={showPass ? "text" : "password"}
              value={p}
              onChange={(e) => setP(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 transition hover:text-slate-300"
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
        <button className="w-full rounded-xl border border-blue-500/70 bg-blue-500 py-2.5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(59,130,246,0.25)] transition-all hover:bg-blue-400 active:scale-[0.98]">
          Đăng nhập
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
            <span className="bg-slate-900 px-2 text-slate-500">hoặc</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submitGoogle}
          disabled={googleBusy}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 text-sm font-medium text-slate-200 transition hover:border-slate-700 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-base leading-none">G</span>
          {googleBusy ? "Đang xác thực Google..." : "Đăng nhập bằng Google"}
        </button>
        <p className="text-[11px] leading-4 text-slate-500">{allowlistHint}</p>
      </form>
    </div>
  );
}
