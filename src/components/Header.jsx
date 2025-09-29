// src/components/Header.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CascadingMenu from "./CascadingMenu.jsx";
import { cdn } from "../utils/img.js";
import { prefetchImage } from "../utils/img.js";

export default function Header({
  currentKey = "home",
  navItems = [],
  onNavigate,
  logoText = "HALLEY BAKERY",
  logoSrc,
  logoSrcDesktop,
  logoSrcMobile,
  hotline,
  searchQuery = "",
  onSearchChange,
  onSearchSubmit,
  suggestions = [],
  onSuggestionSelect,
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(5);
  const [showSug, setShowSug] = useState(false);
  const sugRef = useRef(null);
  const desk = logoSrcDesktop || logoSrc;
  const mob = logoSrcMobile || logoSrc;

  const submit = (e) => {
    e.preventDefault();
    onSearchSubmit?.(searchQuery);
    setShowSug(false);
  };

  const isProducts = (it) => {
    const t = String(getTitle(it) || "").toLowerCase();
    return it.key === "products" || it.key === "product" || t.includes("sản phẩm");
  };

  // reset số lượng hiển thị khi danh sách gợi ý đổi
  useEffect(() => {
    setLimit(5);
  }, [suggestions]);

  // đóng dropdown khi click ra ngoài
  useEffect(() => {
    const onDoc = (e) => {
      if (!sugRef.current) return;
      if (!sugRef.current.contains(e.target)) setShowSug(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // khóa scroll khi mở mobile menu
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev || "";
    return () => (document.body.style.overflow = prev || "");
  }, [open]);

  const getTitle = (it) => it.title ?? it.label ?? it.key;

  /* -------------------- Desktop menu (dropdown, recursive) -------------------- */
  function DesktopMenu({ items = [] }) {
    return (
      <nav className="hidden md:flex items-center gap-2">
        {items.map((it) => {
          const active = currentKey === it.key;
          const hasChildren = Array.isArray(it.children) && it.children.length > 0;
          const base =
            "px-3 py-2 rounded-lg " +
            (active ? "bg-rose-100 text-rose-700" : "hover:bg-gray-100");

          return hasChildren ? (
            <div key={it.key} className="relative group">
              <button className={base} type="button">
                {getTitle(it)}
              </button>
              <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-50">
                <div className="min-w-[240px] bg-white border rounded-lg shadow p-2">
                  {it.children.map((ch) => (
                    <DesktopMenuItem key={ch.key} item={ch} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button key={it.key} className={base} onClick={() => onNavigate?.(it.key)}>
              {getTitle(it)}
            </button>
          );
        })}
      </nav>
    );
  }

  function DesktopMenuItem({ item }) {
    const has = item.children?.length > 0;
    const active = currentKey === item.key;
    const cls =
      "block w-full text-left px-3 py-2 rounded " +
      (active ? "bg-rose-50 text-rose-700" : "hover:bg-gray-50");

    return (
      <div className="relative">
        <button
          type="button"
          className={cls}
          onClick={() => {
            if (!has) onNavigate?.(item.key);
          }}
        >
          {getTitle(item)}
        </button>
        {has && (
          <div className="pl-2 ml-2 border-l">
            {item.children.map((ch) => (
              <DesktopMenuItem key={ch.key} item={ch} />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* -------------------- Mobile menu (accordion tree) -------------------- */
  function MobileTree({ items = [], close }) {
    return (
      <nav className="flex flex-col gap-1">
        {items.map((it) => (
        <MobileNode key={it.key} item={it} close={close} depth={0} />
        ))}
      </nav>
    );
  }
  function MobileNode({ item, close, depth = 0 }) {
    const has = item.children?.length > 0;
    const defaultOpen = has && depth === 0 && isProducts(item); // auto mở cấp 1 của “Sản phẩm”
    const [opened, setOpened] = useState(defaultOpen);
    const active = currentKey === item.key;
    const btn =
      "flex-1 text-left px-3 py-2 rounded-lg " +
      (active ? "bg-rose-100 text-rose-700" : "hover:bg-gray-100");

    const toggle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpened((v) => !v);
    };

    const go = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onNavigate?.(item.key);
      close?.();
    };

    return (
      <div>
        <div className="flex items-center">
          <button
            type="button"
            className={btn}
            onClick={has ? toggle : go}
            aria-expanded={has ? opened : undefined}
          >
            {getTitle(item)}
          </button>

          {has && (
            <button
              type="button"
              className="px-2 text-gray-600"
              aria-label="Toggle children"
              onClick={toggle}
            >
              {opened ? "▾" : "▸"}
            </button>
          )}
        </div>

        {has && opened && (
          <div className="pl-3 ml-3 border-l">
            {item.children.map((ch) => (
            <MobileNode key={ch.key} item={ch} close={close} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* -------------------- Logo & Search -------------------- */
  const Logo = (
    <button className="flex items-center gap-2" onClick={() => onNavigate?.("home")} aria-label="Trang chủ">
      {desk || mob ? (
        <picture>
          <source media="(min-width:768px)" srcSet={desk || mob} />
          <img src={mob || desk} alt={logoText} className="h-8 md:h-9 w-auto" />
        </picture>
      ) : (
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-widest">HALLEY</div>
          <div className="text-sm font-semibold tracking-widest">BAKERY</div>
        </div>
      )}
    </button>
  );

  // ảnh nhỏ ưu tiên cho product suggestions
  const thumbOf = (s) => s.thumb || s.image || s.img || "";

  const Search = (
    <form onSubmit={submit} className="relative w-full" ref={sugRef} autoComplete="off">
      <input
        value={searchQuery}
        onChange={(e) => {
          onSearchChange?.(e.target.value);
          setShowSug(true);
        }}
        onFocus={() => setShowSug(true)}
        placeholder="Tìm sản phẩm…"
        className="w-full h-9 rounded-full border px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-rose-200"
      />
      <button
        type="submit"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-3 rounded-full bg-rose-500 text-white text-sm"
      >
        Tìm
      </button>

      {showSug && suggestions?.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto rounded-lg border bg-white shadow">
          <ul className="divide-y">
            {suggestions.slice(0, limit).map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseEnter={() => { if (s.type==="product" && s.thumb) prefetchImage(cdn(s.thumb,{w:480,h:480})); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSuggestionSelect?.(s);
                    setShowSug(false);
                  }}
                >
                  {/* avatar nhỏ */}
                  {s.type === "product" && thumbOf(s) ? (
                    <img
                      src={cdn(s.thumb || "", { w: 64, h: 64, q: 65 })}
                      width="32" height="32"
                      className="h-8 w-8 rounded object-cover flex-none"
                      loading="lazy" decoding="async"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-gray-100 grid place-items-center text-xs text-gray-500 flex-none">
                      {s.type === "category" ? "DM" : "SP"}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="text-sm truncate">{s.label}</div>
                    <div className="text-[11px] text-gray-500">
                      {s.type === "category" ? "danh mục" : "sản phẩm"}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* nút hiển thị thêm */}
          {suggestions.length - limit > 0 && (
            <button
              type="button"
              className="w-full px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 border-t"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setLimit((n) => Math.min(n + 10, suggestions.length))}
            >
              Hiển thị thêm {suggestions.length - limit}…
            </button>
          )}
        </div>
      )}
    </form>
  );

  /* -------------------- Render -------------------- */
  return (
    <header className="sticky top-0 z-40 bg-white/90 supports-[backdrop-filter]:bg-white/60 backdrop-blur border-b">
      {/* Mobile */}
      <div className="md:hidden max-w-6xl mx-auto px-3 py-2">
        <div className="flex items-center gap-2">
          {Logo}
          <button
            type="button"
            aria-label="Mở menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="shrink-0 grid place-items-center h-9 w-9 rounded-full border hover:bg-gray-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <div className="flex-1">{Search}</div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          {Logo}
          <div className="flex items-center gap-2">
            {navItems.map((it) => {
              const active = currentKey === it.key;
              const base =
                "px-3 py-2 rounded-lg " +
                (active ? "bg-rose-100 text-rose-700" : "hover:bg-gray-100");

              if (it.children?.length) {
                return (
                  <CascadingMenu
                    key={it.key}
                    data={it.children}
                    triggerLabel={it.title ?? it.label ?? it.key}
                    mode="both"
                    activeKey={currentKey}
                    onPick={(node) => onNavigate?.(node.key)}
                  />
                );
              }
              return (
                <button key={it.key} className={base} onClick={() => onNavigate?.(it.key)}>
                  {it.title ?? it.label ?? it.key}
                </button>
              );
            })}
          </div>
          <div className="flex-1 max-w-md ml-auto">{Search}</div>
          {/* {hotline ? (
            <a href={`tel:${hotline}`} className="hidden lg:inline text-sm text-gray-600">
              {hotline}
            </a>
          ) : null} */}
        </div>
      </div>

      {/* Mobile menu (portal) */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[1000]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside
              className="absolute inset-y-0 left-0 w-[88%] max-w-xs bg-white shadow-xl rounded-r-2xl
                        translate-x-0 animate-[slideIn_.18s_ease-out] h-[100dvh] flex flex-col"
            >
              <style>{`@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>

              {/* header */}
              <div className="shrink-0 px-3 py-2 flex items-center justify-between border-b">
                <div className="font-medium">Menu</div>
                <button
                  type="button"
                  aria-label="Đóng"
                  className="h-8 w-8 grid place-items-center rounded-full hover:bg-gray-100"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>

              {/* body scrollable */}
              <div
                className="flex-1 min-h-0 overflow-y-auto p-3"
                style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
              >
                <MobileTree items={navItems} close={() => setOpen(false)} />
              </div>
            </aside>
          </div>,
          document.body
        )}
    </header>
  );
}
