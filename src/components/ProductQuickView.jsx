// src/components/ProductQuickView.jsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProductImage, { getImageUrls } from "./ProductImage.jsx";
import { cdn, cdnThumb, prefetchImage } from "../utils/img.js";
import { VND } from "./PriceTag.jsx";
import { coercePriceBySizeMap } from "../lib/pricing.js";
import { buildProductChatLink, openChatTarget } from "../utils/chatLink.js";
import ConsultForm from "./ConsultForm.jsx";
import { pidOf } from "../utils/pid.js";
import { queueTelemetryEvent } from "../services/telemetry.js";
import { productSnapshot } from "../utils/customerBehavior.js";

const onlyDigits = (s) => String(s || "").replace(/[^\d]/g, "");
const RELATED_PAGE_SIZE = 8;

function buildSizeRows(product = {}) {
  const rows = [];
  const table = Array.isArray(product?.pricing?.table) ? product.pricing.table : [];
  const pbs = coercePriceBySizeMap(product?.priceBySize);
  const hasPbs = Object.keys(pbs).length > 0;

  if (table.length) {
    for (const r of table) {
      const key = r.key ?? r.size ?? r.label ?? "";
      const label = r.label ?? r.size ?? (onlyDigits(key) ? `Size ${onlyDigits(key)}cm` : String(key));
      const price = Number(pbs?.[key] ?? r.price);
      if (Number.isFinite(price) && price > 0) rows.push({ key, label, price });
    }
  } else if (hasPbs) {
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

function HeartIcon({ filled = false }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function ProductQuickView({
  product,
  onClose,
  onPickTag,
  onPickCategory,
  categoryLabel = "",
  relatedProducts = [],
  onRelatedPick,
  isFavorite = false,
  onFavoriteToggle,
  onMessengerClick,
  onConsultSubmit,
}) {
  const displayName = product?.displayName || product?.name || "";
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showConsult, setShowConsult] = useState(false);
  const [relatedVisibleCount, setRelatedVisibleCount] = useState(RELATED_PAGE_SIZE);
  const [relatedScrollHeight, setRelatedScrollHeight] = useState(null);
  const imageFrameRef = useRef(null);
  const relatedScrollRef = useRef(null);
  const relatedSentinelRef = useRef(null);
  const images = useMemo(() => getImageUrls(product), [product]);
  const sizeRows = useMemo(() => buildSizeRows(product), [product]);
  const hasSizeRows = sizeRows.length > 0;
  const tags = useMemo(() => toTagArray(product?.tags), [product?.tags]);

  const primarySizeLabel = sizeRows[0]?.label || "";
  const messengerCta = useMemo(
    () => buildProductChatLink({ product, sizeLabel: primarySizeLabel, intent: "ask_price", preferred: "messenger" }),
    [product, primarySizeLabel]
  );
  const shareUrl = messengerCta.productLink || "";
  const visibleRelatedProducts = useMemo(
    () => relatedProducts.slice(0, relatedVisibleCount),
    [relatedProducts, relatedVisibleCount]
  );
  const hasMoreRelated = relatedVisibleCount < relatedProducts.length;

  useEffect(() => {
    setIdx(0);
    setCopied(false);
    setShowConsult(false);
    setRelatedVisibleCount(RELATED_PAGE_SIZE);
    if (relatedScrollRef.current) relatedScrollRef.current.scrollTop = 0;
  }, [product?.id]);

  useEffect(() => {
    setRelatedVisibleCount((count) => Math.min(Math.max(count, RELATED_PAGE_SIZE), Math.max(relatedProducts.length, RELATED_PAGE_SIZE)));
  }, [relatedProducts.length]);

  const syncRelatedHeight = useCallback(() => {
    const imageFrame = imageFrameRef.current;
    const relatedScroll = relatedScrollRef.current;
    if (!imageFrame || !relatedScroll) return;
    const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) {
      setRelatedScrollHeight(null);
      return;
    }
    const imageRect = imageFrame.getBoundingClientRect();
    const scrollRect = relatedScroll.getBoundingClientRect();
    const next = Math.floor(imageRect.bottom - scrollRect.top);
    setRelatedScrollHeight(next >= 180 ? next : 180);
  }, []);

  useLayoutEffect(() => {
    syncRelatedHeight();
    const id = requestAnimationFrame(syncRelatedHeight);
    window.addEventListener("resize", syncRelatedHeight);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", syncRelatedHeight);
    };
  }, [syncRelatedHeight, product?.id, images.length, relatedProducts.length, showConsult, hasSizeRows, tags.length]);

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

  useEffect(() => {
    if (!hasMoreRelated) return;
    const root = relatedScrollRef.current;
    const target = relatedSentinelRef.current;
    if (!root || !target) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setRelatedVisibleCount((count) => Math.min(count + RELATED_PAGE_SIZE, relatedProducts.length));
      },
      { root, rootMargin: "180px 0px", threshold: 0.01 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasMoreRelated, relatedProducts.length, relatedVisibleCount]);

  useEffect(() => {
    if (!showConsult || !product) return;
    queueTelemetryEvent("consult_form_open", {
      product: productSnapshot(product),
      source: "quick_view",
      page_type: "product_detail",
      content_group: "catalog",
      section: "consult_form",
      list_id: `product:${pidOf(product)}`,
      list_name: "product_quick_view",
      category: product?.category || "",
    });
  }, [showConsult, product]);

  if (!product) return null;

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      queueTelemetryEvent("share_copy", {
        product: productSnapshot(product),
        source: "quick_view",
        page_type: "product_detail",
        content_group: "catalog",
        section: "share",
        list_id: `product:${pidOf(product)}`,
        list_name: "product_quick_view",
        href: shareUrl,
        category: product?.category || "",
      });
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const submitConsult = async (form) => {
    const result = await onConsultSubmit?.(product, form);
    return result;
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 p-3 md:p-6 overflow-auto lg:overflow-hidden">
        <div className="mx-auto w-full max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden lg:h-[calc(100dvh-48px)] lg:max-h-[920px]">
          <div className="flex flex-col lg:flex-row lg:h-full lg:min-h-0">
            <div className="lg:w-2/3 p-3 md:p-4 lg:min-h-0 lg:flex lg:flex-col">
              <div
                ref={imageFrameRef}
                className="relative mx-auto bg-gray-50 rounded-xl overflow-hidden ring-1 ring-gray-200 aspect-[4/5]"
                style={{ width: "min(100%, calc(78vh * 4 / 5))" }}
              >
                {!!images.length && (
                  <ProductImage
                    product={product}
                    index={idx}
                    className="absolute inset-0 w-full h-full object-contain"
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

            <div className="lg:w-1/3 border-t lg:border-l lg:border-t-0 p-4 md:p-6 flex flex-col min-h-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 flex-1 text-lg md:text-xl font-semibold truncate">{displayName}</h3>
                    <button
                      type="button"
                      onClick={() => setShowConsult((v) => !v)}
                      className="h-9 px-4 rounded-full bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 shrink-0"
                    >
                      Tư vấn mẫu này
                    </button>
                  </div>

                  {product.category ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                      <span>{"Danh m\u1EE5c:"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onPickCategory?.(product.category);
                          onClose?.();
                        }}
                        className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        aria-label={`Xem danh muc ${categoryLabel || product.category}`}
                        title={`Xem danh muc ${categoryLabel || product.category}`}
                      >
                        {categoryLabel || product.category}
                      </button>
                    </div>
                  ) : null}
                </div>

                <button
                  className="h-9 w-9 rounded-full border grid place-items-center hover:bg-gray-50 shrink-0"
                  onClick={onClose}
                  aria-label="Dong"
                >
                  ✕
                </button>
              </div>

              {showConsult ? (
                <ConsultForm
                  product={product}
                  onSubmit={submitConsult}
                />
              ) : null}

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className={hasSizeRows ? "text-sm font-medium" : "text-sm font-semibold text-rose-600"}>
                    {hasSizeRows ? "B\u00E1nh c\u00F3 c\u00E1c size" : "Li\u00EAn h\u1EC7"}
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onFavoriteToggle?.(product)}
                      className={
                        "h-8 w-8 rounded-full border grid place-items-center shadow-sm hover:bg-gray-50 active:scale-95 transition " +
                        (isFavorite ? "border-rose-200 text-rose-500 bg-rose-50" : "text-gray-500 bg-white")
                      }
                      aria-label={isFavorite ? `Bo yeu thich ${product?.name || "mau banh"}` : `Luu yeu thich ${product?.name || "mau banh"}`}
                      title={isFavorite ? "Bỏ yêu thích" : "Yêu thích"}
                    >
                      <HeartIcon filled={isFavorite} />
                    </button>

                    <button
                      type="button"
                      onClick={copyShareLink}
                      className="h-8 w-8 rounded-full border bg-white text-gray-600 grid place-items-center shadow-sm hover:bg-gray-50 active:scale-95 transition"
                      aria-label="Sao chep link san pham"
                      title={copied ? "Đã copy" : "Copy link"}
                    >
                      <CopyIcon />
                    </button>

                    {messengerCta.href && messengerCta.channel === "messenger" && (
                      <a
                        href={messengerCta.href}
                        onClick={(e) => {
                          onMessengerClick?.(product, messengerCta, {
                            source: "quick_view",
                            pageType: "product_detail",
                            contentGroup: "catalog",
                            section: "quick_view",
                            listId: `product:${pidOf(product)}`,
                            listName: "product_quick_view",
                            listPosition: 1,
                            resultsCount: 1,
                            category: product?.category || "",
                          });
                          openChatTarget(messengerCta, e);
                        }}
                        target="_blank"
                        rel="noopener"
                        className="h-8 w-8 rounded-full bg-[#006AFF] text-white grid place-items-center shadow-sm hover:opacity-90 active:scale-95 transition"
                        aria-label={`Nhan Messenger ve ${product?.name || "mau banh"}`}
                        title="Nhan Messenger"
                      >
                        <MessengerIcon />
                      </a>
                    )}

                  </div>
                </div>

                {copied ? (
                  <div className="mt-2 text-xs text-emerald-700">Đã copy link sản phẩm.</div>
                ) : null}

                {hasSizeRows && (
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
                )}
              </div>

              {!!tags.length && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">Tag:</div>
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

              {!!relatedProducts.length && (
                <div className="mt-6 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-sm font-medium">Mẫu liên quan</div>
                    <div className="text-[11px] text-gray-400">
                      {visibleRelatedProducts.length}/{relatedProducts.length}
                    </div>
                  </div>
                  <div
                    ref={relatedScrollRef}
                    className="max-h-[min(46vh,520px)] lg:max-h-none overflow-y-auto overscroll-contain pr-1"
                    style={{
                      scrollbarGutter: "stable",
                      height: relatedScrollHeight ? `${relatedScrollHeight}px` : undefined,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {visibleRelatedProducts.map((item) => {
                        const img = getImageUrls(item)[0] || "";
                        return (
                          <button
                            key={pidOf(item)}
                            type="button"
                            onClick={() => onRelatedPick?.(item)}
                            className="group rounded-xl border bg-white overflow-hidden text-left hover:border-rose-200"
                          >
                            <div className="relative aspect-square bg-gray-50">
                              {img ? (
                                <img
                                  src={cdnThumb(img, 180, 180, 65)}
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : null}
                            </div>
                            <div className="px-2 py-1.5 text-xs font-medium text-gray-700 truncate group-hover:text-rose-600">
                              {item.name}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {hasMoreRelated ? (
                      <div ref={relatedSentinelRef} className="flex justify-center py-3">
                        <div className="h-4 w-4 rounded-full border-2 border-rose-300 border-t-transparent animate-spin" />
                      </div>
                    ) : (
                      <div ref={relatedSentinelRef} className="h-2" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
