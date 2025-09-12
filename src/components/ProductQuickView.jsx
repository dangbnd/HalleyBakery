// src/components/ProductQuickView.jsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const VND = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function ProductQuickView({ product, onClose }) {
  const [idx, setIdx] = useState(0);

  const images = Array.isArray(product?.images) ? product.images : [];
  const table = useMemo(
    () => (Array.isArray(product?.pricing?.table) ? product.pricing.table : []),
    [product]
  );

  const [sel, setSel] = useState(table[0]?.key || null);
  useEffect(() => { if (!sel && table.length) setSel(table[0].key); }, [table, sel]);

  const price = useMemo(() => {
    // 1) giá theo size chọn từ priceBySize nếu có
    if (sel && product?.priceBySize && Number(product.priceBySize[sel]) > 0) {
      return Number(product.priceBySize[sel]);
    }
    // 2) giá trong bảng hợp nhất
    const row = table.find(r => r.key === sel) || table[0];
    if (row && Number(row.price) > 0) return Number(row.price);
    // 3) giá base
    const base = Number(product?.price);
    return Number.isFinite(base) && base > 0 ? base : null;
  }, [sel, product, table]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight" && images.length) setIdx((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft"  && images.length) setIdx((i) => (i - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [images.length, onClose]);

  if (!product) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 p-3 md:p-6 overflow-auto">
        <div className="mx-auto w-full max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            {/* LEFT: Image */}
            <div className="lg:w-2/3 p-3 md:p-4">
              <div className="relative bg-gray-50 rounded-xl overflow-hidden">
                {!!images.length && (
                  <img
                    src={images[idx]}
                    alt={product.name}
                    className="w-full h-[60vh] md:h-[70vh] object-contain"
                  />
                )}
                {images.length > 1 && (
                  <>
                    <button
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                      onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                      aria-label="Ảnh trước"
                    >‹</button>
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                      onClick={() => setIdx((i) => (i + 1) % images.length)}
                      aria-label="Ảnh sau"
                    >›</button>
                  </>
                )}
              </div>

              {images.length > 1 && (
                <div className="mt-3 grid grid-cols-6 md:grid-cols-8 gap-2">
                  {images.map((u, i) => (
                    <button
                      key={i}
                      className={
                        "relative h-16 rounded-lg overflow-hidden border " +
                        (i === idx ? "ring-2 ring-rose-400" : "")
                      }
                      onClick={() => setIdx(i)}
                      aria-label={`Ảnh ${i + 1}`}
                    >
                      <img src={u} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT: Info */}
            <div className="lg:w-1/3 border-t lg:border-l lg:border-t-0 p-4 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg md:text-xl font-semibold">{product.name}</h3>
                <button
                  className="h-9 w-9 rounded-full border grid place-items-center hover:bg-gray-50"
                  onClick={onClose}
                  aria-label="Đóng"
                >✕</button>
              </div>

              {product.category ? (
                <div className="mt-2 text-sm text-gray-600">Danh mục: {product.category}</div>
              ) : null}

              {table.length > 0 && (
                <>
                  <div className="text-sm font-medium mt-3">Kích thước có sẵn</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {table.map(r => (
                      <button
                        key={r.key}
                        onClick={() => setSel(r.key)}
                        className={
                          "px-3 py-1 rounded-full border text-xs " +
                          (sel === r.key ? "bg-gray-100 border-gray-400" : "border-gray-200")
                        }
                        aria-pressed={sel===r.key}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-3 text-rose-600 font-medium">
                {Number.isFinite(price) && price > 0 ? VND.format(price) : "Liên hệ"}
              </div>

              {!!(product.tags || []).length && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {product.tags.map((t, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs">#{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {product.desc || product.description ? (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-1">Mô tả</div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {product.desc || product.description}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
