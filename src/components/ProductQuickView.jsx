// src/components/ProductQuickView.jsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const VND = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const onlyDigits = (s) => String(s || "").match(/\d+/)?.[0] || "";

// Gom size → giá từ pricing.table | priceBySize | price
function buildSizeRows(product = {}) {
  const rows = [];
  const table = Array.isArray(product?.pricing?.table) ? product.pricing.table : [];
  const pbs =
    product?.priceBySize && typeof product.priceBySize === "object"
      ? product.priceBySize
      : null;

  if (table.length) {
    for (const r of table) {
      const key = r.key ?? r.size ?? r.label ?? "";
      const label =
        r.label ??
        r.size ??
        (onlyDigits(key) ? `Size ${onlyDigits(key)}cm` : String(key));
      const price = Number(pbs?.[key] ?? r.price);
      if (Number.isFinite(price) && price > 0) rows.push({ key, label, price });
    }
  } else if (pbs) {
    for (const k of Object.keys(pbs)) {
      const price = Number(pbs[k]);
      if (Number.isFinite(price) && price > 0) {
        const label = onlyDigits(k) ? `Size ${onlyDigits(k)}cm` : `Size ${k}`;
        rows.push({ key: k, label, price });
      }
    }
  } else if (Number.isFinite(+product?.price) && +product.price > 0) {
    rows.push({ key: "base", label: "Giá", price: +product.price });
  }

  rows.sort(
    (a, b) =>
      (parseFloat(onlyDigits(a.label)) || 0) -
      (parseFloat(onlyDigits(b.label)) || 0)
  );
  return rows;
}

export default function ProductQuickView({ product, onClose, onPickTag }) {
  const [idx, setIdx] = useState(0);
  const images = Array.isArray(product?.images) ? product.images : [];
  const sizeRows = useMemo(() => buildSizeRows(product), [product]);

  const messengerLink = useMemo(() => {
    const envLink = import.meta.env.VITE_MESSENGER_LINK;
    const envPage = import.meta.env.VITE_MESSENGER_PAGE;
    const base = envLink || (envPage ? `https://m.me/${envPage}` : "");
    return base?.startsWith("http") ? base : "";
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight" && images.length)
        setIdx((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft" && images.length)
        setIdx((i) => (i - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev || "";
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
              <div className="relative bg-gray-50 rounded-xl overflow-hidden ring-1 ring-gray-200">
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
                      onClick={() =>
                        setIdx((i) => (i - 1 + images.length) % images.length)
                      }
                      aria-label="Ảnh trước"
                    >
                      ‹
                    </button>
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                      onClick={() => setIdx((i) => (i + 1) % images.length)}
                      aria-label="Ảnh sau"
                    >
                      ›
                    </button>
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
                      <img
                        src={u}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT: Info */}
            <div className="lg:w-1/3 border-t lg:border-l lg:border-t-0 p-4 md:p-6">
              {/* Header */}
              <div className="flex items-center gap-3">
                <h3 className="text-lg md:text-xl font-semibold truncate">
                  {product.name}
                </h3>

                {messengerLink && (
                  <a
                    href={messengerLink}
                    target="_blank"
                    rel="noopener"
                    aria-label="Nhắn qua Messenger"
                    title="Nhắn qua Messenger"
                    className="ml-auto grid place-items-center h-9 w-9 rounded-full bg-[#006AFF] text-white shadow ring-1 ring-[#cfe0ff] hover:opacity-90 active:scale-95 transition"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 2C6.48 2 2 6.05 2 11.05c0 2.61 1.12 4.97 3.01 6.63v3.27l2.76-1.52c1.25.35 2.33.5 3.23.5 5.52 0 10-4.05 10-9.05S17.52 2 12 2zm.1 10.87-2.7-2.9-5.15 2.9 5.79-5.52 2.64 2.86 5.16-2.86-5.74 5.52z" />
                    </svg>
                  </a>
                )}

                <button
                  className="h-9 w-9 rounded-full border grid place-items-center hover:bg-gray-50"
                  onClick={onClose}
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>

              {/* Sizes + price */}
              <div className="mt-4">
                <div className="text-sm font-medium">Kích thước có sẵn</div>

                <div className="qv-sizes mt-2">
                  <div className="qv-grid">
                    {sizeRows.map(({ key, label, price }) => {
                      const text =
                        label ||
                        (/\d/.test(String(key)) ? `Size ${key}cm` : `Size ${key}`);
                      return (
                        <div key={key} className="qv-chip">
                          <span className="qv-label">{text}</span>
                          <span className="qv-price">{VND.format(price)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Category */}
              {product.category ? (
                <div className="mt-4 text-sm text-gray-600">
                  Danh mục:{" "}
                  <span className="font-medium text-gray-800">
                    {product.category}
                  </span>
                </div>
              ) : null}

              {/* Tags */}
              {!!(product.tags || []).length && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {product.tags.map((t, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => { onPickTag?.(t); onClose?.(); }}
                        className="px-2 py-1 rounded-full border text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-400 cursor-pointer"
                        aria-label={`Lọc theo ${t}`}
                        title={`Lọc theo ${t}`}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {product.desc || product.description ? (
                <div className="mt-5">
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
