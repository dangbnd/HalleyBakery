// src/components/ProductList.jsx
import React, { useEffect } from "react";
import ProductCard from "./ProductCard.jsx";

export default function ProductList({ products = [], onImageClick, filter }) {
  // Prefetch ảnh khi card sắp vào viewport
  useEffect(() => {
    if (!products.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const next = e.target.querySelector("img[data-next]");
          if (next) {
            const url = next.getAttribute("data-next");
            if (url) new Image().src = url;
          }
        }
      },
      { rootMargin: "800px" }
    );
    const cards = document.querySelectorAll("[data-card]");
    cards.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [products]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((p, i) => (
        <div key={(p.id ?? p.code ?? p.name) + "-" + i} data-card>
          <ProductCard p={p} onImageClick={onImageClick} filter={filter} />
        </div>
      ))}
    </div>
  );
}

export { ProductList };
