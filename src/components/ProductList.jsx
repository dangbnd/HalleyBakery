import ProductImage from "./ProductImage.jsx";
import { memo, useMemo, useState, useEffect } from "react";

const VND = new Intl.NumberFormat("vi-VN",{ style:"currency", currency:"VND", maximumFractionDigits:0 });

export function ProductList({ products = [], onImageClick, filter }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((p) => (
        <ProductCard key={p.id} p={p} onImageClick={onImageClick} filter={filter}/>
      ))}
    </div>
  );
}

const ProductCard = memo(function ProductCard({ p, onImageClick, filter }) {
  const table = useMemo(() => Array.isArray(p?.pricing?.table) ? p.pricing.table : [], [p]);

  const bestKey = useMemo(() => {
    const rows = table
      .map(r => ({ key: r.key, price: Number(r.price), label: r.label }))
      .filter(r => Number.isFinite(r.price) && r.price > 0);
    if (!rows.length) return null;

    if (filter?.priceActive) {
      const [min, max] = filter.price || [0, Number.MAX_SAFE_INTEGER];
      const inRange = rows.filter(r => r.price >= min && r.price <= max);
      const pick = (inRange.length ? inRange : rows).sort((a,b)=>a.price-b.price)[0];
      return pick.key;
    }
    return rows.sort((a,b)=>a.price-b.price)[0].key;
  }, [table, filter]);

  const [sel, setSel] = useState(bestKey);
  useEffect(() => setSel(bestKey), [bestKey]);

  const price = useMemo(() => {
    const row = table.find(r => r.key === sel);
    const n = Number(row?.price);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [table, sel]);

  return (
    <article className="group rounded-2xl border bg-white overflow-hidden">
      <button className="relative block aspect-[1/1] w-full overflow-hidden" onClick={() => onImageClick?.(p)}>
        <ProductImage product={p} className="absolute inset-0 w-full h-full object-cover" />
      </button>
      <div className="p-3">
        <div className="text-sm font-medium truncate">{p.name}</div>

        {table.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {table.map(s => (
              <button key={s.key}
                onClick={() => setSel(s.key)}
                className={"px-2 py-0.5 rounded-full border text-xs " + (sel===s.key ? "bg-gray-100 border-gray-400":"border-gray-200")}
                aria-pressed={sel===s.key}
              >{s.label}</button>
            ))}
          </div>
        )}

        <div className="text-rose-600 text-sm mt-1">
          {Number.isFinite(price) ? VND.format(price) : "Liên hệ"}
        </div>
      </div>
    </article>
  );
});
