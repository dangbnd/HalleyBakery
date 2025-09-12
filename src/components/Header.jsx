// src/components/Header.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function Header({
  currentKey = "home",
  navItems = [],
  onNavigate,
  logoText = "HALLEY BAKERY",
  logoSrc,
  hotline,
  searchQuery = "",
  onSearchChange,
  onSearchSubmit,
  suggestions = [],
  onSuggestionSelect,
}) {
  const [open, setOpen] = useState(false);
  const [showSug, setShowSug] = useState(false);
  const sugRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    onSearchSubmit?.(searchQuery);
    setShowSug(false);
  };

  // close suggestions when clicking outside
  useEffect(() => {
    const onDoc = (e) => {
      if (!sugRef.current) return;
      if (!sugRef.current.contains(e.target)) setShowSug(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // lock scroll when menu open
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
                <button className={base} type="button">{getTitle(it)}</button>
                <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-50">
                  <div className="min-w-[240px] bg-white border rounded-lg shadow p-2">
                    {it.children.map((ch) => (
                      <DesktopMenuItem key={ch.key} item={ch} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <button
                key={it.key}
                className={base}
                onClick={() => onNavigate?.(it.key)}
              >
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
          <MobileNode key={it.key} item={it} close={close} />
        ))}
      </nav>
    );
  }
  function MobileNode({ item, close }) {
    const [opened, setOpened] = useState(false);
    const has = item.children?.length > 0;
    const active = currentKey === item.key;
    const btn =
      "flex-1 text-left px-3 py-2 rounded-lg " +
      (active ? "bg-rose-100 text-rose-700" : "hover:bg-gray-100");

    return (
      <div>
        <div className="flex items-center">
          <button
            className={btn}
            onClick={() => {
              if (has) setOpened((v) => !v);
              else {
                onNavigate?.(item.key);
                close?.();
              }
            }}
          >
            {getTitle(item)}
          </button>
          {has && (
            <button
              className="px-2 text-gray-600"
              aria-label="Toggle children"
              onClick={() => setOpened((v) => !v)}
            >
              {opened ? "▾" : "▸"}
            </button>
          )}
        </div>
        {has && opened && (
          <div className="pl-3 ml-3 border-l">
            {item.children.map((ch) => (
              <MobileNode key={ch.key} item={ch} close={close} />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* -------------------- Logo & Search -------------------- */
  const Logo = (
    <button
      className="flex items-center gap-2"
      onClick={() => onNavigate?.("home")}
      aria-label="Trang chủ"
    >
      {logoSrc ? (
        <img src={logoSrc} alt={logoText} className="h-8 w-auto" />
      ) : (
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-widest">HALLEY</div>
          <div className="text-sm font-semibold tracking-widest">BAKERY</div>
        </div>
      )}
    </button>
  );

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
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-lg border bg-white shadow">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSuggestionSelect?.(s);
                setShowSug(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span className="text-gray-500 mr-2">{s.type}</span>
              <span>{s.label}</span>
            </button>
          ))}
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
          <DesktopMenu items={navItems} />
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
              className="absolute inset-y-0 left-0 w-[88%] max-w-xs bg-white shadow-xl rounded-r-2xl p-3
                         translate-x-0 animate-[slideIn_.18s_ease-out]"
            >
              <style>{`@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Menu</div>
                <button
                  aria-label="Đóng"
                  className="h-8 w-8 grid place-items-center rounded-full hover:bg-gray-100"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>
              <MobileTree items={navItems} close={() => setOpen(false)} />
            </aside>
          </div>,
          document.body
        )}
    </header>
  );
}
