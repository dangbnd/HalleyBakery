// src/components/ProductList.jsx
import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import ProductCard from "./ProductCard.jsx";
import { pidOf } from "../utils/pid.js";

const PAGE_SIZE = 20; // Số sản phẩm mỗi lần hiện
const CARD_IMAGE_SIZES =
  "(max-width: 639px) calc(50vw - 22px), (max-width: 1023px) calc(33.333vw - 24px), 276px";

export default function ProductList({
  products = [],
  onImageClick,
  filter,
  isFavorite,
  onFavoriteToggle,
  onMessengerClick,
  trackingContext = {},
  initialCount = PAGE_SIZE,
  pageSize = PAGE_SIZE,
}) {
  const firstPageSize = Math.max(1, Number(initialCount) || PAGE_SIZE);
  const nextPageSize = Math.max(1, Number(pageSize) || PAGE_SIZE);
  const [visibleCount, setVisibleCount] = useState(firstPageSize);
  const sentinelRef = useRef(null);

  // P2: chỉ reset visibleCount khi danh sách sản phẩm thực sự thay đổi (so IDs)
  const prodKey = useMemo(() => (products || []).map(pidOf).join(","), [products]);
  useEffect(() => { setVisibleCount(firstPageSize); }, [prodKey, firstPageSize]);

  const visible = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;

  const loadMore = useCallback(() => {
    setVisibleCount((count) => Math.min(count + nextPageSize, products.length));
  }, [nextPageSize, products.length]);

  // infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;

    const io = new IntersectionObserver((ents) => {
      if (ents[0]?.isIntersecting) loadMore();
    }, { rootMargin: "800px 0px" });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loadMore, visibleCount]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((p, index) => (
          <div key={pidOf(p)} data-product-card="" data-product-id={pidOf(p)}>
            <ProductCard
              p={p}
              onImageClick={onImageClick}
              filter={filter}
              isFavorite={isFavorite?.(p)}
              onFavoriteToggle={onFavoriteToggle}
              onMessengerClick={onMessengerClick}
              imageSizes={CARD_IMAGE_SIZES}
              trackingContext={{
                ...trackingContext,
                index: index + 1,
                resultsCount: products.length,
                category: trackingContext.category || p?.category || "",
              }}
            />
          </div>
        ))}
      </div>

      {/* Sentinel: khi user cuộn đến đây → load thêm */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <button
            type="button"
            onClick={loadMore}
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 shadow-sm transition hover:border-rose-200 hover:text-rose-600"
          >
            <span aria-hidden="true">+</span>
            <span>Xem thêm {Math.min(nextPageSize, products.length - visibleCount)} mẫu</span>
          </button>
        </div>
      )}
    </>
  );
}

export { ProductList };
