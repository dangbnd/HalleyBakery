// src/components/Admin/panels/UsersPanel.jsx
import React, { useState } from "react";
import { LS, readLS, writeLS, audit } from "../../../utils.js";

/* ===== DANH SÁCH QUYỀN ===== */
const PERMISSIONS = [
    { key: "products.view", label: "Xem sản phẩm", group: "Sản phẩm", icon: "🛍️" },
    { key: "products.edit", label: "Thêm / sửa sản phẩm", group: "Sản phẩm", icon: "🛍️" },
    { key: "products.delete", label: "Xoá sản phẩm", group: "Sản phẩm", icon: "🛍️" },
    { key: "categories.view", label: "Xem danh mục", group: "Danh mục", icon: "🏷️" },
    { key: "categories.edit", label: "Sửa danh mục", group: "Danh mục", icon: "🏷️" },
    { key: "typesize.view", label: "Xem loại & size", group: "Loại & Size", icon: "📐" },
    { key: "typesize.edit", label: "Sửa loại & size", group: "Loại & Size", icon: "📐" },
    { key: "pages.view", label: "Xem trang nội dung", group: "Trang", icon: "📄" },
    { key: "pages.edit", label: "Sửa trang nội dung", group: "Trang", icon: "📄" },
    { key: "audit.view", label: "Xem nhật ký", group: "Hệ thống", icon: "📋" },
    { key: "users.manage", label: "Quản lý người dùng", group: "Hệ thống", icon: "👥" },
    { key: "settings.view", label: "Xem cấu hình", group: "Hệ thống", icon: "⚙️" },
    { key: "settings.edit", label: "Sửa cấu hình", group: "Hệ thống", icon: "⚙️" },
];

const GROUPS = [...new Set(PERMISSIONS.map(p => p.group))];

/* Preset templates for quick assignment */
const PRESETS = {
    "Quản lý": PERMISSIONS.map(p => p.key),
    "Biên tập": PERMISSIONS.filter(p => !p.key.includes("delete") && !p.key.includes("settings.edit")).map(p => p.key),
    "Chỉ xem": PERMISSIONS.filter(p => p.key.includes(".view")).map(p => p.key),
};
const ROLES = [
    { value: "viewer", label: "Viewer" },
    { value: "staff", label: "Staff" },
    { value: "editor", label: "Editor" },
    { value: "manager", label: "Manager" },
    { value: "owner", label: "Owner" },
];
const SUPER_ADMIN_USERNAME = String(import.meta.env.VITE_SUPER_ADMIN_USERNAME || "").trim();
const SUPER_ADMIN_NAME = String(import.meta.env.VITE_SUPER_ADMIN_NAME || "Super Admin").trim();
const HAS_SUPER_ADMIN = Boolean(SUPER_ADMIN_USERNAME);

function genId() { return "u_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36); }
function hasManageUsersPermission(user) {
    if (!user || typeof user !== "object") return false;
    if (user.isSuper === true) return true;
    if (user.role === "owner") return true;
    return Array.isArray(user.permissions) && user.permissions.includes("users.manage");
}

/* ====================== MAIN ====================== */
export default function UsersPanel() {
    const currentUser = readLS(LS.AUTH, {});
    const permsSet = new Set(Array.isArray(currentUser.permissions) ? currentUser.permissions : []);
    const canManageUsers = currentUser.isSuper === true || currentUser.role === "owner" || permsSet.has("users.manage");

    const [users, setUsers] = useState(() => readLS(LS.USERS, []));
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ username: "", password: "", name: "", role: "staff", permissions: [] });
    const [msg, setMsg] = useState("");
    const currentUsername = String(currentUser.username || "").trim().toLowerCase();

    const save = (list) => { setUsers(list); writeLS(LS.USERS, list); };
    const countActiveManagers = (list) => list.filter(u => u.active !== false && hasManageUsersPermission(u)).length;

    const openAdd = () => {
        setEditId(null);
        setForm({ username: "", password: "", name: "", role: "staff", permissions: [...PRESETS["Chỉ xem"]] });
        setShowForm(true);
        setMsg("");
    };

    const openEdit = (u) => {
        setEditId(u.id);
        setForm({
            username: u.username,
            password: "",
            name: u.name || "",
            role: u.role || "staff",
            permissions: [...(u.permissions || [])],
        });
        setShowForm(true);
        setMsg("");
    };

    const togglePerm = (key) => {
        setForm(f => ({
            ...f,
            permissions: f.permissions.includes(key)
                ? f.permissions.filter(k => k !== key)
                : [...f.permissions, key],
        }));
    };

    const applyPreset = (presetName) => {
        setForm(f => ({ ...f, permissions: [...PRESETS[presetName]] }));
    };

    const toggleGroup = (group) => {
        const groupKeys = PERMISSIONS.filter(p => p.group === group).map(p => p.key);
        const allChecked = groupKeys.every(k => form.permissions.includes(k));
        setForm(f => ({
            ...f,
            permissions: allChecked
                ? f.permissions.filter(k => !groupKeys.includes(k))
                : [...new Set([...f.permissions, ...groupKeys])],
        }));
    };

    const submitForm = (e) => {
        e.preventDefault();
        setMsg("");
        const username = form.username.trim();
        const usernameLower = username.toLowerCase();

        if (!username) { setMsg("Ten dang nhap khong duoc trong"); return; }
        if (HAS_SUPER_ADMIN && usernameLower === SUPER_ADMIN_USERNAME.toLowerCase()) { setMsg("Khong the dung ten nay"); return; }

        if (editId) {
            const next = users.map(u => {
                if (u.id !== editId) return u;
                const updated = {
                    ...u,
                    username,
                    name: form.name.trim(),
                    role: form.role || "staff",
                    permissions: form.permissions,
                };
                if (form.password) updated.password = form.password;
                return updated;
            });
            if (next.filter(u => String(u.username || "").trim().toLowerCase() === usernameLower).length > 1) {
                setMsg("Ten dang nhap da ton tai");
                return;
            }
            if (!HAS_SUPER_ADMIN && countActiveManagers(next) === 0) {
                setMsg("Phai con it nhat 1 tai khoan owner/users.manage dang hoat dong");
                return;
            }
            save(next);
            audit("user.update", { targetUser: username, user: currentUser.username });
        } else {
            if (!form.password) { setMsg("Mat khau khong duoc trong"); return; }
            if (users.some(u => String(u.username || "").trim().toLowerCase() === usernameLower)) {
                setMsg("Ten dang nhap da ton tai");
                return;
            }
            const newUser = {
                id: genId(),
                username,
                password: form.password,
                name: form.name.trim() || username,
                role: form.role || "staff",
                permissions: form.permissions,
                active: true,
                createdAt: Date.now(),
                createdBy: currentUser.username,
            };
            save([...users, newUser]);
            audit("user.create", { targetUser: newUser.username, user: currentUser.username });
        }
        setShowForm(false);
        setEditId(null);
    };
    const toggleActive = (u) => {
        const isSelf = String(u.username || "").trim().toLowerCase() === currentUsername;
        const deactivating = u.active !== false;
        if (isSelf && deactivating) {
            setMsg("Khong the tu khoa tai khoan dang dang nhap");
            return;
        }
        if (!HAS_SUPER_ADMIN && deactivating && hasManageUsersPermission(u) && countActiveManagers(users) <= 1) {
            setMsg("Phai con it nhat 1 tai khoan owner/users.manage dang hoat dong");
            return;
        }
        save(users.map(x => x.id === u.id ? { ...x, active: x.active === false ? true : false } : x));
        audit(deactivating ? "user.deactivate" : "user.activate", { targetUser: u.username, user: currentUser.username });
    };
    const deleteUser = (u) => {
        const isSelf = String(u.username || "").trim().toLowerCase() === currentUsername;
        if (isSelf) {
            setMsg("Khong the xoa tai khoan dang dang nhap");
            return;
        }
        if (!HAS_SUPER_ADMIN && hasManageUsersPermission(u)) {
            const remain = users.filter(x => x.id !== u.id);
            if (countActiveManagers(remain) === 0) {
                setMsg("Phai con it nhat 1 tai khoan owner/users.manage dang hoat dong");
                return;
            }
        }
        if (!confirm(`Xoa tai khoan "${u.username}"?`)) return;
        save(users.filter(x => x.id !== u.id));
        audit("user.delete", { targetUser: u.username, user: currentUser.username });
    };
    if (!canManageUsers) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <span className="text-5xl mb-4 opacity-30">🔒</span>
                <p className="text-lg font-medium text-gray-500">Không đủ quyền</p>
                <p className="text-sm mt-1">Cần quyền quản lý người dùng (owner/users.manage)</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
            <div className="shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Quản lý người dùng</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Tạo tài khoản và cấp quyền tuỳ chỉnh</p>
                    </div>
                    <button onClick={openAdd}
                        className="h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm hover:shadow active:scale-[0.98] flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                        Thêm tài khoản
                    </button>
                </div>
            </div>

            {/* ===== Permission Form Modal ===== */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
                    <form onClick={(e) => e.stopPropagation()} onSubmit={submitForm}
                        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
                            <h3 className="text-base font-semibold text-gray-800">{editId ? "Sửa tài khoản" : "Thêm tài khoản mới"}</h3>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            {msg && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{msg}</div>}

                            {/* Basic info */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Tên đăng nhập</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                                        value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="vd: editor01" autoFocus />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                                        {editId ? "Mật khẩu mới (trống = giữ)" : "Mật khẩu"}
                                    </label>
                                    <input type="password" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                                        value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Tên hiển thị</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nguyễn Văn A" />
                                </div>
                            </div>
                            <div className="max-w-[220px]">
                                <label className="text-xs font-medium text-gray-600 mb-1 block">Vai trò</label>
                                <select
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition bg-white"
                                    value={form.role}
                                    onChange={e => setForm({ ...form, role: e.target.value })}
                                >
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            {/* Permission presets */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs font-semibold text-gray-700">Cấp quyền nhanh:</span>
                                    {Object.keys(PRESETS).map(name => (
                                        <button key={name} type="button" onClick={() => applyPreset(name)}
                                            className="px-3 py-1 text-[11px] font-medium border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition">
                                            {name}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => setForm(f => ({ ...f, permissions: [] }))}
                                        className="px-3 py-1 text-[11px] font-medium text-red-500 border border-red-200 rounded-full hover:bg-red-50 transition">
                                        Bỏ hết
                                    </button>
                                </div>

                                {/* Permission groups with checkboxes */}
                                <div className="space-y-3">
                                    {GROUPS.map(group => {
                                        const perms = PERMISSIONS.filter(p => p.group === group);
                                        const allChecked = perms.every(p => form.permissions.includes(p.key));
                                        const someChecked = perms.some(p => form.permissions.includes(p.key));
                                        return (
                                            <div key={group} className="border border-gray-200 rounded-xl overflow-hidden">
                                                {/* Group header */}
                                                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition"
                                                    onClick={() => toggleGroup(group)}>
                                                    <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                                                        onChange={() => toggleGroup(group)} className="accent-blue-600 w-4 h-4 rounded" onClick={e => e.stopPropagation()} />
                                                    <span className="text-sm font-semibold text-gray-700">{perms[0]?.icon} {group}</span>
                                                    <span className="text-[10px] text-gray-400 ml-auto">{perms.filter(p => form.permissions.includes(p.key)).length}/{perms.length}</span>
                                                </div>
                                                {/* Individual permissions */}
                                                <div className="divide-y divide-gray-50">
                                                    {perms.map(p => (
                                                        <label key={p.key}
                                                            className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${form.permissions.includes(p.key) ? "bg-blue-50/40" : "hover:bg-gray-50"
                                                                }`}>
                                                            <input type="checkbox" checked={form.permissions.includes(p.key)}
                                                                onChange={() => togglePerm(p.key)} className="accent-blue-600 w-3.5 h-3.5 rounded" />
                                                            <span className="text-sm text-gray-700">{p.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center gap-2 bg-gray-50/50">
                            <span className="text-xs text-gray-400 mr-auto">{form.permissions.length}/{PERMISSIONS.length} quyền được chọn</span>
                            <button type="button" onClick={() => setShowForm(false)}
                                className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Huỷ</button>
                            <button type="submit"
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition shadow-sm">
                                {editId ? "Cập nhật" : "Tạo tài khoản"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ===== User list ===== */}
            <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200/80 shadow-sm">
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                        <col style={{ width: "2.5rem" }} />
                        <col style={{ width: "9rem" }} />
                        <col style={{ width: "8rem" }} />
                        <col />
                        <col style={{ width: "5rem" }} />
                        <col style={{ width: "6rem" }} />
                        <col style={{ width: "5rem" }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-gray-200">
                            <th className="py-2.5 px-3 bg-gray-50" />
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Tài khoản</th>
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Tên</th>
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Quyền hạn</th>
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Trạng thái</th>
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Ngày tạo</th>
                            <th className="py-2.5 px-3 bg-gray-50" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {/* Super Admin (from env) */}
                        {HAS_SUPER_ADMIN && (
                            <tr className="bg-amber-50/30">
                                <td className="py-3 px-3 text-center"><span className="text-base">👑</span></td>
                                <td className="py-3 px-3"><span className="font-mono text-xs font-bold text-amber-800">{SUPER_ADMIN_USERNAME}</span></td>
                                <td className="py-3 px-3 text-sm text-gray-700 font-medium">{SUPER_ADMIN_NAME}</td>
                                <td className="py-3 px-3">
                                    <span className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-bold">Toàn quyền</span>
                                </td>
                                <td className="py-3 px-3">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                                    </span>
                                </td>
                                <td className="py-3 px-3 text-[10px] text-gray-400">Env</td>
                                <td className="py-3 px-3 text-center text-[10px] text-gray-300">—</td>
                            </tr>
                        )}

                        {/* Dynamic users */}
                        {users.map(u => {
                            const perms = u.permissions || [];
                            const permCount = perms.length;
                            return (
                                <tr key={u.id} className="group hover:bg-blue-50/30 transition-colors">
                                    <td className="py-3 px-3 text-center">
                                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                                            {(u.username?.[0] || "?").toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="py-3 px-3">
                                        <span className="font-mono text-xs font-medium text-gray-800">{u.username}</span>
                                    </td>
                                    <td className="py-3 px-3 text-sm text-gray-700">{u.name || "—"}</td>
                                    <td className="py-3 px-3">
                                        <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[9px] border border-slate-200">
                                            {u.role || "staff"}
                                        </span>
                                        <div className="flex flex-wrap gap-0.5">
                                            {GROUPS.map(group => {
                                                const groupPerms = PERMISSIONS.filter(p => p.group === group);
                                                const has = groupPerms.filter(p => perms.includes(p.key)).length;
                                                if (has === 0) return null;
                                                const full = has === groupPerms.length;
                                                return (
                                                    <span key={group} className={`inline-block px-1.5 py-0.5 rounded text-[9px] border ${full ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"
                                                        }`} title={groupPerms.filter(p => perms.includes(p.key)).map(p => p.label).join(", ")}>
                                                        {group} {has}/{groupPerms.length}
                                                    </span>
                                                );
                                            })}
                                            {permCount === 0 && <span className="text-[10px] text-gray-300">Không có quyền</span>}
                                        </div>
                                    </td>
                                    <td className="py-3 px-3">
                                        <button onClick={() => toggleActive(u)}
                                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full cursor-pointer transition ${u.active !== false
                                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                                    : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                                }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${u.active !== false ? "bg-emerald-500" : "bg-red-500"}`} />
                                            {u.active !== false ? "Active" : "Khoá"}
                                        </button>
                                    </td>
                                    <td className="py-3 px-3 text-[10px] text-gray-400">
                                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("vi") : "—"}
                                    </td>
                                    <td className="py-3 px-3">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEdit(u)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Sửa">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                                            </button>
                                            <button onClick={() => deleteUser(u)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Xoá">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {users.length === 0 && (
                    <div className="py-12 text-center">
                        <div className="text-3xl mb-2 opacity-30">👥</div>
                        <div className="text-sm text-gray-400">Chưa có tài khoản nào khác</div>
                        <div className="text-xs text-gray-300 mt-1">Bấm "Thêm tài khoản" để tạo</div>
                    </div>
                )}
            </div>
        </div>
    );
}



