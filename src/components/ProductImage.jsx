import { useMemo, useState, useRef } from "react";
import { cdn, candidatesFor, mkSrcSet, getImageUrls, getImageUrl, FALLBACK_IMAGE } from "../utils/img.js";

// Re-export để các file khác vẫn import được từ đây
export { getImageUrls, getImageUrl };

export default function ProductImage({
  product,
  className = "",
  index = 0,
  priority = false,
  w = 960,
  h = 0,
  q = 65,
  lqip = true,
}) {
  const urls = getImageUrls(product);
  const primaryRaw = urls[index] || urls[0] || "";
  const [altIdx, setAltIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const handleLoad = () => { if (!loadedRef.current) { loadedRef.current = true; setLoaded(true); } };

  const cands = useMemo(() => candidatesFor(primaryRaw, w, h, q), [primaryRaw, w, h, q]);
  const cur = cands[altIdx] || "";
  const srcset = useMemo(() => (primaryRaw ? mkSrcSet(primaryRaw, w, h, q) : undefined), [primaryRaw, w, h, q]);

  const onErr = (e) => {
    if (altIdx + 1 < cands.length) setAltIdx((i) => i + 1);
    else {
      e.currentTarget.onerror = null;
      e.currentTarget.removeAttribute("srcset");
      e.currentTarget.src = FALLBACK_IMAGE;
    }
  };

  if (!primaryRaw) {
    return (
      <img
        src={FALLBACK_IMAGE}
        alt={product?.name || ""}
        className={className}
        loading="lazy"
        decoding="async"
        draggable={false}
        width={w}
        height={h || w}
      />
    );
  }

  return (
    <div className={"relative w-full h-full"}>
      {!loaded && <div className="absolute inset-0 bg-gray-100" aria-hidden="true" />}
      <img
        src={cur}
        srcSet={srcset}
        sizes="(max-width:1024px) 90vw, 960px"
        alt={product?.name || ""}
        className={className}
        style={
          lqip
            ? { backgroundImage: `url(${cdn(primaryRaw, { w: 24, h: 24, q: 20 })})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
        loading={priority ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "low"}
        decoding="async"
        referrerPolicy="no-referrer"
        data-next={cur}
        onLoad={handleLoad}
        onError={onErr}
        width={w}
        height={h || w}
      />
    </div>
  );
}
