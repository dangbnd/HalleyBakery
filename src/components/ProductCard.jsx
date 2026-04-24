import React, { useMemo, useCallback, useEffect, useState } from "react";
import ProductImage, { getImageUrls } from "./ProductImage.jsx";
import { PriceTag } from "./PriceTag.jsx";
import { pickDefaultSize, priceFor, sizeOptions } from "../lib/pricing.js";
import { cdn, prefetchImage } from "../utils/img.js";
import { usePrefetchOnView } from "../hooks/usePrefetchOnView.js";
import { buildProductChatLink, openChatTarget } from "../utils/chatLink.js";
import { queueTelemetryEvent } from "../services/telemetry.js";
import { productSnapshot } from "../utils/customerBehavior.js";

const IMPRESSION_STORAGE_KEY = "hb_seen_product_impressions_v1";
const impressionSeen = new Set();
let impressionLoaded = false;

function loadSeenImpressions() {
  if (impressionLoaded || typeof window === "undefined") return;
  impressionLoaded = true;
  try {
    const raw = window.sessionStorage.getItem(IMPRESSION_STORAGE_KEY);
    const values = JSON.parse(raw || "[]");
    if (!Array.isArray(values)) return;
    values.forEach((value) => {
      const key = String(value || "").trim();
      if (key) impressionSeen.add(key);
    });
  } catch {}
}

function persistSeenImpressions() {
  if (typeof window === "undefined") return;
  try {
    const values = [...impressionSeen].slice(-500);
    window.sessionStorage.setItem(IMPRESSION_STORAGE_KEY, JSON.stringify(values));
  } catch {}
}

function shouldTrackImpression(trackingContext = {}) {
  const pageType = String(trackingContext.pageType || "").trim().toLowerCase();
  if (!["search", "category", "favorites"].includes(pageType)) return false;

  const index = Number(trackingContext.index);
  if (Number.isFinite(index) && index >= 12) return false;

  return true;
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

function sizeSortValue(id = "", label = "") {
  const raw = `${id} ${label}`.toLowerCase();
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function shortSizeLabel(id = "", label = "") {
  const key = String(id || "").trim().toLowerCase();
  let m = key.match(/^(\d{1,2})-0$/);
  if (m) return `${m[1]}cm`;

  m = key.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}x${m[2]}cm`;

  m = key.match(/^(\d{1,2}x\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}x${m[2]}cm`;

  const text = String(label || key).trim();
  const k = text.match(/(\d+(?:\s*x\s*\d+){0,2})\s*cm/i);
  if (k) return `${k[1].replace(/\s+/g, "")}cm`;

  const n = text.match(/\d+/);
  if (n) return `${n[0]}cm`;
  return text || "Size";
}

export default function ProductCard({
  p,
  onImageClick,
  filter,
  isFavorite = false,
  onFavoriteToggle,
  onMessengerClick,
  trackingContext = {},
}) {
  const defaultSel = useMemo(() => pickDefaultSize(p, filter), [p, filter]);
  const [sel, setSel] = useState(defaultSel);

  useEffect(() => {
    setSel(defaultSel);
  }, [p?.id, defaultSel]);

  const sizeChips = useMemo(() => {
    const opts = sizeOptions(p).filter((o) => Number.isFinite(Number(o.price)) && Number(o.price) > 0);
    return opts
      .map((o) => ({
        id: String(o.id || ""),
        label: shortSizeLabel(o.id, o.label),
        order: sizeSortValue(o.id, o.label),
      }))
      .sort((a, b) => a.order - b.order);
  }, [p]);

  const effectiveSel = sel || defaultSel || sizeChips[0]?.id || null;
  const price = useMemo(() => priceFor(p, effectiveSel), [p, effectiveSel]);
  const selectedSizeLabel = useMemo(
    () => sizeChips.find((x) => x.id === effectiveSel)?.label || "",
    [sizeChips, effectiveSel]
  );

  const messengerCta = useMemo(
    () => buildProductChatLink({ product: p, sizeLabel: selectedSizeLabel, intent: "ask_price", preferred: "messenger" }),
    [p, selectedSizeLabel]
  );

  const srcBase = getImageUrls(p)[0] || "";
  const trackOnView = useCallback(() => {
    prefetchImage(cdn(srcBase, { w: 480, h: 480, q: 70 }));
    prefetchImage(cdn(srcBase, { w: 960, q: 62 }));
    const snap = productSnapshot(p);
    if (!snap) return;
    if (!shouldTrackImpression(trackingContext)) return;

    loadSeenImpressions();

    const dedupeKey = [
      trackingContext.listId || trackingContext.listName || trackingContext.section || "catalog",
      snap.pid,
    ].join("|");
    if (impressionSeen.has(dedupeKey)) return;
    impressionSeen.add(dedupeKey);
    persistSeenImpressions();

    queueTelemetryEvent("product_impression", {
      product: snap,
      source: trackingContext.source || "product_list",
      page_type: trackingContext.pageType || "",
      content_group: trackingContext.contentGroup || "",
      section: trackingContext.section || "",
      list_id: trackingContext.listId || "",
      list_name: trackingContext.listName || "",
      list_position: trackingContext.index,
      results_count: trackingContext.resultsCount,
      category: trackingContext.category || snap.category || "",
    });
  }, [p, srcBase, trackingContext]);
  const prefetchRef = usePrefetchOnView(trackOnView, "600px");

  return (
    <article
      ref={prefetchRef}
      id={`prod-${p?.id}`}
      className="group relative rounded-2xl border bg-white overflow-hidden"
      style={{ contentVisibility: "auto", containIntrinsicSize: "300px 380px" }}
      data-card
    >
      <button
        type="button"
        className="relative block aspect-[1/1] w-full overflow-hidden"
        onClick={() =>
          onImageClick?.(p, {
            source: trackingContext.openSource || trackingContext.source || "card",
            pageType: trackingContext.pageType || "",
            contentGroup: trackingContext.contentGroup || "",
            section: trackingContext.section || "",
            listId: trackingContext.listId || "",
            listName: trackingContext.listName || "",
            listPosition: trackingContext.index,
            resultsCount: trackingContext.resultsCount,
            category: trackingContext.category || p?.category || "",
          })
        }
        aria-label={p?.name}
      >
        <ProductImage
          product={p}
          className="absolute inset-0 w-full h-full object-cover"
          index={0}
          w={600}
          q={70}
          lqip={false}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-2 text-left">
          <div className="text-sm font-semibold text-white drop-shadow truncate text-left">{p?.name}</div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onFavoriteToggle?.(p)}
        className={
          "absolute right-2 top-2 h-8 w-8 rounded-full border grid place-items-center shadow-sm transition active:scale-95 " +
          (isFavorite
            ? "border-rose-200 bg-white text-rose-500"
            : "border-white/70 bg-white/90 text-gray-500 hover:text-rose-500")
        }
        aria-label={isFavorite ? `Bo yeu thich ${p?.name || "mau banh"}` : `Luu yeu thich ${p?.name || "mau banh"}`}
        title={isFavorite ? "Bỏ yêu thích" : "Yêu thích"}
      >
        <HeartIcon filled={isFavorite} />
      </button>

      <div className="p-3">
        <div className="flex items-center gap-2">
          <PriceTag value={price} className="shrink-0 whitespace-nowrap text-rose-600 text-[16px] font-semibold" />

          <div className="ml-auto flex items-center gap-1 shrink-0">
            {messengerCta.href && messengerCta.channel === "messenger" && (
              <a
                href={messengerCta.href}
                onClick={(e) => {
                  onMessengerClick?.(p, messengerCta, {
                    source: trackingContext.source || "product_list",
                    pageType: trackingContext.pageType || "",
                    contentGroup: trackingContext.contentGroup || "",
                    section: trackingContext.section || "",
                    listId: trackingContext.listId || "",
                    listName: trackingContext.listName || "",
                    listPosition: trackingContext.index,
                    resultsCount: trackingContext.resultsCount,
                    category: trackingContext.category || p?.category || "",
                  });
                  openChatTarget(messengerCta, e);
                }}
                target="_blank"
                rel="noopener"
                className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-[#006AFF] text-white grid place-items-center shadow-sm hover:opacity-90 active:scale-95 transition"
                aria-label={`Nhan Messenger ve ${p?.name || "mau banh"}`}
                title="Nhan Messenger"
              >
                <MessengerIcon />
              </a>
            )}

          </div>
        </div>

        {!!sizeChips.length && (
          <div
            className="mt-2.5 grid grid-cols-2 gap-1 pb-1 sm:[grid-template-columns:repeat(var(--size-cols),minmax(0,1fr))]"
            style={{ "--size-cols": Math.max(sizeChips.length, 1) }}
          >
            {sizeChips.map((s) => {
              const active = s.id === effectiveSel;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => {
                    setSel(s.id);
                    queueTelemetryEvent("size_select", {
                      product: productSnapshot(p),
                      source: "product_card",
                      page_type: trackingContext.pageType || "",
                      content_group: trackingContext.contentGroup || "",
                      section: trackingContext.section || "",
                      list_id: trackingContext.listId || "",
                      list_name: trackingContext.listName || "",
                      list_position: trackingContext.index,
                      results_count: trackingContext.resultsCount,
                      category: trackingContext.category || p?.category || "",
                      value: s.label,
                    });
                  }}
                  className={
                    "h-6 min-w-0 w-full px-1 rounded-full border text-[10px] sm:text-[11px] leading-none text-center whitespace-nowrap transition " +
                    (active
                      ? "border-rose-500 bg-rose-50 text-rose-600 font-semibold"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300")
                  }
                  aria-label={`Chon size ${s.label}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

      </div>
    </article>
  );
}
