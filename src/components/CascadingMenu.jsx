import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * CascadingMenu
 * - Menu N cấp (desktop: hover/click; mobile: modal).
 * Props:
 *  - data: Node[]  { key, label/title/name/text, href?, children? }
 *  - triggerLabel?: string
 *  - mode?: 'hover' | 'click'
 *  - onPick?: (node) => void
 *  - activeKey?: string  // để tô “đường đi”
 */

function labelOf(n) {
  return n?.title ?? n?.label ?? n?.name ?? n?.text ?? n?.key ?? "";
}

export default function CascadingMenu({
  data = [],
  triggerLabel = "Sản phẩm",
  mode = "hover",
  onPick,
  activeKey,
}) {
  const isPointerFine = useMediaQuery("(pointer: fine)");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const rootRef = useRef(null);

  // chống rơi menu khi rê giữa nút và panel
  const closeTimer = useRef(null);
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setPath([]);
    }, 200);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const [open, setOpen] = useState(false);
  const [path, setPath] = useState([]); // indexes theo cấp

  const panels = useMemo(() => buildPanels(data, path), [data, path]);

  // đường đi đang active
  const activePath = useMemo(() => findPathByKey(data, activeKey) || [], [data, activeKey]);
  const activeSet = useMemo(() => new Set(activePath.map((n) => n.key)), [activePath]);
  const activeInside = activePath.length > 0;

  // căn cạnh submenu sát mục cha
  const panelRefs = useRef([]);
  const [offsets, setOffsets] = useState({});
  const setAnchorForNext = (lvl, itemEl) => {
    const parent = panelRefs.current[lvl];
    if (!parent || !itemEl) return;
    const top = itemEl.offsetTop - parent.scrollTop;
    setOffsets((o) => {
      const next = { ...o, [lvl + 1]: Math.max(0, top) };
      Object.keys(next).forEach((k) => { if (+k > lvl + 1) delete next[k]; });
      return next;
    });
  };

  // close on outside
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) {
        setOpen(false);
        setPath([]);
      }
    };
    const onEsc = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPath([]);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // khóa nền khi mở modal
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // cho phép cuộn bên trong modal trên mobile (ngăn nền chặn touchmove)
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    const handler = (e) => {
      if (el && el.contains(e.target)) return; // cho cuộn trong body modal
      e.preventDefault(); // chặn cuộn nền
    };
    document.addEventListener("touchmove", handler, { passive: false });
    return () => document.removeEventListener("touchmove", handler);
  }, [open]);

  const allowHover = isPointerFine && (mode === "hover" || mode === "both");
  const triggerHandlers = allowHover
    ? { onMouseEnter: () => setOpen(true), onClick: () => setOpen(v => !v) }
    : { onClick: () => setOpen(v => !v) };

  /* ---------------- Desktop ---------------- */
  function renderDesktop() {
    return (
      <div
        className="relative"
        ref={rootRef}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <button
          className={`px-4 py-2 rounded-md ${
            open ? "bg-gray-100"
              : activeInside ? "bg-rose-50 text-rose-700"
              : "hover:bg-gray-50"
          }`}
          {...triggerHandlers}
        >
          {triggerLabel}
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
            <div className="pt-2">
              <div className="p-1">
                <div className="relative flex items-start gap-2">
                  {panels.map((items, lvl) => (
                    <div key={lvl} className="relative" style={{ marginTop: lvl > 0 ? (offsets[lvl] || 0) : 0 }}>
                      <div
                        ref={(el) => (panelRefs.current[lvl] = el)}
                        className="w-56 max-h-[70vh] overflow-y-auto bg-white border rounded-xl shadow-md"
                      >
                        {items.map((node, idx) => {
                          const hasChild = Array.isArray(node.children) && node.children.length > 0;
                          const onPath = activeSet.has(node.key);
                          const isLeafActive = activeKey === node.key;
                          const itemClass = isLeafActive
                            ? "bg-rose-100 text-rose-700 font-medium"
                            : onPath
                            ? "bg-rose-50 text-rose-700"
                            : "text-gray-800 hover:bg-gray-50";
                          return (
                            <div
                              key={node.key || labelOf(node)}
                              onMouseEnter={(e) => {
                                if (allowHover) {
                                  setPath((p) => setIndexAtLevel(p, lvl, idx));
                                  setAnchorForNext(lvl, e.currentTarget);
                                }
                              }}
                              onClick={(e) => {
                                if (hasChild) {
                                  setPath((p) => setIndexAtLevel(p, lvl, idx));
                                  setAnchorForNext(lvl, e.currentTarget);
                                } else {
                                  setOpen(false);
                                  setPath([]);
                                  if (node.href) window.location.href = node.href;
                                  onPick && onPick(node);
                                }
                              }}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm ${itemClass}`}
                            >
                              <span className="truncate">{labelOf(node)}</span>
                              {hasChild && (
                                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M7 5l5 5-5 5" />
                                </svg>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Mobile ---------------- */
  function renderMobile() {
    return (
      <div className="relative" ref={rootRef}>
        <button
          className={`px-4 py-2 rounded-md ${
            open ? "bg-gray-100"
              : activeInside ? "bg-rose-50 text-rose-700"
              : "hover:bg-gray-50"
          }`}
          onClick={() => setOpen(true)}
        >
          {triggerLabel}
        </button>

        {open &&
          createPortal(
            (
              <div className="fixed inset-0 z-[100] bg-black/25 pointer-events-auto" onClick={() => setOpen(false)}>
                <div className="absolute inset-0 flex justify-center" onClick={(e) => e.stopPropagation()}>
                  <div className="w-full max-w-[640px] h-[100dvh]">
                    <div className="bg-white rounded-t-2xl shadow-xl h-full flex flex-col">
                      {/* header */}
                      <div className="shrink-0 p-3 border-b">
                        <button
                          onClick={() =>
                            setPath((prev) => (prev.length ? prev.slice(0, -1) : (setOpen(false), [])))
                          }
                          className="px-2 py-1 rounded hover:bg-gray-50"
                        >
                          {path.length ? "Quay lại" : "Đóng"}
                        </button>
                        <span className="ml-2 font-medium">{triggerLabel}</span>
                      </div>

                      {/* body scroller */}
                      <div
                        ref={scrollRef}
                        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2"
                        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                      >
                        {(() => {
                          const lvl = path.length;
                          const items = panels[lvl] || [];
                          return (
                            <div className="divide-y">
                              {items.map((node, idx) => {
                                const hasChild = Array.isArray(node.children) && node.children.length;
                                const onPath = activeSet.has(node.key);
                                const isLeafActive = activeKey === node.key;
                                const itemClass = isLeafActive
                                  ? "bg-rose-100 text-rose-700 font-medium"
                                  : onPath
                                  ? "bg-rose-50 text-rose-700"
                                  : "text-gray-800";
                                return (
                                  <div
                                    key={node.key || labelOf(node)}
                                    className={`flex items-center justify-between py-3 ${itemClass}`}
                                    onClick={() => {
                                      if (hasChild) setPath((p) => setIndexAtLevel(p, lvl, idx));
                                      else {
                                        setOpen(false);
                                        setPath([]);
                                        if (node.href) window.location.href = node.href;
                                        onPick && onPick(node);
                                      }
                                    }}
                                  >
                                    <span className="truncate">{labelOf(node)}</span>
                                    {hasChild && (
                                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M7 5l5 5-5 5" />
                                      </svg>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ),
            document.body
          )}
      </div>
    );
  }

  return isMobile ? renderMobile() : renderDesktop();
}

/* ---------------- helpers ---------------- */

function buildPanels(root = [], path = []) {
  const list = [];
  let cur = root;
  let lvl = 0;
  while (Array.isArray(cur) && cur.length) {
    list.push(cur);
    const idx = path[lvl];
    const node = Number.isInteger(idx) ? cur[idx] : null;
    cur = node && node.children ? node.children : null;
    lvl++;
  }
  return list;
}

function setIndexAtLevel(prev, lvl, idx) {
  const next = prev.slice(0, lvl);
  next[lvl] = idx;
  return next;
}

function useMediaQuery(q) {
  const [match, setMatch] = useState(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return false;
    return window.matchMedia(q).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const m = window.matchMedia(q);
    const fn = () => setMatch(m.matches);
    try { m.addEventListener("change", fn); } catch { m.addListener(fn); }
    return () => { try { m.removeEventListener("change", fn); } catch { m.removeListener(fn); } };
  }, [q]);
  return match;
}

function findPathByKey(nodes = [], target) {
  if (!target) return [];
  const path = [];
  const dfs = (list) => {
    if (!Array.isArray(list)) return false;
    for (const n of list) {
      path.push(n);
      if (n.key === target) return true;
      if (dfs(n.children)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(nodes) ? path.slice() : [];
}

/* ---------------- demo data ---------------- */
export const demoMenu = [
  {
    key: "kids",
    label: "Bánh trẻ em",
    children: [
      { key: "boy", label: "Bánh bé trai", children: [
        { key: "spider", label: "Người nhện" },
        { key: "police", label: "Cảnh sát" },
      ]},
      { key: "girl", label: "Bánh bé gái", children: [
        { key: "kitty", label: "Hello Kitty" },
        { key: "barbie", label: "Barbie" },
      ]},
    ],
  },
  { key: "basic", label: "Bánh Basic" },
  { key: "redvelvet", label: "Red Velvet" },
  { key: "mousse", label: "Mousse hoa quả", children: [
    { key: "mix", label: "Mix vị", children: [
      { key: "mix-6", label: "6 vị" },
      { key: "mix-9", label: "9 vị" },
    ]},
  ]},
];

/* Dùng:
<CascadingMenu
  data={demoMenu}
  triggerLabel="Sản phẩm"
  mode="hover"
  activeKey={currentKey}
  onPick={(n) => {}}
/>
*/
