// src/components/ProductImage.jsx
import { useMemo, useState } from "react";

const FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='100%' height='100%' fill='%23f3f4f6'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='16' fill='%239ca3af'>Không tải được ảnh</text></svg>";

const tune = (url = "", w = 600) => {
  if (!url) return "";
  if (/drive\.google\.com\/thumbnail/i.test(url)) return url.replace(/([?&]sz=)w\d+/i, `$1w${w}`);
  return url;
};

const candidatesFor = (raw = "", w = 600) => {
  const out = [];
  if (!raw) return out;
  const https = raw.replace(/^http:\/\//i, "https://");
  out.push(tune(https, w));
  const m1 = https.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) out.push(`https://drive.google.com/thumbnail?id=${m1[1]}&sz=w${w}`);
  const m2 = https.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) out.push(`https://drive.google.com/thumbnail?id=${m2[1]}&sz=w${w}`);
  return [...new Set(out)];
};

const mkSrcSet = (u) => [400, 800, 1200].map((w) => `${tune(u, w)} ${w}w`).join(", ");

export const getImageUrls = (p) => {
  if (!p) return [];
  const arr = Array.isArray(p?.images)
    ? p.images
    : String(p?.images || "").split(/\s*[\n,|]\s*/).filter(Boolean);
  return arr;
};

// compat cho code cũ
export const getImageUrl = (p, index = 0) => {
  const a = getImageUrls(p);
  return a[index] || a[0] || "";
};

export default function ProductImage({
  product,
  className = "",
  index = 0,
  priority = false, // <-- thêm prop
}) {
  const urls = getImageUrls(product);
  const primaryRaw = urls[index] || urls[0] || "";
  const [altIdx, setAltIdx] = useState(0);

  const cands = useMemo(() => candidatesFor(primaryRaw, 600), [primaryRaw]);
  const cur = cands[altIdx] || "";

  const onErr = (e) => {
    if (altIdx + 1 < cands.length) setAltIdx((i) => i + 1);
    else {
      e.currentTarget.onerror = null;
      e.currentTarget.removeAttribute("srcset");
      e.currentTarget.src = FALLBACK;
    }
  };

  if (!primaryRaw) {
    return (
      <img
        src={FALLBACK}
        alt={product?.name || ""}
        className={className}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    );
  }

  return (
    <img
      src={cur}
      srcSet={cur ? mkSrcSet(cur) : undefined}
      sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
      alt={product?.name || ""}
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchpriority={priority ? "high" : "low"}
      decoding="async"
      referrerPolicy="no-referrer"
      data-next={cur}
      onError={onErr}
    />
  );
}
