// src/components/Filters.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeTagLabel, tagKey } from "../utils/tagKey.js";
import { sizeOptions } from "../lib/pricing.js";
import {
  hasReliableCreatedAtMetadata,
  hasStockMetadata,
} from "../lib/catalogIntegrity.js";

const foldText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

const SMART_TAG_GROUPS = [
  { title: "Màu", needles: ["xanh", "hong", "do", "vang", "trang", "den", "tim", "cam", "nau", "pastel"] },
  { title: "Sự kiện", needles: ["sinh nhat", "birthday", "thoi noi", "day thang", "cuoi", "wedding", "anniversary", "valentine", "noel"] },
  { title: "Chủ đề", needles: ["baby", "be trai", "be gai", "hoa", "basic", "cute", "cartoon", "princess", "oto", "gau"] },
];

export default function Filters({ products = [], tags = [], value = null, onChange, className = "" }) {
  /* ---------- TAGS ---------- */
  const normTag = (t) => {
    if (typeof t === "string") {
      const label = normalizeTagLabel(t);
      return { id: tagKey(label), label };
    }
    const rawId = t?.id ?? t?.key ?? t?.value ?? t?.label ?? JSON.stringify(t);
    const label = normalizeTagLabel(t?.label ?? t?.name ?? String(rawId));
    return { id: tagKey(rawId || label), label };
  };

  // Lấy tag từ sản phẩm khi sheet trống hoặc muốn gộp
  const derivedProductTags = useMemo(() => {
    const m = new Map();
    for (const p of products || []) {
      for (const t of p.tags || []) {
        const raw = normalizeTagLabel(
          typeof t === "string" ? t : String(t?.id ?? t?.label ?? "")
        );
        if (!raw || raw === "#VALUE!") continue;
        const id = tagKey(raw);
        if (!m.has(id)) m.set(id, { id, label: raw });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [products]);

  const productTagIds = useMemo(
    () => new Set(derivedProductTags.map((tag) => tag.id)),
    [derivedProductTags]
  );

  // Master tag chỉ cung cấp nhãn cho tag có thật trong tập sản phẩm hiện tại.
  const allTags = useMemo(() => {
    const fromProp = (tags || [])
      .map(normTag)
      .filter((x) => x.label && x.label !== "#VALUE!" && productTagIds.has(x.id));
    const map = new Map();
    [...fromProp, ...derivedProductTags].forEach((x) => {
      if (x.id && !map.has(x.id)) map.set(x.id, { id: x.id, label: x.label });
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [tags, derivedProductTags, productTagIds]);

  /* ---------- GIÁ (lấy ở mọi nơi) ---------- */
  const prices = useMemo(() => {
    const vals = [];
    for (const p of products || []) {
      if (Array.isArray(p?.pricing?.table)) {
        for (const r of p.pricing.table) {
          const n = Number(r?.price);
          if (Number.isFinite(n) && n > 0) vals.push(n);
        }
      }
      if (p?.priceBySize && typeof p.priceBySize === "object") {
        for (const v of Object.values(p.priceBySize)) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) vals.push(n);
        }
      }
      const n = Number(p?.price);
      if (Number.isFinite(n) && n > 0) vals.push(n);
    }
    return vals;
  }, [products]);

  // P4: tránh Math.min/max spread overflow khi mảng lớn
  const priceMin = prices.length ? prices.reduce((a, b) => a < b ? a : b, Infinity) : 0;
  const priceMax = prices.length ? prices.reduce((a, b) => a > b ? a : b, -Infinity) : 0;

  const initialPrice = value?.priceActive && Array.isArray(value?.price)
    ? value.price
    : [priceMin, priceMax];
  const hasInteracted = useRef(false);
  const [minV, setMinV] = useState(() => initialPrice[0]);
  const [maxV, setMaxV] = useState(() => initialPrice[1]);
  useEffect(() => {
    if (!hasInteracted.current) {
      if (value?.priceActive && Array.isArray(value?.price)) {
        setMinV(value.price[0]);
        setMaxV(value.price[1]);
      } else {
        setMinV(priceMin);
        setMaxV(priceMax);
      }
      return;
    }
    setMinV((current) => Math.max(priceMin, Math.min(current, priceMax)));
    setMaxV((current) => Math.max(priceMin, Math.min(current, priceMax)));
  }, [priceMin, priceMax, value?.priceActive]);

  /* ---------- FACETS ---------- */
  const [qTag, setQTag] = useState("");
  const [tagSet, setTagSet] = useState(() => new Set(value?.tags || []));
  const [tagLabels, setTagLabels] = useState(() => ({ ...(value?.tagLabels || {}) }));
  const [sizeSet, setSizeSet] = useState(() => new Set(value?.sizes || []));
  const [lvlSet, setLvlSet] = useState(() => new Set(value?.levels || []));
  const [featured, setFeatured] = useState(() => !!value?.featured);
  const [inStock, setInStock] = useState(() => !!value?.inStock);
  const [sort, setSort] = useState(() => value?.sort || "");
  const hasStockData = useMemo(() => hasStockMetadata(products), [products]);
  const hasCreatedAtData = useMemo(() => hasReliableCreatedAtMetadata(products), [products]);
  const hasFeaturedData = useMemo(
    () => products.some((product) => !!product?.banner),
    [products]
  );
  useEffect(() => {
    if (!hasStockData && inStock) setInStock(false);
  }, [hasStockData, inStock]);
  useEffect(() => {
    if (!hasCreatedAtData && sort === "newest") setSort("");
  }, [hasCreatedAtData, sort]);

  const priceActive = useMemo(
    () => !(minV === priceMin && maxV === priceMax),
    [minV, maxV, priceMin, priceMax]
  );

  // B1: chỉ gọi onChange khi user thực sự thay đổi filter, không fire on mount
  const markInteracted = () => { hasInteracted.current = true; };
  useEffect(() => {
    if (!hasInteracted.current) return;
    onChange?.({ price: [minV, maxV], priceActive, tags: tagSet, tagLabels: tagLabels, sizes: sizeSet, levels: lvlSet, featured, inStock, sort });
  }, [minV, maxV, priceActive, tagSet, tagLabels, sizeSet, lvlSet, featured, inStock, sort, onChange]);

  /* ---------- OPTIONS ---------- */
  const allSizes = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      for (const option of sizeOptions(product)) {
        if (!option.id || map.has(option.id)) continue;
        map.set(option.id, option.label || option.id);
      }
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi", { numeric: true }));
  }, [products]);

  const allLevels = useMemo(() => {
    const s = new Set();
    for (const p of products) if (p.level) s.add(String(p.level));
    return Array.from(s).sort();
  }, [products]);

  const filteredTags = useMemo(() => {
    const k = foldText(qTag.trim());
    if (!k) return allTags;
    return allTags.filter((x) => foldText(x.label).includes(k) || foldText(x.id).includes(k));
  }, [allTags, qTag]);

  const smartTagGroups = useMemo(() => {
    return SMART_TAG_GROUPS.map((group) => ({
      ...group,
      items: allTags
        .filter((tag) => {
          const label = foldText(`${tag.label} ${tag.id}`);
          return group.needles.some((needle) => label.includes(foldText(needle)));
        })
        .slice(0, 14),
    })).filter((group) => group.items.length > 0);
  }, [allTags]);

  const toggleTag = (t) => {
    markInteracted();
    const next = new Set(tagSet);
    tagSet.has(t.id) ? next.delete(t.id) : next.add(t.id);
    setTagSet(next);
    setTagLabels(prev => ({ ...prev, [t.id]: t.label }));
  };

  const fmt = (v) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(v) + "đ";

  /* ---------- Slider geometry ---------- */
  const disabledRange = priceMax <= priceMin;
  const span = Math.max(1, priceMax - priceMin);
  const pctMin = Math.max(0, Math.min(100, ((minV - priceMin) * 100) / span));
  const pctMax = Math.max(0, Math.min(100, ((maxV - priceMin) * 100) / span));
  const tipL = Math.min(Math.max(pctMin, 6), 94);
  const tipR = Math.min(Math.max(pctMax, 6), 94);

  return (
    <aside className={`p-2 ${className}`}>
      {/* GIÁ */}
      {prices.length > 0 && (
      <section className="mb-5 rounded-xl border bg-white/80 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-6 w-6 rounded-md bg-rose-100 grid place-items-center text-rose-600">₫</div>
          <h3 className="text-sm font-semibold">Khoảng giá</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-gray-500">Từ</label>
            <input
              type="number"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={minV}
              onChange={(e) => { markInteracted(); setMinV(Math.min(Number(e.target.value || 0), maxV)); }}
            />
          </div>
          <div className="relative">
            <label className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-gray-500">Đến</label>
            <input
              type="number"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={maxV}
              onChange={(e) => { markInteracted(); setMaxV(Math.max(Number(e.target.value || 0), minV)); }}
            />
          </div>
        </div>

        <div className={`mt-6 relative h-[88px] fancy-range ${disabledRange ? "opacity-50" : ""}`}>
          <style>{`
            .fancy-range{overflow:visible}
            .fancy-range .bar{
              position:absolute; left:0; right:0; top:40px; height:4px;
              background:#dbeafe; border-radius:9999px;
            }
            .fancy-range .bar-active{
              position:absolute; top:40px; height:4px; background:#3b82f6; border-radius:9999px;
            }
            .fancy-range input[type=range]{
              appearance:none;-webkit-appearance:none;background:transparent;
              position:absolute; left:0; right:0; width:100%; height:36px; top:28px; margin:0;
            }
            .fancy-range input[type=range]::-webkit-slider-runnable-track{ background:transparent; height:36px; }
            .fancy-range input[type=range]::-moz-range-track{ background:transparent; height:36px; }
            .fancy-range input[type=range]::-webkit-slider-thumb{
              -webkit-appearance:none; appearance:none;
              width:18px;height:18px;border-radius:9999px;background:#fff;
              border:2px solid #3b82f6; box-shadow:0 2px 8px rgba(0,0,0,.15); margin-top:-8px;
            }
            .fancy-range input[type=range]::-moz-range-thumb{
              width:18px;height:18px;border-radius:9999px;background:#fff;
              border:2px solid #3b82f6; box-shadow:0 2px 8px rgba(0,0,0,.15);
            }
            .fancy-range input.max{ pointer-events:none; z-index:11 }
            .fancy-range input.max::-webkit-slider-thumb{ pointer-events:auto }
            .fancy-range input.max::-moz-range-thumb{ pointer-events:auto }
            .fancy-range .tip{
              position:absolute; top:2px; transform:translateX(-50%);
              background:#1f2937; color:#fff; font-size:11px; padding:2px 6px; border-radius:6px;
              box-shadow:0 2px 6px rgba(0,0,0,.18); white-space:nowrap;
            }
            .fancy-range .tip:after{
              content:""; position:absolute; left:50%; transform:translateX(-50%);
              top:100%; border:6px solid transparent; border-top-color:#1f2937;
            }
            .fancy-range .minmax{
              position:absolute; left:0; right:0; bottom:0;
              display:flex; justify-content:space-between; font-size:11px; color:#6b7280;
            }
          `}</style>

          <div className="bar" />
          <div className="bar-active" style={{ left: `${pctMin}%`, width: `${pctMax - pctMin}%` }} />

          <div className="tip" style={{ left: `${tipL}%` }}>{fmt(minV)}</div>
          <div className="tip" style={{ left: `${tipR}%` }}>{fmt(maxV)}</div>

          <input
            aria-label="Giá tối thiểu"
            type="range"
            min={priceMin}
            max={priceMax}
            step="1000"
            value={minV}
            onChange={(e) => { markInteracted(); setMinV(Math.min(Number(e.target.value), maxV)); }}
            disabled={disabledRange}
            className="min"
          />
          <input
            aria-label="Giá tối đa"
            type="range"
            min={priceMin}
            max={priceMax}
            step="1000"
            value={maxV}
            onChange={(e) => { markInteracted(); setMaxV(Math.max(Number(e.target.value), minV)); }}
            disabled={disabledRange}
            className="max"
          />

          <div className="minmax">
            <span>{fmt(priceMin)}</span>
            <span>{fmt(priceMax)}</span>
          </div>
        </div>
      </section>
      )}


      {/* TAGS */}
      {!!allTags.length && (
      <section className="mb-5 rounded-xl border bg-white/80 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-sky-100 grid place-items-center text-sky-600">#</div>
            <h3 className="text-sm font-semibold">Tag</h3>
          </div>
        </div>

        <input
          value={qTag}
          onChange={(e) => setQTag(e.target.value)}
          placeholder="Tìm tag…"
          className="rounded-full border px-3 py-1.5 text-xs w-full mb-2"
        />

        {!!smartTagGroups.length && (
          <div className="mb-3 space-y-2">
            {smartTagGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{group.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((t) => {
                    const on = tagSet.has(t.id);
                    return (
                      <button
                        key={`${group.title}-${t.id}`}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className={
                          "px-2.5 py-1 rounded-full text-[11px] border transition " +
                          (on ? "bg-rose-50 border-rose-300 text-rose-700" : "border-gray-200 bg-gray-50 hover:bg-white")
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="max-h-44 overflow-auto flex flex-wrap gap-2">
          {filteredTags.map((t) => {
            // t.id = slug không dấu; t.label = nhãn có dấu
            const on = tagSet.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleTag(t)}
                className={
                  "px-3 py-1.5 rounded-full text-xs border transition " +
                  (on ? "bg-rose-50 border-rose-300 text-rose-700" : "border-gray-200 hover:bg-gray-50")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>
      )}

      {/* SIZES */}
      {!!allSizes.length && (
        <section className="mb-5 rounded-xl border bg-white/80 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-md bg-emerald-100 grid place-items-center text-emerald-700">S</div>
            <h3 className="text-sm font-semibold">Kích thước</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {allSizes.map((size) => {
              const on = sizeSet.has(size.id);
              return (
                <button
                  key={size.id}
                  onClick={() => {
                    markInteracted();
                    const next = new Set(sizeSet);
                    on ? next.delete(size.id) : next.add(size.id);
                    setSizeSet(next);
                  }}
                  className={
                    "px-3 py-1.5 rounded-full text-xs border transition " +
                    (on ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-gray-200 hover:bg-gray-50")
                  }
                >
                  {size.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* LEVELS + FLAGS */}
      {(allLevels.length > 0 || hasFeaturedData || hasStockData) && (
      <section className="mb-5 rounded-xl border bg-white/80 shadow-sm p-4 space-y-3">
        {!!allLevels.length && (
          <>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-indigo-100 grid place-items-center text-indigo-700">L</div>
              <h3 className="text-sm font-semibold">Level giá</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {allLevels.map((l) => {
                const on = lvlSet.has(l);
                return (
                  <button
                    key={l}
                    onClick={() => { markInteracted(); const t = new Set(lvlSet); on ? t.delete(l) : t.add(l); setLvlSet(t); }}
                    className={
                      "px-3 py-1.5 rounded-full text-xs border transition " +
                      (on ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-gray-200 hover:bg-gray-50")
                    }
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3 pt-1">
          {hasFeaturedData && <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-300"
              checked={featured}
              onChange={(e) => { markInteracted(); setFeatured(e.target.checked); }}
            />
            Nổi bật/Banner
          </label>}
          {hasStockData && <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-300"
              checked={inStock}
              onChange={(e) => { markInteracted(); setInStock(e.target.checked); }}
            />
            Còn hàng
          </label>}
        </div>
      </section>
      )}

      {/* SORT + RESET */}
      <section className="mb-2 rounded-xl border bg-white/80 shadow-sm p-4">
        <div className="text-sm font-semibold mb-2">Sắp xếp</div>
        <select
          value={sort}
          onChange={(e) => { markInteracted(); setSort(e.target.value); }}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Mặc định</option>
          {prices.length > 0 && <option value="price-asc">Giá tăng dần</option>}
          {prices.length > 0 && <option value="price-desc">Giá giảm dần</option>}
          {hasCreatedAtData && <option value="newest">Mới nhất</option>}
          <option value="popular">Phổ biến</option>
        </select>

        <button
          className="mt-4 w-full rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => {
            markInteracted();
            setMinV(priceMin); setMaxV(priceMax);
            setTagSet(new Set()); setTagLabels({}); setSizeSet(new Set()); setLvlSet(new Set());
            setFeatured(false); setInStock(false); setSort(""); setQTag("");
          }}
        >
          Xóa bộ lọc
        </button>
      </section>
    </aside>
  );
}
