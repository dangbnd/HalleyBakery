// src/components/ProductCard.jsx
import React, { useMemo, useState, useEffect } from "react";
import ProductImage from "./ProductImage.jsx";
import { SizeSelector } from "./SizeSelector.jsx";
import { PriceTag } from "./PriceTag.jsx";
import { sizeOptions, pickDefaultSize, priceFor } from "../lib/pricing.js";

const toDigits = (s) => String(s || "").match(/\d+/)?.[0] || "";

export default function ProductCard({ p, onImageClick, filter }) {
  const options = useMemo(() => sizeOptions(p), [p]);
  const [sel, setSel] = useState(() => pickDefaultSize(p, filter));
  useEffect(() => setSel(pickDefaultSize(p, filter)), [p, filter]);

  const price = useMemo(() => priceFor(p, sel), [p, sel]);

  // Build responsive labels: mobile "Sz12", desktop "Size 12cm"
  const sizeItems = useMemo(
    () =>
      options.map(({ id, label }) => {
        const d = toDigits(label);
        return {
          id,
          // JSX label works with SizeSelector since it renders children
          label: (
            <>
              <span className="hidden text-[13.5px] md:inline">{label}</span>
              <span className="md:hidden text-sx">{d || label} cm</span>
            </>
          ),
        };
      }),
    [options]
  );

  return (
    <article 
      id={`prod-${p?.id}`}
      className="group rounded-2xl border bg-white overflow-hidden"
      style={{ contentVisibility: "auto", containIntrinsicSize: "300px 380px" }}
    >
      <button
        type="button"
        className="relative block aspect-[1/1] w-full overflow-hidden"
        onClick={() => onImageClick?.(p)}
        aria-label={p?.name}
      >
        <ProductImage product={p} className="absolute inset-0 w-full h-full object-cover" />
      </button>

      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium truncate">{p?.name}</div>
          <PriceTag value={price} className="text-rose-600 text-sm font-semibold shrink-0" />
        </div>

        {sizeItems.length > 0 && (
          <SizeSelector
            sizes={sizeItems}
            value={sel}
            onChange={setSel}
            className="mt-2"
          />
        )}
      </div>
    </article>
  );
}
