import React, { useEffect, useMemo, useState } from "react";
import AuthGuard from "./core/AuthGuard.jsx";

import ProductsPanel from "./panels/ProductsPanel.jsx";
import UploadPanel from "./panels/UploadPanel.jsx";
import TypeSizePanel from "./panels/TypeSizePanel.jsx";
import SettingsPanel from "./panels/SettingsPanel.jsx";
import AuditPanel from "./panels/AuditPanel.jsx";
import UsersPanel from "./panels/UsersPanel.jsx";
import AITagsPanel from "./panels/AITagsPanel.jsx";
import {
  LS,
  audit,
  canAccessAdminTab,
  getAuthUser,
  hasPermission,
  readLS,
  removeLS,
} from "../../utils.js";

const NAVS = [
  { key: "products", label: "Sản phẩm" },
  { key: "upload", label: "Upload" },
  { key: "users", label: "Người dùng" },
  { key: "aitags", label: "AI Tags" },
  { key: "audit", label: "Nhật ký" },
  { key: "settings", label: "Cấu hình" },
];

function NavIcon({ k, size = 20, active = false }) {
  const col = active ? "#ec4899" : "currentColor";
  const sw = 1.8;
  const base = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: col, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  if (k === "products") return (
    <svg {...base}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" x2="21" y1="6" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
  if (k === "upload") return (
    <svg {...base}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
  if (k === "users") return (
    <svg {...base}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
  if (k === "aitags") return (
    <svg {...base}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44L4.91 9.5A2.5 2.5 0 0 1 7.09 6.5H9.5V2Z" strokeWidth={sw} />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44l2.13-10.44A2.5 2.5 0 0 0 16.91 6.5H14.5V2Z" strokeWidth={sw} />
    </svg>
  );
  if (k === "audit") return (
    <svg {...base}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
  if (k === "settings") return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
  return <svg {...base}><circle cx="12" cy="12" r="10" /></svg>;
}

function Sidebar({ navs, tab, setTab, collapsed, toggle }) {
  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-full flex flex-col
                  bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950
                  text-white transition-all duration-300 ease-in-out
                  ${collapsed ? "w-[68px]" : "w-56"}
                  shadow-2xl border-r border-white/5`}
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-lg font-bold shadow-lg shadow-pink-500/20">
          H
        </div>
        {!collapsed && (
          <div className="overflow-hidden whitespace-nowrap">
            <div className="text-sm font-bold tracking-wide">HALLEY</div>
            <div className="text-[10px] text-gray-400 -mt-0.5">Admin Panel</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navs.map((it) => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setTab(it.key)}
              title={collapsed ? it.label : undefined}
              className={`w-full flex items-center gap-3 rounded-xl text-sm transition-all duration-200 group
                          ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}
                          ${active
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
            >
              <span className={`shrink-0 transition-transform ${active ? "scale-110" : "group-hover:scale-105"}`}>
                <NavIcon k={it.key} size={18} />
              </span>
              {!collapsed && <span className="truncate">{it.label}</span>}
              {!collapsed && active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-pink-500 shadow-sm shadow-pink-500/50" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-white/10 shrink-0">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-white hover:bg-white/5 transition-all"
        >
          <svg className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span>Thu gọn</span>}
        </button>
      </div>
    </aside>
  );
}

function MobileDrawer({ navs, tab, setTab, open, onClose }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 flex flex-col
                         bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950
                         text-white shadow-2xl transition-transform duration-300
                         ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 h-16 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-lg font-bold">H</div>
            <div>
              <div className="text-sm font-bold tracking-wide">HALLEY</div>
              <div className="text-[10px] text-gray-400">Admin Panel</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navs.map((it) => {
            const active = tab === it.key;
            return (
              <button key={it.key} onClick={() => { setTab(it.key); onClose(); }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all
                            ${active ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
                <NavIcon k={it.key} size={18} />
                <span>{it.label}</span>
                {active && <span className="ml-auto w-2 h-2 rounded-full bg-pink-500" />}
              </button>
            );
          })}
        </nav>
        {(() => {
          const u = readLS(LS.AUTH, null);
          if (!u) return null;
          return (
            <div className="px-4 py-3 border-t border-white/10 shrink-0">
              <div className="text-xs text-gray-400 mb-2">{u.name || u.username}{u.isSuper ? " 👑" : ""}</div>
              <button onClick={() => { audit("user.logout", { username: u.username }); removeLS(LS.AUTH); window.location.reload(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:text-white hover:bg-red-500/20 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Đăng xuất
              </button>
            </div>
          );
        })()}
      </aside>
    </>
  );
}

function BottomNav({ navs, tab, setTab }) {
  const primary = navs.slice(0, 5);
  if (!primary.length) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100 shadow-lg">
      <div className="flex items-stretch">
        {primary.map((it) => {
          const active = tab === it.key;
          return (
            <button key={it.key} onClick={() => setTab(it.key)}
              className={`flex-1 relative flex flex-col items-center justify-center gap-1 py-2 px-1 min-h-[52px] transition-all
                          ${active ? "text-pink-600" : "text-gray-400"}`}>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-pink-500" />}
              <span className={`transition-transform duration-200 ${active ? "scale-110" : ""}`}>
                <NavIcon k={it.key} size={22} active={active} />
              </span>
              <span className={`text-[9px] font-semibold tracking-tight ${active ? "text-pink-600" : "text-gray-400"}`}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TopBar({ navs, tab, onMenuClick }) {
  const current = navs.find((n) => n.key === tab);
  return (
    <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 sm:px-5
                       bg-white/90 backdrop-blur-xl border-b border-gray-100 shadow-sm">
      <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition" aria-label="Menu">
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex items-center gap-2">
        <span className="text-gray-500"><NavIcon k={current?.key} size={18} /></span>
        <h1 className="text-base font-semibold text-gray-800">{current?.label || "Admin"}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <a href="/" className="hidden sm:flex text-xs text-gray-400 hover:text-gray-700 transition items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          Xem trang
        </a>
        {(() => {
          const u = readLS(LS.AUTH, null);
          if (!u) return null;
          return (
            <>
              <span className="hidden sm:block text-xs text-gray-400">{u.name || u.username}{u.isSuper ? " 👑" : ""}</span>
              <button
                onClick={() => { audit("user.logout", { username: u.username }); removeLS(LS.AUTH); window.location.reload(); }}
                className="text-xs text-red-400 hover:text-red-600 transition flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </>
          );
        })()}
      </div>
    </header>
  );
}

function Stub({ title, icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <span className="text-5xl mb-4 opacity-30">{icon || "🚧"}</span>
      <p className="text-lg font-medium text-gray-500">Panel "{title}"</p>
      <p className="text-sm mt-1">Sẽ được hoàn thiện trong phiên bản sau</p>
    </div>
  );
}

function PermissionStub({ title = "Không đủ quyền", description = "Tài khoản này chưa được cấp quyền cho khu vực này." }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <span className="text-5xl mb-4 opacity-30">🔒</span>
      <p className="text-lg font-medium text-gray-500">{title}</p>
      <p className="text-sm mt-1">{description}</p>
    </div>
  );
}

export default function AdminIndex() {
  const user = useMemo(() => getAuthUser(), []);
  const availableNavs = useMemo(() => NAVS.filter((nav) => canAccessAdminTab(user, nav.key)), [user]);
  const defaultTab = availableNavs[0]?.key || "";

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("admin.collapsed") === "1"; } catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem("admin.tab");
      if (availableNavs.some((nav) => nav.key === saved)) return saved;
    } catch {}
    return defaultTab;
  });

  useEffect(() => {
    if (!availableNavs.length) return;
    if (!availableNavs.some((nav) => nav.key === tab)) {
      setTab(defaultTab);
    }
  }, [availableNavs, defaultTab, tab]);

  useEffect(() => {
    if (!tab) return;
    try { localStorage.setItem("admin.tab", tab); } catch {}
  }, [tab]);

  const toggleCollapse = () => {
    setCollapsed((p) => {
      try { localStorage.setItem("admin.collapsed", p ? "0" : "1"); } catch {}
      return !p;
    });
  };

  const render = () => {
    if (!availableNavs.length) {
      return <PermissionStub title="Chưa có tab admin khả dụng" description="Hãy cấp ít nhất một quyền .view hoặc .edit cho tài khoản này." />;
    }
    switch (tab) {
      case "products":
        return (
          <ProductsPanel
            canEdit={hasPermission(user, "products.edit")}
            canDelete={hasPermission(user, "products.delete")}
          />
        );
      case "upload":
        return <UploadPanel canEdit={hasPermission(user, "upload.edit")} />;
      case "typesize":
        return <TypeSizePanel />;
      case "categories":
        return <Stub title="Danh mục" icon="🏷️" />;
      case "tags":
        return <Stub title="Tag" icon="🔖" />;
      case "pages":
        return <Stub title="Trang" icon="📄" />;
      case "users":
        return <UsersPanel />;
      case "aitags":
        return <AITagsPanel canEdit={hasPermission(user, "aitags.edit")} />;
      case "audit":
        return <AuditPanel />;
      case "settings":
        return <SettingsPanel canEdit={hasPermission(user, "settings.edit")} />;
      default:
        return <ProductsPanel canEdit={hasPermission(user, "products.edit")} canDelete={hasPermission(user, "products.delete")} />;
    }
  };

  return (
    <AuthGuard minRole="staff">
      <div className="hidden lg:block">
        <Sidebar navs={availableNavs} tab={tab} setTab={setTab} collapsed={collapsed} toggle={toggleCollapse} />
      </div>

      <MobileDrawer navs={availableNavs} tab={tab} setTab={setTab} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className={`min-h-screen bg-gray-50/80 transition-all duration-300
                       ${collapsed ? "lg:ml-[68px]" : "lg:ml-56"}
                       pb-16 lg:pb-0`}>
        <TopBar navs={availableNavs} tab={tab} onMenuClick={() => setDrawerOpen(true)} />
        <main className="p-3 sm:p-4 lg:p-6">{render()}</main>
      </div>

      <BottomNav navs={availableNavs} tab={tab} setTab={setTab} />
    </AuthGuard>
  );
}
