// src/components/ProductImage.jsx
const FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='100%' height='100%' fill='%23f3f4f6'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='16' fill='%239ca3af'>No image</text></svg>";

export const getImageUrls = (p) => {
  if (!p) return [];
  const arr = Array.isArray(p.images)
    ? p.images
    : String(p.images || "").split(/[\n,|]\s*/).filter(Boolean);
  return arr;
};

// >>> Thêm hàm này để Hero.jsx import được
export const getImageUrl = (p, i = 0) => {
  const arr = getImageUrls(p);
  return arr[i] || arr[0] || "";
};

export default function ProductImage({
  product,
  hover = true,
  className = "absolute inset-0 w-full h-full object-cover",
}) {
  const arr = getImageUrls(product);
  const primary = arr[0] || FALLBACK;
  const secondary = hover && arr[1] ? arr[1] : null;

  return (
    <>
      <img src={primary} alt={product?.name || ""} className={className} draggable={false} />
      {secondary && (
        <img
          src={secondary}
          alt={product?.name || ""}
          className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          draggable={false}
        />
      )}
    </>
  );
}
