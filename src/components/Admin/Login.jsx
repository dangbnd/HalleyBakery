import React, { useState } from "react";
import { LS, authApi, writeLS, audit } from "../../utils.js";

// Super Admin lấy từ env để tránh lộ credential trong source.
const SUPER_ADMIN = {
  username: String(import.meta.env.VITE_SUPER_ADMIN_USERNAME || "").trim(),
  password: String(import.meta.env.VITE_SUPER_ADMIN_PASSWORD || "").trim(),
  role: "owner",
  name: String(import.meta.env.VITE_SUPER_ADMIN_NAME || "Super Admin").trim(),
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

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    setErr("");

    // Check super admin first (only when env is configured)
    const hasSuperCreds = !!(SUPER_ADMIN.username && SUPER_ADMIN.password);
    if (hasSuperCreds && u === SUPER_ADMIN.username && p === SUPER_ADMIN.password) {
      const session = { username: u, role: SUPER_ADMIN.role, name: SUPER_ADMIN.name, isSuper: true };
      writeLS(LS.AUTH, session);
      audit("user.login", { username: u, role: SUPER_ADMIN.role });
      window.location.reload();
      return;
    }

    // Check users from authApi (seeds default dev user in local dev if empty)
    const users = authApi.allUsers();
    const found = users.find(x => x.username === u && x.password === p && x.active !== false);
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
          <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            value={u} onChange={e => setU(e.target.value)} placeholder="Nhập tên đăng nhập" autoFocus />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">Mật khẩu</label>
          <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" type="password"
            value={p} onChange={e => setP(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="w-full bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white rounded-xl py-2.5 font-medium text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
          Đăng nhập
        </button>
      </form>
    </div>
  );
}
