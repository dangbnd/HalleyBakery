import React, { useEffect, useMemo, useState } from "react";
import { LS, audit, readLS, writeLS } from "../../../utils.js";
import { deleteAdminUserFromSheet, listUsersFromSheet, upsertAdminUserToSheet } from "../shared/sheets.js";
import { SUPER_ADMIN_NAME, SUPER_ADMIN_USERNAME } from "../shared/superAdmin.js";
import { Modal } from "../ui/modal.jsx";
import { Table } from "../ui/table.jsx";
import {
  Badge,
  Button,
  Callout,
  Empty,
  Field,
  Input,
  MetricItem,
  MetricStrip,
  PageHeader,
  Section,
  Select,
  Toolbar,
} from "../ui/primitives.jsx";

const PERMISSION_GROUPS = [
  {
    key: "catalog",
    label: "Catalog",
    hint: "Sản phẩm, loại bánh, size và taxonomy.",
    items: [
      { key: "products.view", label: "Xem sản phẩm" },
      { key: "products.edit", label: "Thêm / sửa sản phẩm" },
      { key: "products.delete", label: "Xóa sản phẩm" },
      { key: "typesize.view", label: "Xem loại & size" },
      { key: "typesize.edit", label: "Sửa loại & size" },
    ],
  },
  {
    key: "media",
    label: "Media & AI",
    hint: "Upload, AI tags và pipeline xử lý ảnh.",
    items: [
      { key: "upload.view", label: "Xem upload" },
      { key: "upload.edit", label: "Upload lên Drive" },
      { key: "aitags.view", label: "Xem AI tags" },
      { key: "aitags.edit", label: "Chạy / áp dụng AI tags" },
    ],
  },
  {
    key: "operations",
    label: "Vận hành",
    hint: "Dashboard, nhật ký và quản lý người dùng.",
    items: [
      { key: "analytics.view", label: "Xem phân tích" },
      { key: "audit.view", label: "Xem nhật ký" },
      { key: "users.manage", label: "Quản lý người dùng" },
    ],
  },
  {
    key: "system",
    label: "Hệ thống",
    hint: "Cấu hình kỹ thuật và tích hợp.",
    items: [
      { key: "settings.view", label: "Xem cấu hình" },
      { key: "settings.edit", label: "Sửa cấu hình" },
    ],
  },
];

const PRESETS = {
  viewer: ["products.view"],
  operator: ["products.view", "upload.view", "aitags.view", "analytics.view", "audit.view"],
  editor: [
    "products.view",
    "products.edit",
    "upload.view",
    "upload.edit",
    "aitags.view",
    "aitags.edit",
    "typesize.view",
    "typesize.edit",
    "analytics.view",
    "audit.view",
    "settings.view",
  ],
  manager: [
    "products.view",
    "products.edit",
    "products.delete",
    "upload.view",
    "upload.edit",
    "aitags.view",
    "aitags.edit",
    "typesize.view",
    "typesize.edit",
    "analytics.view",
    "audit.view",
    "settings.view",
    "settings.edit",
    "users.manage",
  ],
};

const ROLE_OPTIONS = [
  { value: "viewer", label: "Chỉ xem" },
  { value: "staff", label: "Nhân viên" },
  { value: "editor", label: "Biên tập" },
  { value: "manager", label: "Quản lý" },
  { value: "owner", label: "Chủ hệ thống" },
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((item) => [item.value, item.label]));

function genId() {
  return `u_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

function isManagerLike(user) {
  if (!user || typeof user !== "object") return false;
  if (user.isSuper === true || user.role === "owner") return true;
  return Array.isArray(user.permissions) && user.permissions.includes("users.manage");
}

function normalizeUsername(value = "") {
  return String(value || "").trim().toLowerCase();
}

function roleBadge(role = "staff") {
  const map = {
    owner: "warning",
    manager: "violet",
    editor: "info",
    staff: "neutral",
    viewer: "neutral",
  };
  return map[role] || "neutral";
}

function summarizeAccess(user) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const set = new Set(permissions);
  return PERMISSION_GROUPS.map((group) => {
    const granted = group.items.filter((item) => set.has(item.key)).length;
    if (!granted) return null;
    return {
      label: group.label,
      granted,
      total: group.items.length,
    };
  }).filter(Boolean);
}

function defaultForm() {
  return {
    username: "",
    password: "",
    name: "",
    role: "staff",
    permissions: [...PRESETS.operator],
  };
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("vi-VN");
  } catch {
    return "—";
  }
}

function UserForm({ form, setForm, message = "" }) {
  const permissionSet = new Set(form.permissions || []);

  const togglePermission = (key) => {
    setForm((prev) => ({
      ...prev,
      permissions: permissionSet.has(key)
        ? prev.permissions.filter((item) => item !== key)
        : [...prev.permissions, key],
    }));
  };

  const applyPreset = (presetKey) => {
    setForm((prev) => ({ ...prev, permissions: [...(PRESETS[presetKey] || [])] }));
  };

  const toggleGroup = (group) => {
    const keys = group.items.map((item) => item.key);
    const allGranted = keys.every((key) => permissionSet.has(key));
    setForm((prev) => ({
      ...prev,
      permissions: allGranted
        ? prev.permissions.filter((key) => !keys.includes(key))
        : [...new Set([...prev.permissions, ...keys])],
    }));
  };

  return (
    <div className="space-y-5">
      {message ? (
        <Callout tone="danger" title="Không thể lưu">
          {message}
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên đăng nhập" hint="Dùng để đăng nhập">
          <Input
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            placeholder="editor01"
            autoComplete="off"
          />
        </Field>
        <Field label="Mật khẩu" hint="Bỏ trống nếu không đổi">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Tên hiển thị">
          <Input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Nguyễn Văn A"
          />
        </Field>
        <Field label="Vai trò">
          <Select value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}>
            {ROLE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Mẫu quyền nhanh" hint={`${form.permissions.length} quyền đã chọn`}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => applyPreset("viewer")}>
            Chỉ xem
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyPreset("operator")}>
            Vận hành
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyPreset("editor")}>
            Biên tập
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyPreset("manager")}>
            Quản lý
          </Button>
          <Button
            type="button"
            variant="subtle"
            size="sm"
            onClick={() => setForm((prev) => ({ ...prev, permissions: [] }))}
          >
            Bỏ hết
          </Button>
        </div>
      </Field>

      <div className="grid gap-4 xl:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => {
          const keys = group.items.map((item) => item.key);
          const granted = keys.filter((key) => permissionSet.has(key)).length;
          const allGranted = granted === keys.length;

          return (
            <div key={group.key} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{group.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {group.hint} • {granted}/{keys.length} quyền
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => toggleGroup(group)}>
                  {allGranted ? "Bỏ nhóm" : "Chọn nhóm"}
                </Button>
              </div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-200 transition hover:border-slate-700 hover:bg-slate-900"
                  >
                    <input
                      type="checkbox"
                      checked={permissionSet.has(item.key)}
                      onChange={() => togglePermission(item.key)}
                      className="h-4 w-4 accent-blue-500"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function UsersPanel() {
  const currentUser = readLS(LS.AUTH, {});
  const currentUsername = normalizeUsername(currentUser?.username);
  const canManageUsers =
    currentUser?.isSuper === true ||
    currentUser?.role === "owner" ||
    (currentUser?.permissions || []).includes("users.manage");

  const [users, setUsers] = useState(() => readLS(LS.USERS, []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState("local");
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [deleteTarget, setDeleteTarget] = useState(null);

  const applyLocal = (list) => {
    setUsers(list);
    writeLS(LS.USERS, list);
  };

  const loadUsers = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await Promise.race([
        listUsersFromSheet({ includeInactive: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000)),
      ]);
      const list = Array.isArray(result) ? result : [];
      applyLocal(list);
      setSource("sheet");
      setNotice(null);
    } catch (error) {
      setSource("local");
      setNotice({
        tone: "warning",
        title: "Đang dùng dữ liệu cục bộ",
        text:
          error?.message === "Timeout"
            ? "Google Sheet phản hồi chậm. Admin vẫn hiển thị bản cục bộ để bạn tiếp tục thao tác."
            : error?.message || "Không tải được danh sách người dùng từ Google Sheet.",
      });
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const stats = useMemo(() => {
    const active = users.filter((item) => item?.active !== false).length;
    const locked = users.filter((item) => item?.active === false).length;
    const managers = users.filter((item) => item?.active !== false && isManagerLike(item)).length;
    return {
      total: users.length + 1,
      active: active + 1,
      locked,
      managers: managers + 1,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((item) => {
      const hay = `${item.username || ""} ${item.name || ""} ${(item.permissions || []).join(" ")} ${item.role || ""}`.toLowerCase();
      if (query && !hay.includes(query.toLowerCase())) return false;
      if (roleFilter && (item.role || "staff") !== roleFilter) return false;
      if (statusFilter === "active" && item.active === false) return false;
      if (statusFilter === "locked" && item.active !== false) return false;
      return true;
    });
  }, [users, query, roleFilter, statusFilter]);

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm());
    setFormMessage("");
    setShowForm(true);
  };

  const openEdit = (user) => {
    setEditId(user.id);
    setForm({
      username: user.username || "",
      password: "",
      name: user.name || "",
      role: user.role || "staff",
      permissions: [...(user.permissions || [])],
    });
    setFormMessage("");
    setShowForm(true);
  };

  const countActiveManagers = (list) => list.filter((item) => item?.active !== false && isManagerLike(item)).length + 1;

  const submitForm = async (event) => {
    event?.preventDefault?.();
    if (saving) return;

    const username = String(form.username || "").trim();
    const usernameLower = normalizeUsername(username);
    setFormMessage("");

    if (!username) {
      setFormMessage("Tên đăng nhập không được để trống.");
      return;
    }

    if (usernameLower === normalizeUsername(SUPER_ADMIN_USERNAME)) {
      setFormMessage("Tên đăng nhập này đã dành riêng cho super admin.");
      return;
    }

    try {
      setSaving(true);

      if (editId) {
        const nextList = users.map((item) => {
          if (item.id !== editId) return item;
          const updated = {
            ...item,
            username,
            email: username,
            name: String(form.name || "").trim(),
            role: form.role || "staff",
            permissions: [...(form.permissions || [])],
          };
          if (form.password) updated.password = form.password;
          return updated;
        });

        if (nextList.filter((item) => normalizeUsername(item.username) === usernameLower).length > 1) {
          setFormMessage("Tên đăng nhập đã tồn tại.");
          return;
        }

        const updatedUser = nextList.find((item) => item.id === editId);
        await upsertAdminUserToSheet({ ...updatedUser, updatedBy: currentUser.username });
        applyLocal(nextList);
        audit("user.update", { targetUser: username, user: currentUser.username });
        setNotice({ tone: "success", title: "Đã cập nhật tài khoản", text: `Tài khoản ${username} đã được lưu.` });
      } else {
        if (!form.password) {
          setFormMessage("Mật khẩu không được để trống khi tạo tài khoản.");
          return;
        }
        if (users.some((item) => normalizeUsername(item.username) === usernameLower)) {
          setFormMessage("Tên đăng nhập đã tồn tại.");
          return;
        }

        const newUser = {
          id: genId(),
          username,
          email: username,
          password: form.password,
          name: String(form.name || "").trim() || username,
          role: form.role || "staff",
          permissions: [...(form.permissions || [])],
          active: true,
          isSuper: false,
          createdAt: Date.now(),
          createdBy: currentUser.username,
        };

        await upsertAdminUserToSheet(newUser);
        applyLocal([newUser, ...users]);
        audit("user.create", { targetUser: newUser.username, user: currentUser.username });
        setNotice({ tone: "success", title: "Đã tạo tài khoản", text: `Tài khoản ${username} đã được thêm.` });
      }

      setShowForm(false);
      setEditId(null);
      await loadUsers({ quiet: true });
    } catch (error) {
      setFormMessage(error?.message || "Không thể đồng bộ người dùng lên Google Sheet.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    if (saving) return;
    const isSelf = normalizeUsername(user.username) === currentUsername;
    const deactivating = user.active !== false;

    if (isSelf && deactivating) {
      setNotice({ tone: "danger", title: "Không thể tự khóa", text: "Tài khoản đang đăng nhập không thể tự khóa." });
      return;
    }

    if (deactivating && isManagerLike(user) && countActiveManagers(users.filter((item) => item.id !== user.id)) === 0) {
      setNotice({
        tone: "danger",
        title: "Cần giữ ít nhất một quản trị",
        text: "Không thể khóa tài khoản cuối cùng có quyền quản lý người dùng.",
      });
      return;
    }

    try {
      setSaving(true);
      const payload = { ...user, active: user.active === false, updatedBy: currentUser.username };
      await upsertAdminUserToSheet(payload);
      applyLocal(users.map((item) => (item.id === user.id ? payload : item)));
      await loadUsers({ quiet: true });
      audit(user.active === false ? "user.activate" : "user.deactivate", { targetUser: user.username, user: currentUser.username });
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Không cập nhật được trạng thái",
        text: error?.message || "Lỗi khi đồng bộ trạng thái người dùng.",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || saving) return;

    const isSelf = normalizeUsername(deleteTarget.username) === currentUsername;
    if (isSelf) {
      setNotice({ tone: "danger", title: "Không thể tự xóa", text: "Tài khoản đang đăng nhập không thể tự xóa." });
      setDeleteTarget(null);
      return;
    }

    if (isManagerLike(deleteTarget) && countActiveManagers(users.filter((item) => item.id !== deleteTarget.id)) === 0) {
      setNotice({
        tone: "danger",
        title: "Không thể xóa",
        text: "Cần giữ lại ít nhất một tài khoản quản trị còn hoạt động.",
      });
      setDeleteTarget(null);
      return;
    }

    try {
      setSaving(true);
      await deleteAdminUserFromSheet(deleteTarget);
      applyLocal(users.filter((item) => item.id !== deleteTarget.id));
      await loadUsers({ quiet: true });
      audit("user.delete", { targetUser: deleteTarget.username, user: currentUser.username });
      setNotice({ tone: "success", title: "Đã xóa tài khoản", text: `${deleteTarget.username} đã được gỡ khỏi hệ thống.` });
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Không xóa được tài khoản",
        text: error?.message || "Lỗi khi xóa người dùng trên Google Sheet.",
      });
    } finally {
      setSaving(false);
      setDeleteTarget(null);
    }
  };

  if (!canManageUsers) {
    return (
      <Empty
        icon="🔒"
        title="Không đủ quyền truy cập"
        hint="Khu vực này yêu cầu quyền users.manage hoặc vai trò Chủ hệ thống."
      />
    );
  }

  const rows = [
    {
      id: "__super__",
      username: SUPER_ADMIN_USERNAME,
      name: SUPER_ADMIN_NAME,
      role: "owner",
      permissions: PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
      active: true,
      createdAt: null,
      builtIn: true,
      isSuper: true,
    },
    ...filteredUsers,
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Người dùng"
        description="Tài khoản và phân quyền admin."
        compact
        actions={
          <>
            <Button variant="ghost" loading={loading} onClick={() => loadUsers()}>
              Đồng bộ
            </Button>
            <Button variant="secondary" onClick={openCreate}>
              Thêm tài khoản
            </Button>
          </>
        }
        chips={
          <>
            <Badge variant="info">Nguồn dữ liệu: {source === "sheet" ? "Google Sheet" : "Bản cục bộ"}</Badge>
            <Badge variant="warning">Super admin cố định</Badge>
          </>
        }
      />

      {notice ? (
        <Callout tone={notice.tone} title={notice.title}>
          {notice.text}
        </Callout>
      ) : null}

      <MetricStrip>
        <MetricItem label="Tổng tài khoản" value={stats.total} meta="Bao gồm cả super admin mặc định" tone="blue" />
        <MetricItem label="Đang hoạt động" value={stats.active} meta="Có thể đăng nhập ngay" tone="emerald" />
        <MetricItem label="Đang khóa" value={stats.locked} meta="Không thể đăng nhập" tone="amber" />
        <MetricItem label="Nhóm quản trị" value={stats.managers} meta="Owner hoặc có quyền users.manage" tone="violet" />
      </MetricStrip>

      <Section
        title="Danh sách tài khoản"
        compact
      >
        <div className="space-y-3">
        <Toolbar className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(320px,1.7fr)_180px_180px]">
          <Input
            className="min-w-0"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên đăng nhập, tên hiển thị..."
          />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="min-w-0">
            <option value="">Tất cả vai trò</option>
            {ROLE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-0">
            <option value="all">Mọi trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đang khóa</option>
          </Select>
        </Toolbar>

        {rows.length === 0 ? (
          <Empty
            icon="👤"
            title="Chưa có tài khoản nào"
            hint='Bấm "Thêm tài khoản" để tạo người dùng quản trị đầu tiên ngoài super admin.'
          />
        ) : (
          <div className="space-y-3">
            <div className="hidden lg:block">
              <Table
                columns={[
                  { title: "Tài khoản", dataIndex: "account", thClass: "w-[26%]" },
                  { title: "Vai trò", dataIndex: "role", thClass: "w-[14%]" },
                  { title: "Phạm vi quyền", dataIndex: "scope" },
                  { title: "Trạng thái", dataIndex: "status", thClass: "w-[15%]" },
                  { title: "Ngày tạo", dataIndex: "created", thClass: "w-[12%]" },
                  { title: "", dataIndex: "actions", thClass: "w-[14%]" },
                ]}
                data={rows}
                rowRender={(row) => {
                  const summary = summarizeAccess(row);
                  const isActive = row.active !== false;
                  return (
                    <tr key={row.id} className="align-top transition hover:bg-slate-900/55">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-sm font-semibold text-white">
                            {(row.username?.[0] || "?").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold text-white">{row.username}</div>
                              {row.builtIn ? <Badge variant="warning">Built-in</Badge> : null}
                            </div>
                            <div className="mt-1 text-sm text-slate-400">{row.name || "Chưa có tên hiển thị"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={roleBadge(row.role)}>{ROLE_LABELS[row.role] || row.role || "Nhân viên"}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {summary.length ? (
                            summary.map((item) => (
                              <Badge key={item.label} variant={item.granted === item.total ? "success" : "info"}>
                                {item.label} {item.granted}/{item.total}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">Chỉ dùng quyền mặc định từ vai trò.</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <Badge variant={isActive ? "success" : "warning"}>
                            {isActive ? "Đang hoạt động" : "Đang khóa"}
                          </Badge>
                          {!row.builtIn ? (
                            <div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={saving}
                                onClick={() => toggleActive(row)}
                              >
                                {isActive ? "Khóa tài khoản" : "Mở khóa"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-400">
                        {row.builtIn ? "Built-in" : formatDate(row.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        {row.builtIn ? (
                          <div className="text-xs text-slate-600">—</div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                              Sửa
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => setDeleteTarget(row)}>
                              Xóa
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                }}
              />
            </div>

            <div className="grid gap-3 lg:hidden">
              {rows.map((row) => {
                const summary = summarizeAccess(row);
                const isActive = row.active !== false;
                return (
                  <div key={row.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">{row.username}</div>
                          {row.builtIn ? <Badge variant="warning">Built-in</Badge> : null}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">{row.name || "Chưa có tên hiển thị"}</div>
                      </div>
                      <Badge variant={roleBadge(row.role)}>{ROLE_LABELS[row.role] || row.role || "Nhân viên"}</Badge>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {summary.length ? (
                        summary.map((item) => (
                          <Badge key={item.label} variant={item.granted === item.total ? "success" : "info"}>
                            {item.label} {item.granted}/{item.total}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">Chỉ dùng quyền mặc định từ vai trò.</span>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-2">
                        <Badge variant={isActive ? "success" : "warning"}>
                          {isActive ? "Đang hoạt động" : "Đang khóa"}
                        </Badge>
                        <div className="text-xs text-slate-500">
                          {row.builtIn ? "Built-in" : `Ngày tạo: ${formatDate(row.createdAt)}`}
                        </div>
                      </div>

                      {row.builtIn ? null : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(row)} disabled={saving}>
                            {isActive ? "Khóa" : "Mở khóa"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                            Sửa
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(row)}>
                            Xóa
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </Section>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? "Sửa tài khoản" : "Thêm tài khoản"}
        description="Cấp quyền theo từng nhóm công việc để admin vận hành gọn và an toàn hơn."
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">{form.permissions.length} quyền đang được chọn</div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Hủy
              </Button>
              <Button variant="secondary" loading={saving} onClick={submitForm}>
                {editId ? "Lưu thay đổi" : "Tạo tài khoản"}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={submitForm}>
          <UserForm form={form} setForm={setForm} message={formMessage} />
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Xóa tài khoản"
        description="Thao tác này sẽ gỡ tài khoản khỏi danh sách quản trị."
        widthClass="max-w-xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button variant="danger" loading={saving} onClick={confirmDelete}>
              Xóa tài khoản
            </Button>
          </div>
        }
      >
        <div className="text-sm leading-6 text-slate-300">
          Bạn sắp xóa tài khoản <span className="font-semibold text-white">{deleteTarget?.username}</span>. Hệ thống sẽ chặn thao tác này nếu đây là tài khoản quản trị cuối cùng còn hoạt động.
        </div>
      </Modal>
    </div>
  );
}
