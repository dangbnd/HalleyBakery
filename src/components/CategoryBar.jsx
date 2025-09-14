// src/components/CategoryBar.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function Chip({ active, children, onClick, dataKey }) {
  return (
    <button
      data-key={dataKey}
      onClick={onClick}
      className={
        "px-2 py-1 rounded-full border text-xm md:text-[14px] whitespace-nowrap transition " +
        (active
          ? "bg-rose-500 text-white border-rose-500 ring-1 ring-rose-100 shadow-md scale-100"
          : "text-black-500 hover:bg-gray-50")
      }
      role="tab"
      aria-selected={active}
    >
      {children}
    </button>
  );
}

export default function CategoryBar({
  categories = [],
  currentKey = "all",
  onPick,
  sticky = false,
  showFilterButton = false,
  onOpenFilters,
}) {
  const wrapRef = useRef(null);
  const railRef = useRef(null);
  const moreBtnRef = useRef(null);
  const popRef = useRef(null);

  const [hasLeft, setHasLeft] = useState(false);
  const [hasRight, setHasRight] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [q, setQ] = useState("");
  const [popPos, setPopPos] = useState({ top: 0, left: 0, width: 320 });

  // auto scroll to active pill
  useEffect(() => {
    const sel = String(currentKey).replace(/"/g, '\\"');
    const el = wrapRef.current?.querySelector(`[data-key="${sel}"]`);
    el?.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentKey, categories.length]);

  // arrows state
  const update = () => {
    const el = railRef.current;
    if (!el) return;
    setHasLeft(el.scrollLeft > 2);
    setHasRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    update();
    const el = railRef.current;
    if (!el) return;
    const onScroll = () => update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, []);

  // compute popover position in viewport (fixed)
  const placePopover = () => {
    const btn = moreBtnRef.current;
    if (!btn) return;
    const b = btn.getBoundingClientRect();
    const margin = 8;
    const maxW = Math.min(window.innerWidth - margin * 2, 448); // 28rem
    // căn phải theo nút, nhưng kẹp trong màn hình
    let left = Math.min(Math.max(b.right - maxW, margin), window.innerWidth - maxW - margin);
    const top = Math.min(b.bottom + 8, window.innerHeight - 200); // tránh đụng mép dưới
    setPopPos({ top, left, width: maxW });
  };

  useEffect(() => {
    if (!allOpen) return;
    placePopover();
    const onResize = () => placePopover();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [allOpen]);

  // close on outside
  useEffect(() => {
    if (!allOpen) return;
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target) || moreBtnRef.current?.contains(e.target)) return;
      setAllOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [allOpen]);

  const scrollByX = (dx) => railRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  const norm = (s = "") =>
    s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtered = useMemo(
    () => categories.filter((c) => norm(c.title || c.key).includes(norm(q))),
    [categories, q]
  );

  const clsWrap = sticky ? "sticky top-[64px] z-10 border-b" : "";

  return (
    <section className={clsWrap}>
      <div ref={wrapRef} className="relative max-w-6xl mx-auto px-4 py-2" role="tablist" aria-label="Danh mục">
        {/* fades */}
        {hasLeft && <div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-white to-transparent" />}
        {hasRight && <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white to-transparent" />}

        <div className="flex items-center gap-2">
          <button
            aria-label="Cuộn trái"
            onClick={() => scrollByX(-240)}
            className={`hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
              hasLeft ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >‹</button>

          <div
            ref={railRef}
            className="flex-1 min-w-0 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]"
            onWheel={(e) => {
              if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) railRef.current?.scrollBy({ left: e.deltaY, behavior: "auto" });
            }}
          >
            <div className="flex items-center gap-2 pr-2">
              {categories.map((c) => (
                <Chip
                  key={c.key}
                  dataKey={c.key}
                  active={currentKey === c.key}
                  onClick={() => onPick?.(c.key)}
                >
                  {c.title || c.key}
                </Chip>
              ))}
            </div>
          </div>

          <button
            aria-label="Cuộn phải"
            onClick={() => scrollByX(240)}
            className={`hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
              hasRight ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >›</button>

          <div className="flex items-center gap-2">
            <button
              ref={moreBtnRef}
              onClick={() => { setAllOpen((v) => !v); requestAnimationFrame(placePopover); }}
              className="rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
              aria-label="Tất cả danh mục"
              title="Tất cả danh mục"
            >…</button>
            {showFilterButton && (
              <button
                onClick={onOpenFilters}
                className="rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
                aria-label="Mở bộ lọc"
              >Lọc</button>
            )}
          </div>
        </div>

        {/* Popover: portal + fixed → không bị cắt trên mobile */}
        {allOpen && createPortal(
          <>
            <div className="fixed inset-0 z-[80]" onClick={() => setAllOpen(false)} /> {/* backdrop trong suốt để bắt click */}
            <div
              ref={popRef}
              className="fixed z-[90] rounded-xl border bg-white shadow-lg p-3"
              style={{ top: popPos.top, left: popPos.left, width: popPos.width }}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  placeholder="Tìm danh mục…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                />
                <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setAllOpen(false)}>
                  Đóng
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-auto pr-1">
                {filtered.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => { onPick?.(c.key); setAllOpen(false); setQ(""); }}
                    className={
                      "text-left px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm " +
                      (currentKey === c.key ? "bg-rose-50 border-rose-300" : "")
                    }
                  >
                    {c.title || c.key}
                  </button>
                ))}
                {!filtered.length && (
                  <div className="text-sm text-gray-500 px-1 py-3 col-span-full">Không có kết quả</div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    </section>
  );
}
