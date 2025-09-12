import React, { useMemo, useState, useEffect } from "react";
import AuthGuard from "./core/AuthGuard.jsx";
import { Card } from "./ui/primitives.jsx";

import ProductsPanel from "./panels/ProductsPanel.jsx";
import TypeSizePanel from "./panels/TypeSizePanel.jsx";

const NAVS = [
  { key: "products", label: "Sản phẩm" },
  { key: "typesize", label: "Loại & Size" },
  { key: "categories", label: "Danh mục" },
  { key: "tags", label: "Tag" },
  { key: "pages", label: "Trang" },
  { key: "users", label: "Người dùng" },
  { key: "audit", label: "Nhật ký" },
];

function TopNav({ tab, setTab }) {
  return (
    <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b">
      <div className="w-full px-4">
        <ul className="flex gap-2 overflow-x-auto py-2">
          {NAVS.map((it) => {
            const active = tab === it.key;
            return (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => setTab(it.key)}
                  className={[
                    "inline-block rounded-full px-3 py-1 text-sm whitespace-nowrap",
                    active ? "bg-black text-white" : "border hover:bg-gray-50",
                  ].join(" ")}
                >
                  {it.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function Stub({ title }) {
  return (
    <Card className="p-6">
      <div className="text-gray-500">Panel “{title}” sẽ được hoàn thiện sau.</div>
    </Card>
  );
}

export default function AdminIndex() {
  const initialTab = useMemo(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem("admin.tab");
    }
    return null;
  }, []);

  const [tab, setTab] = useState(initialTab || "products");

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("admin.tab", tab);
    }
  }, [tab]);

  const render = () => {
    switch (tab) {
      case "products": return <ProductsPanel />;
      case "typesize": return <TypeSizePanel />;
      case "categories": return <Stub title="Danh mục" />;
      case "tags": return <Stub title="Tag" />;
      case "pages": return <Stub title="Trang" />;
      case "users": return <Stub title="Người dùng" />;
      case "audit": return <Stub title="Nhật ký" />;
      default: return <ProductsPanel />;
    }
  };

  return (
    <AuthGuard minRole="editor">
      <TopNav tab={tab} setTab={setTab} />
      <main className="min-h-[calc(100vh-56px)] bg-gray-100 px-4 py-4">
        <div className="w-full">{render()}</div>
      </main>
    </AuthGuard>
  );
}
