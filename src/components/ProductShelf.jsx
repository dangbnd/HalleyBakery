import ProductCard from "./ProductCard.jsx";
import { pidOf } from "../utils/pid.js";

export default function ProductShelf({
  title,
  products = [],
  limit = 4,
  onProductClick,
  isFavorite,
  onFavoriteToggle,
  onMessengerClick,
  actionLabel,
  onAction,
}) {
  const list = (products || []).filter(Boolean).slice(0, limit);
  if (!list.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-sm text-rose-600 hover:underline"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {list.map((p) => (
          <ProductCard
            key={pidOf(p)}
            p={p}
            onImageClick={onProductClick}
            isFavorite={isFavorite?.(p)}
            onFavoriteToggle={onFavoriteToggle}
            onMessengerClick={onMessengerClick}
          />
        ))}
      </div>
    </section>
  );
}
