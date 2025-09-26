import { useMemo, useState } from "react";

const FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='100%' height='100%' fill='%23f3f4f6'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='16' fill='%239ca3af'>Không tải được ảnh</text></svg>";

/* CDN resize + nén webp */
const cdn = (raw = "", w = 600, h = 0, q = 65) => {
  if (!raw) return "";
  const https = String(raw).replace(/^http:\/\//i, "https://");
  const noProto = https.replace(/^https?:\/\//i, "");
  const url = encodeURIComponent(noProto);
  const wh = h ? `&w=${w}&h=${h}` : `&w=${w}`;
  return `https://images.weserv.nl/?url=${url}${wh}&fit=cover&output=webp&q=${q}`;
};

const candidatesFor = (raw = "", w = 600, h = 0, q = 65) => {
  const out = [];
  if (!raw) return out;
  const https = raw.replace(/^http:\/\//i, "https://");
  out.push(cdn(https, w, h, q)); // ưu tiên CDN
  const m1 = https.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) out.push(`https://drive.google.com/thumbnail?id=${m1[1]}&sz=w${w}`);
  const m2 = https.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) out.push(`https://drive.google.com/thumbnail?id=${m2[1]}&sz=w${w}`);
  out.push(https); // ảnh gốc cuối cùng
  return [...new Set(out)];
};

const mkSrcSet = (raw, maxW = 960, h = 0, q = 65) => {
  const steps = [Math.min(480, maxW), Math.min(720, maxW), maxW];
  return steps.map((w) => `${cdn(raw, w, h ? Math.round((h * w) / maxW) : 0, q)} ${w}w`).join(", ");
};

export const getImageUrls = (p) => {
  if (!p) return [];
  return Array.isArray(p?.images)
    ? p.images
    : String(p?.images || "").split(/\s*[\n,|]\s*/).filter(Boolean);
};
export const getImageUrl = (p, index = 0) => {
  const a = getImageUrls(p);
  return a[index] || a[0] || "";
};

export default function ProductImage({
  product,
  className = "",
  index = 0,
  priority = false,
  w = 960,     // ⟵ mục tiêu QuickView
  h = 0,
  q = 65,      // giảm q để nhẹ hơn
  lqip = true, // nền LQIP
}) {
  const urls = getImageUrls(product);
  const primaryRaw = urls[index] || urls[0] || "";
  const [altIdx, setAltIdx] = useState(0);

  const cands = useMemo(() => candidatesFor(primaryRaw, w, h, q), [primaryRaw, w, h, q]);
  const cur = cands[altIdx] || "";
  const srcset = useMemo(() => (primaryRaw ? mkSrcSet(primaryRaw, w, h, q) : undefined), [primaryRaw, w, h, q]);

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
        width={w}
        height={h || w}
      />
    );
  }

  return (
    <img
      src={cur}
      srcSet={srcset}
      sizes="(max-width:1024px) 90vw, 960px"
      alt={product?.name || ""}
      className={className}
      style={
        lqip
          ? { backgroundImage: `url(${cdn(primaryRaw, 24, 24, 20)})`, backgroundSize: "cover", backgroundPosition: "center" }
          : undefined
      }
      loading={priority ? "eager" : "lazy"}
      fetchpriority={priority ? "high" : "low"}
      decoding="async"
      referrerPolicy="no-referrer"
      data-next={cur}
      onError={onErr}
      width={w}
      height={h || w}
    />
  );
}
