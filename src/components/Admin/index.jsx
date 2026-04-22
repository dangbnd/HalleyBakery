import React, { useEffect, useMemo, useState } from "react";
import AuthGuard from "./core/AuthGuard.jsx";
import AdminOverviewPanel from "./panels/AdminOverviewPanel.jsx";
import AnalyticsPanel from "./panels/AnalyticsPanel.jsx";
import AuditPanel from "./panels/AuditPanel.jsx";
import ProductsPanel from "./panels/ProductsPanel.jsx";
import SettingsPanel from "./panels/SettingsPanel.jsx";
import TypeSizePanel from "./panels/TypeSizePanel.jsx";
import UploadPanel from "./panels/UploadPanel.jsx";
import UsersPanel from "./panels/UsersPanel.jsx";
import AITagsPanel from "./panels/AITagsPanel.jsx";
import { Tabs } from "./ui/tabs.jsx";
import { Badge, Button, Card, cn } from "./ui/primitives.jsx";
import {
  LS,
  audit,
  canAccessAdminTab,
  getAuthUser,
  hasPermission,
  removeLS,
} from "../../utils.js";

const STORAGE_KEYS = {
  workspace: "admin.workspace",
  tool: "admin.tool",
  collapsed: "admin.collapsed",
};

const LEGACY_DARK_TOOLS = new Set(["typesize", "upload", "aitags", "settings"]);

function Icon({ name, active = false, size = 20 }) {
  const color = active ? "#60a5fa" : "currentColor";
  const base = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (name === "overview") {
    return (
      <svg {...base}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (name === "catalog") {
    return (
      <svg {...base}>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v13.5A2.5 2.5 0 0 0 17.5 15H4z" />
        <path d="M4 6.5V20h13.5A2.5 2.5 0 0 0 20 17.5" />
        <path d="M8 8h7" />
        <path d="M8 12h7" />
      </svg>
    );
  }
  if (name === "media") {
    return (
      <svg {...base}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M17 8l-5-5-5 5" />
        <path d="M12 3v12" />
      </svg>
    );
  }
  if (name === "operations") {
    return (
      <svg {...base}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (name === "system") {
    return (
      <svg {...base}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.82-.33 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.32 17l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.14 4.3l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 19.7 7.14l-.06.06A1.7 1.7 0 0 0 19.3 9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" />
      </svg>
    );
  }
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

const WORKSPACES = [
  {
    key: "overview",
    label: "Tổng quan",
    description: "Sức khỏe dữ liệu và việc cần xử lý.",
    icon: "overview",
    tools: [{ key: "overview", label: "Tổng quan", description: "Bảng điều phối chính" }],
  },
  {
    key: "catalog",
    label: "Sản phẩm",
    description: "Catalog, taxonomy và chất lượng dữ liệu.",
    icon: "catalog",
    tools: [
      { key: "products", label: "Sản phẩm", description: "Danh sách catalog và metadata", access: "products" },
      { key: "typesize", label: "Loại & size", description: "Taxonomy sản phẩm", access: "typesize" },
    ],
  },
  {
    key: "media",
    label: "Ảnh & AI",
    description: "Upload, phân loại ảnh và gắn tag AI.",
    icon: "media",
    tools: [
      { key: "upload", label: "Upload ảnh", description: "Nhập ảnh và đưa lên Drive", access: "upload" },
      { key: "aitags", label: "Gắn tag AI", description: "Gợi ý và áp tag bằng AI", access: "aitags" },
    ],
  },
  {
    key: "operations",
    label: "Vận hành",
    description: "Theo dõi người dùng nội bộ, hành vi khách và nhật ký thao tác.",
    icon: "operations",
    tools: [
      { key: "users", label: "Người dùng", description: "Phân quyền và tài khoản admin", access: "users" },
      { key: "analytics", label: "Phân tích", description: "Hành vi khách hiện tại", access: "analytics" },
      { key: "audit", label: "Nhật ký", description: "Audit và visitor log", access: "audit" },
    ],
  },
  {
    key: "system",
    label: "Hệ thống",
    description: "Tích hợp, runtime và điểm kỹ thuật.",
    icon: "system",
    tools: [{ key: "settings", label: "Cấu hình", description: "Tích hợp và runtime", access: "settings" }],
  },
];

function isToolVisible(user, tool) {
  if (tool.key === "overview") return true;
  return canAccessAdminTab(user, tool.access || tool.key);
}

function buildWorkspaceList(user) {
  return WORKSPACES.map((workspace) => ({
    ...workspace,
    tools: workspace.tools.filter((tool) => isToolVisible(user, tool)),
  })).filter((workspace) => workspace.key === "overview" || workspace.tools.length > 0);
}

function Sidebar({ workspaces, currentWorkspace, collapsed, onToggle, onSelect }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden border-r border-slate-800 bg-slate-950/98 text-slate-100 shadow-[0_0_50px_rgba(2,6,23,0.7)] lg:flex lg:flex-col",
        collapsed ? "w-[92px]" : "w-[304px]"
      )}
    >
      <div className="flex h-[78px] items-center gap-3 border-b border-white/8 px-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 text-base font-bold text-white shadow-[0_16px_30px_rgba(244,63,94,0.25)]">
          H
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-wide text-white">HALLEY Admin</div>
            <div className="mt-0.5 text-xs text-slate-500">Bảng điều hành nội bộ</div>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {!collapsed ? "Khu vực làm việc" : "Menu"}
        </div>
        <div className="space-y-1.5">
          {workspaces.map((workspace) => {
            const active = currentWorkspace?.key === workspace.key;
            return (
              <button
                key={workspace.key}
                type="button"
                onClick={() => onSelect(workspace.key)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
                  active
                    ? "border-blue-500/30 bg-gradient-to-r from-blue-500/16 to-violet-500/10 text-white shadow-[0_18px_35px_rgba(37,99,235,0.18)]"
                    : "border-transparent text-slate-400 hover:border-white/8 hover:bg-white/4 hover:text-white"
                )}
                title={collapsed ? workspace.label : undefined}
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5">
                  <Icon name={workspace.icon} active={active} />
                </div>
                {!collapsed ? (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{workspace.label}</div>
                      <Badge variant={active ? "info" : "neutral"} className="!text-[10px]">
                        {workspace.tools.length}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500 group-hover:text-slate-300">
                      {workspace.description}
                    </div>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/8 px-3 py-4">
        <Button variant="ghost" className="w-full !justify-start" onClick={onToggle}>
          <span>{collapsed ? "→" : "←"}</span>
          {!collapsed ? <span>Thu gọn sidebar</span> : null}
        </Button>
      </div>
    </aside>
  );
}

function MobileDrawer({ open, workspaces, currentWorkspace, onClose, onSelect }) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/72 backdrop-blur-sm transition lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[290px] border-r border-slate-800 bg-slate-950 px-4 py-5 text-slate-100 shadow-[0_0_60px_rgba(2,6,23,0.75)] transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 font-bold text-white">
              H
            </div>
            <div>
              <div className="text-sm font-semibold">HALLEY Admin</div>
              <div className="text-xs text-slate-500">Bảng điều hành nội bộ</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>

        <div className="space-y-2">
          {workspaces.map((workspace) => {
            const active = currentWorkspace?.key === workspace.key;
            return (
              <button
                key={workspace.key}
                type="button"
                onClick={() => {
                  onSelect(workspace.key);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
                  active
                    ? "border-blue-500/30 bg-gradient-to-r from-blue-500/16 to-violet-500/10 text-white"
                    : "border-transparent text-slate-400 hover:bg-white/4 hover:text-white"
                )}
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5">
                  <Icon name={workspace.icon} active={active} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{workspace.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{workspace.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function BottomNav({ workspaces, currentWorkspace, onSelect }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/96 backdrop-blur lg:hidden">
      <div className="grid grid-cols-5">
        {workspaces.slice(0, 5).map((workspace) => {
          const active = currentWorkspace?.key === workspace.key;
          return (
            <button
              key={workspace.key}
              type="button"
              onClick={() => onSelect(workspace.key)}
              className={cn("flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition", active ? "text-blue-300" : "text-slate-500")}
            >
              <Icon name={workspace.icon} active={active} size={21} />
              <span className="truncate">{workspace.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TopBar({ workspace, tool, user, onMenu }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/84 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onMenu}>
          ☰
        </Button>

        <div className="min-w-0 text-sm font-medium text-slate-400">
          <span className="text-slate-500">Admin</span>
          <span className="mx-2 text-slate-700">/</span>
          <span>{workspace?.label || "Tổng quan"}</span>
          {tool?.label ? (
            <>
              <span className="mx-2 text-slate-700">/</span>
              <span className="text-white">{tool.label}</span>
            </>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <a href="/" className="hidden rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 sm:inline-flex">
            Xem trang
          </a>
          {user ? (
            <Card className="hidden items-center gap-2.5 border-slate-800 px-3 py-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-500/90 text-sm font-semibold text-white">
                {(user.name?.[0] || user.username?.[0] || "A").toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{user.name || user.username}</div>
                <div className="text-[11px] text-slate-500">
                  {user.role || "staff"}
                  {user.isSuper ? " • Super admin" : ""}
                </div>
              </div>
            </Card>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (user?.username) audit("user.logout", { username: user.username });
              removeLS(LS.AUTH);
              window.location.reload();
            }}
          >
            Đăng xuất
          </Button>
        </div>
      </div>
    </header>
  );
}

function renderTool(toolKey, user, onNavigate) {
  let panel;
  switch (toolKey) {
    case "overview":
      panel = <AdminOverviewPanel onNavigate={onNavigate} />;
      break;
    case "products":
      panel = <ProductsPanel canEdit={hasPermission(user, "products.edit")} canDelete={hasPermission(user, "products.delete")} />;
      break;
    case "typesize":
      panel = <TypeSizePanel />;
      break;
    case "upload":
      panel = <UploadPanel canEdit={hasPermission(user, "upload.edit")} />;
      break;
    case "aitags":
      panel = <AITagsPanel canEdit={hasPermission(user, "aitags.edit")} />;
      break;
    case "users":
      panel = <UsersPanel />;
      break;
    case "analytics":
      panel = <AnalyticsPanel />;
      break;
    case "audit":
      panel = <AuditPanel />;
      break;
    case "settings":
      panel = <SettingsPanel canEdit={hasPermission(user, "settings.edit")} />;
      break;
    default:
      panel = <AdminOverviewPanel onNavigate={onNavigate} />;
      break;
  }

  if (LEGACY_DARK_TOOLS.has(toolKey)) {
    return <div className="legacy-admin-dark">{panel}</div>;
  }

  return panel;
}

export default function AdminIndex() {
  const user = useMemo(() => getAuthUser(), []);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.collapsed) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const workspaces = useMemo(() => buildWorkspaceList(user), [user]);

  const defaultWorkspace = workspaces[0]?.key || "overview";
  const [workspaceKey, setWorkspaceKey] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.workspace);
      if (stored) return stored;
    } catch {
      // ignore
    }
    return defaultWorkspace;
  });
  const [toolKey, setToolKey] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.tool) || "overview";
    } catch {
      return "overview";
    }
  });

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.key === workspaceKey) || workspaces[0],
    [workspaces, workspaceKey]
  );

  const currentTool = useMemo(() => {
    if (!currentWorkspace) return null;
    return currentWorkspace.tools.find((tool) => tool.key === toolKey) || currentWorkspace.tools[0];
  }, [currentWorkspace, toolKey]);

  useEffect(() => {
    if (!currentWorkspace) return;
    if (!currentWorkspace.tools.some((tool) => tool.key === toolKey)) {
      setToolKey(currentWorkspace.tools[0]?.key || "overview");
    }
  }, [currentWorkspace, toolKey]);

  useEffect(() => {
    if (!currentWorkspace) return;
    try {
      localStorage.setItem(STORAGE_KEYS.workspace, currentWorkspace.key);
      if (currentTool?.key) localStorage.setItem(STORAGE_KEYS.tool, currentTool.key);
      localStorage.setItem(STORAGE_KEYS.collapsed, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [currentWorkspace, currentTool, collapsed]);

  const selectWorkspace = (nextWorkspaceKey) => {
    const workspace = workspaces.find((item) => item.key === nextWorkspaceKey);
    if (!workspace) return;
    setWorkspaceKey(workspace.key);
    setToolKey(workspace.tools[0]?.key || "overview");
  };

  const navigateToTool = (nextWorkspaceKey, nextToolKey) => {
    const workspace = workspaces.find((item) => item.key === nextWorkspaceKey);
    if (!workspace) return;
    const tool = workspace.tools.find((item) => item.key === nextToolKey) || workspace.tools[0];
    setWorkspaceKey(workspace.key);
    setToolKey(tool?.key || "overview");
  };

  const showWorkspaceTabs = currentWorkspace && currentWorkspace.tools.length > 1;

  return (
    <AuthGuard minRole="staff">
      <Sidebar
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        onSelect={selectWorkspace}
      />
      <MobileDrawer
        open={mobileOpen}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onClose={() => setMobileOpen(false)}
        onSelect={selectWorkspace}
      />

      <div
        className={cn(
          "min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(217,70,239,0.08),_transparent_20%),linear-gradient(180deg,#020617,#0f172a)] text-slate-200 transition-all",
          collapsed ? "lg:pl-[92px]" : "lg:pl-[304px]"
        )}
      >
        <TopBar workspace={currentWorkspace} tool={currentTool} user={user} onMenu={() => setMobileOpen(true)} />

        <main className="px-4 pb-24 pt-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            {showWorkspaceTabs ? (
              <Tabs
                value={currentTool?.key}
                onChange={(next) => setToolKey(next)}
                tabsClassName="mb-0"
                items={currentWorkspace.tools.map((tool) => ({
                  key: tool.key,
                  label: tool.label,
                  children: renderTool(tool.key, user, navigateToTool),
                }))}
              />
            ) : null}
            {!showWorkspaceTabs ? <div>{renderTool(currentTool?.key || "overview", user, navigateToTool)}</div> : null}
          </div>
        </main>
      </div>

      <BottomNav workspaces={workspaces} currentWorkspace={currentWorkspace} onSelect={selectWorkspace} />
    </AuthGuard>
  );
}
