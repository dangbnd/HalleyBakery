import React, { useMemo, useState, useEffect } from "react";
import AuthGuard from "./core/AuthGuard.jsx";

import ProductsPanel from "./panels/ProductsPanel.jsx";
import TypeSizePanel from "./panels/TypeSizePanel.jsx";
import SettingsPanel from "./panels/SettingsPanel.jsx";
import AuditPanel from "./panels/AuditPanel.jsx";
import UsersPanel from "./panels/UsersPanel.jsx";
import AITagsPanel from "./panels/AITagsPanel.jsx";
import { LS, readLS, removeLS, audit } from "../../utils.js";

const NAVS = [
  { key: "products", label: "Sản phẩm", icon: "🛍️" },
  { key: "typesize", label: "Loại & Size", icon: "📐" },
  { key: "categories", label: "Danh mục", icon: "🏷️" },
  { key: "tags", label: "Tag", icon: "🔖" },
  { key: "pages", label: "Trang", icon: "📄" },
  { key: "users", label: "Người dùng", icon: "👥" },
  { key: "aitags", label: "AI Tags", icon: "✨" },
  { key: "audit", label: "Nhật ký", icon: "📋" },
  { key: "settings", label: "Cấu hình", icon: "⚙️" },
];

/* ===== Sidebar ===== */
function Sidebar({ tab, setTab, collapsed, toggle }) {
  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-full flex flex-col
                  bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950
                  text-white transition-all duration-300 ease-in-out
                  ${collapsed ? "w-[68px]" : "w-56"}
                  shadow-2xl border-r border-white/5`}
    >
      {/* Logo */}
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

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAVS.map(it => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setTab(it.key)}
              title={collapsed ? it.label : undefined}
              className={`w-full flex items-center gap-3 rounded-xl text-sm transition-all duration-200 group
                          ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}
                          ${active
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
            >
              <span className={`text-base shrink-0 ${active ? "scale-110" : "group-hover:scale-105"} transition-transform`}>
                {it.icon}
              </span>
              {!collapsed && <span className="truncate">{it.label}</span>}
              {!collapsed && active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-pink-500 shadow-sm shadow-pink-500/50" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / Collapse toggle */}
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

/* ===== Top bar (for mobile + breadcrumb) ===== */
function TopBar({ tab, toggleSidebar }) {
  const current = NAVS.find(n => n.key === tab);
  return (
    <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-5
                       bg-white/80 backdrop-blur-xl border-b border-gray-100">
      <button onClick={toggleSidebar} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition">
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex items-center gap-2">
        <span className="text-lg">{current?.icon}</span>
        <h1 className="text-base font-semibold text-gray-800">{current?.label || "Admin"}</h1>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <a href="/" className="text-xs text-gray-400 hover:text-gray-700 transition flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          Xem trang
        </a>
        {(() => {
          const u = readLS(LS.AUTH, null);
          if (!u) return null;
          return (
            <>
              <span className="text-xs text-gray-400">{u.name || u.username}{u.isSuper ? " 👑" : ""}</span>
              <button onClick={() => { audit("user.logout", { username: u.username }); removeLS(LS.AUTH); window.location.reload(); }}
                className="text-xs text-red-400 hover:text-red-600 transition flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Đăng xuất
              </button>
            </>
          );
        })()}
      </div>
    </header>
  );
}

/* ===== Stub for unfinished panels ===== */
function Stub({ title, icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <span className="text-5xl mb-4 opacity-30">{icon || "🚧"}</span>
      <p className="text-lg font-medium text-gray-500">Panel "{title}"</p>
      <p className="text-sm mt-1">Sẽ được hoàn thiện trong phiên bản sau</p>
    </div>
  );
}

/* ===== Main ===== */
export default function AdminIndex() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("admin.collapsed") === "1"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const initialTab = useMemo(() => {
    try { return localStorage.getItem("admin.tab"); } catch { return null; }
  }, []);

  const [tab, setTab] = useState(initialTab || "products");

  useEffect(() => {
    try { localStorage.setItem("admin.tab", tab); } catch { }
  }, [tab]);

  const toggleCollapse = () => {
    setCollapsed(p => {
      try { localStorage.setItem("admin.collapsed", p ? "0" : "1"); } catch { }
      return !p;
    });
  };

  const render = () => {
    switch (tab) {
      case "products": return <ProductsPanel />;
      case "typesize": return <TypeSizePanel />;
      case "categories": return <Stub title="Danh mục" icon="🏷️" />;
      case "tags": return <Stub title="Tag" icon="🔖" />;
      case "pages": return <Stub title="Trang" icon="📄" />;
      case "users": return <UsersPanel />;
      case "aitags": return <AITagsPanel />;
      case "audit": return <AuditPanel />;
      case "settings": return <SettingsPanel />;
      default: return <ProductsPanel />;
    }
  };

  return (
    <AuthGuard minRole="editor">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — desktop always, mobile toggle */}
      <div className={`hidden lg:block`}>
        <Sidebar tab={tab} setTab={setTab} collapsed={collapsed} toggle={toggleCollapse} />
      </div>
      <div className={`lg:hidden ${mobileOpen ? "block" : "hidden"}`}>
        <Sidebar tab={tab} setTab={(k) => { setTab(k); setMobileOpen(false); }} collapsed={false} toggle={() => setMobileOpen(false)} />
      </div>

      {/* Main area */}
      <div className={`min-h-screen bg-gray-50/80 transition-all duration-300 ${collapsed ? "lg:ml-[68px]" : "lg:ml-56"}`}>
        <TopBar tab={tab} toggleSidebar={() => setMobileOpen(p => !p)} />
        <main className="p-4 sm:p-6">
          {render()}
        </main>
      </div>
    </AuthGuard>
  );
}
