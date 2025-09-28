import React, { useMemo, useState, useEffect, useCallback } from "react";
import ProductImage, { getImageUrls } from "./ProductImage.jsx";
import { SizeSelector } from "./SizeSelector.jsx";
import { PriceTag } from "./PriceTag.jsx";
import { sizeOptions, pickDefaultSize, priceFor } from "../lib/pricing.js";
import { cdn, prefetchImage } from "../utils/img.js";
import { usePrefetchOnView } from "../hooks/usePrefetchOnView.js";

const toDigits = (s) => String(s || "").match(/\d+/)?.[0] || "";

export default function ProductCard({ p, onImageClick, filter }) {
  const options = useMemo(() => sizeOptions(p), [p]);
  const [sel, setSel] = useState(() => pickDefaultSize(p, filter));
  useEffect(() => setSel(pickDefaultSize(p, filter)), [p, filter]);

  const price = useMemo(() => priceFor(p, sel), [p, sel]);

  const srcBase = getImageUrls(p)[0] || "";
  const prefetch = useCallback(() => {

    prefetchImage(cdn(srcBase, { w: 480, h: 480, q: 70 }));
    prefetchImage(cdn(srcBase, { w: 960, q: 62 }));
  }, [srcBase]);
  const prefetchRef = usePrefetchOnView(prefetch, "600px");

  const sizeItems = useMemo(
    () =>
      options.map(({ id, label }) => {
        const d = toDigits(label);
        return {
          id,
          label: (
            <>
              <span className="hidden text-[13.5px] md:inline">{label}</span>
              <span className="md:hidden text-xs">{d || label} cm</span>
            </>
          ),
        };
      }),
    [options]
  );

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
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium truncate">{p?.name}</div>
          <PriceTag
            value={price}
            className="text-rose-600 text-sm font-semibold shrink-0"
          />
        </div>

        {sizeItems.length > 0 && (
          <SizeSelector sizes={sizeItems} value={sel} onChange={setSel} className="mt-2" />
        )}
      </div>
    </article>
  );
}
