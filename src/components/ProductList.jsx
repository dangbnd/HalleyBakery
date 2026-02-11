// src/components/ProductList.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import ProductCard from "./ProductCard.jsx";
import { pidOf } from "../utils/pid.js";
import { prefetchImage } from "../utils/img.js";

const PAGE_SIZE = 20; // Số sản phẩm mỗi lần hiện

export default function ProductList({ products = [], onImageClick, filter }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  const gridRef = useRef(null);

  // P2: chỉ reset visibleCount khi danh sách sản phẩm thực sự thay đổi (so IDs)
  const prodKey = useMemo(() => (products || []).map(p => p.id).join(","), [products]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [prodKey]);

  // infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver((ents) => {
      if (ents[0]?.isIntersecting) setVisibleCount((c) => Math.min(c + PAGE_SIZE, products.length));
    }, { rootMargin: "200px" });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [products.length]);

  // B2: prefetch ảnh — scope observer vào gridRef, không query toàn document
  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (e.isIntersecting) {
          const urls = (e.target.dataset.prefetch || "").split(",").filter(Boolean);
          urls.forEach(prefetchImage);
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: "400px" });
    const cards = container.querySelectorAll("[data-card]");
    cards.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [products, visibleCount]);

  const visible = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;

  return (
    <>
      <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((p) => (
          <div key={pidOf(p)} data-card>
            <ProductCard p={p} onImageClick={onImageClick} filter={filter} />
          </div>
        ))}
      </div>

      {/* Sentinel: khi user cuộn đến đây → load thêm */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="h-4 w-4 rounded-full border-2 border-rose-300 border-t-transparent animate-spin" />
            <span>Đang tải thêm...</span>
          </div>
        </div>
      )}
    </>
  );
}

export { ProductList };
