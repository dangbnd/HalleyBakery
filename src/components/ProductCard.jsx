import React, { useMemo, useCallback, useEffect, useState } from "react";
import ProductImage, { getImageUrls } from "./ProductImage.jsx";
import { PriceTag } from "./PriceTag.jsx";
import { pickDefaultSize, priceFor, sizeOptions } from "../lib/pricing.js";
import { cdn, prefetchImage } from "../utils/img.js";
import { usePrefetchOnView } from "../hooks/usePrefetchOnView.js";
import { buildProductChatLink, openChatTarget } from "../utils/chatLink.js";

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

export default function ProductCard({ p, onImageClick, filter }) {
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

  const zaloCta = useMemo(
    () => buildProductChatLink({ product: p, sizeLabel: selectedSizeLabel, intent: "ask_price", preferred: "zalo" }),
    [p, selectedSizeLabel]
  );

  const srcBase = getImageUrls(p)[0] || "";
  const prefetch = useCallback(() => {
    prefetchImage(cdn(srcBase, { w: 480, h: 480, q: 70 }));
    prefetchImage(cdn(srcBase, { w: 960, q: 62 }));
  }, [srcBase]);
  const prefetchRef = usePrefetchOnView(prefetch, "600px");

  return (
    <article
      ref={prefetchRef}
      id={`prod-${p?.id}`}
      className="group rounded-2xl border bg-white overflow-hidden"
      style={{ contentVisibility: "auto", containIntrinsicSize: "300px 380px" }}
      data-card
    >
      <button
        type="button"
        className="relative block aspect-[1/1] w-full overflow-hidden"
        onClick={() => onImageClick?.(p)}
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
      </button>

      <div className="p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{p?.name}</div>
        </div>

        {!!sizeChips.length && (
          <div className="mt-1.5 flex items-center gap-1 overflow-x-auto pb-1">
            {sizeChips.map((s) => {
              const active = s.id === effectiveSel;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSel(s.id)}
                  className={
                    "h-6 px-2 rounded-full border text-[11px] leading-none whitespace-nowrap transition " +
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

        <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
          <PriceTag value={price} className="min-w-0 truncate whitespace-nowrap text-rose-600 text-sm font-semibold" />

          <div className="flex items-center gap-1 shrink-0">
            {messengerCta.href && messengerCta.channel === "messenger" && (
              <a
                href={messengerCta.href}
                onClick={(e) => openChatTarget(messengerCta, e)}
                target="_blank"
                rel="noopener"
                className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-[#006AFF] text-white grid place-items-center shadow-sm hover:opacity-90 active:scale-95 transition"
                aria-label={`Nhan Messenger ve ${p?.name || "mau banh"}`}
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
                className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-[#0068FF] text-white grid place-items-center shadow-sm hover:opacity-90 active:scale-95 transition"
                aria-label={`Nhan Zalo ve ${p?.name || "mau banh"}`}
                title="Nhan Zalo"
              >
                <ZaloIcon />
              </a>
            )}
          </div>
        </div>

      </div>
    </article>
  );
}
