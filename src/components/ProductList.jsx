// src/components/ProductList.jsx
import ProductCard from "./ProductCard.jsx";

export function ProductList({ products = [], onImageClick, filter }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((p) => (
        <ProductCard key={p.id} p={p} onImageClick={onImageClick} filter={filter} />
      ))}
    </div>
  );
}

export default ProductList;
