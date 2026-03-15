// src/components/ProductQuickView.jsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ProductImage, { getImageUrls } from "./ProductImage.jsx";
import { cdn, cdnThumb, prefetchImage } from "../utils/img.js";
import { VND } from "./PriceTag.jsx";
import { buildProductChatLink, openChatTarget } from "../utils/chatLink.js";

const onlyDigits = (s) => String(s || "").replace(/[^\d]/g, "");

function buildSizeRows(product = {}) {
  const rows = [];
  const table = Array.isArray(product?.pricing?.table) ? product.pricing.table : [];
  const pbs = product?.priceBySize && typeof product.priceBySize === "object" ? product.priceBySize : null;

  if (table.length) {
    for (const r of table) {
      const key = r.key ?? r.size ?? r.label ?? "";
      const label = r.label ?? r.size ?? (onlyDigits(key) ? `Size ${onlyDigits(key)}cm` : String(key));
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
    rows.push({ key: "base", label: "Gia", price: +product.price });
  }

  rows.sort((a, b) => (parseFloat(onlyDigits(a.label)) || 0) - (parseFloat(onlyDigits(b.label)) || 0));
  return rows;
}

function toTagArray(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean).map((t) => String(t).trim()).filter(Boolean);
  return String(tags || "").split(",").map((t) => t.trim()).filter(Boolean);
}

function MessengerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.05 2 11.05c0 2.61 1.12 4.97 3.01 6.63v3.27l2.76-1.52c1.25.35 2.33.5 3.23.5 5.52 0 10-4.05 10-9.05S17.52 2 12 2zm.1 10.87-2.7-2.9-5.15 2.9 5.79-5.52 2.64 2.86 5.16-2.86-5.74 5.52z" />
    </svg>
  );
}

function ZaloIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M4 3h16a1 1 0 0 1 1 1v16.5a.5.5 0 0 1-.8.4L17 19H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4 5h3l-3 5h3v2H6l3-5H6V8zm7 0h2v7h-2V8zm-3 0h2v7h-2V8z" />
    </svg>
  );
}

export default function ProductQuickView({ product, onClose, onPickTag }) {
  const [idx, setIdx] = useState(0);
  const images = useMemo(() => getImageUrls(product), [product]);
  const sizeRows = useMemo(() => buildSizeRows(product), [product]);
  const tags = useMemo(() => toTagArray(product?.tags), [product?.tags]);

  const primarySizeLabel = sizeRows[0]?.label || "";
  const messengerCta = useMemo(
    () => buildProductChatLink({ product, sizeLabel: primarySizeLabel, intent: "ask_price", preferred: "messenger" }),
    [product, primarySizeLabel]
  );
  const zaloCta = useMemo(
    () => buildProductChatLink({ product, sizeLabel: primarySizeLabel, intent: "ask_price", preferred: "zalo" }),
    [product, primarySizeLabel]
  );

  useEffect(() => {
    setIdx(0);
  }, [product?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight" && images.length) setIdx((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft" && images.length) setIdx((i) => (i - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev || "";
    };
  }, [images.length, onClose]);

  useEffect(() => {
    if (!images.length) return;
    const nexts = [images[(idx + 1) % images.length], images[(idx + 2) % images.length]].filter(Boolean);
    for (const u of nexts) prefetchImage(cdn(u, { w: 960, q: 62 }));
  }, [idx, images]);

  useEffect(() => {
    if (!images.length || !images[idx]) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = cdn(images[idx], { w: 960, q: 62 });
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, [idx, images]);

  if (!product) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 p-3 md:p-6 overflow-auto">
        <div className="mx-auto w-full max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            <div className="lg:w-2/3 p-3 md:p-4">
              <div className="relative bg-gray-50 rounded-xl overflow-hidden ring-1 ring-gray-200">
                {!!images.length && (
                  <ProductImage
                    product={product}
                    index={idx}
                    className="w-full h-[60vh] md:h-[70vh] object-contain"
                    priority
                    w={960}
                    h={0}
                    q={62}
                    lqip={false}
                  />
                )}
                {images.length > 1 && (
                  <>
                    <button
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                      onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                      aria-label="Anh truoc"
                    >
                      ‹
                    </button>
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                      onClick={() => setIdx((i) => (i + 1) % images.length)}
                      aria-label="Anh sau"
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
                      className={"relative h-16 rounded-lg overflow-hidden border " + (i === idx ? "ring-2 ring-rose-400" : "")}
                      onClick={() => setIdx(i)}
                      aria-label={`Anh ${i + 1}`}
                    >
                      <img
                        src={cdnThumb(u, 96, 96, 65)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        width="96"
                        height="96"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:w-1/3 border-t lg:border-l lg:border-t-0 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <h3 className="text-lg md:text-xl font-semibold truncate">{product.name}</h3>

                <button
                  className="ml-auto h-9 w-9 rounded-full border grid place-items-center hover:bg-gray-50"
                  onClick={onClose}
                  aria-label="Dong"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{"K\u00EDch th\u01B0\u1EDBc c\u00F3 s\u1EB5n"}</div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    {messengerCta.href && messengerCta.channel === "messenger" && (
                      <a
                        href={messengerCta.href}
                        onClick={(e) => openChatTarget(messengerCta, e)}
                        target="_blank"
                        rel="noopener"
                        className="h-8 w-8 rounded-full bg-[#006AFF] text-white grid place-items-center shadow-sm hover:opacity-90 active:scale-95 transition"
                        aria-label={`Nhan Messenger ve ${product?.name || "mau banh"}`}
                        title="Nhan Messenger"
                      >
                        <MessengerIcon />
                      </a>
                    )}

                    {zaloCta.href && zaloCta.channel === "zalo" && (
                      <a
                        href={zaloCta.href}
                        onClick={(e) => openChatTarget(zaloCta, e)}
                        target="_blank"
                        rel="noopener"
                        className="h-8 w-8 rounded-full bg-[#0068FF] text-white grid place-items-center shadow-sm hover:opacity-90 active:scale-95 transition"
                        aria-label={`Nhan Zalo ve ${product?.name || "mau banh"}`}
                        title="Nhan Zalo"
                      >
                        <ZaloIcon />
                      </a>
                    )}
                  </div>
                </div>

                <div className="qv-sizes mt-2">
                  <div className="qv-grid">
                    {sizeRows.map(({ key, label, price }) => {
                      const text = label || (/\d/.test(String(key)) ? `Size ${key}cm` : `Size ${key}`);
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

              {product.category ? (
                <div className="mt-4 text-sm text-gray-600">
                  {"Danh m\u1EE5c:"} <span className="font-medium text-gray-800">{product.category}</span>
                </div>
              ) : null}

              {!!tags.length && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => {
                          onPickTag?.(t);
                        }}
                        className="px-2 py-1 rounded-full border text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-400 cursor-pointer"
                        aria-label={`Loc theo ${t}`}
                        title={`Loc theo ${t}`}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {product.desc || product.description ? (
                <div className="mt-5">
                  <div className="text-sm font-medium mb-1">{"M\u00F4 t\u1EA3"}</div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.desc || product.description}</p>
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
