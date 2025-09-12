import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { getImageUrl } from "./ProductImage.jsx";
import FbPost from "./FbPost.jsx";
import { DATA } from "../data.js";

/* ---------- helpers ---------- */
const isFbUrl = (u) => /^https?:\/\/(www\.)?facebook\.com\//.test(u || "");
const normalizeFbUrl = (u) => {
  try {
    const x = new URL(u);
    x.search = "";
    x.hash = "";
    return x.toString();
  } catch {
    return u;
  }
};

// components/Hero.jsx (rút gọn phần FbCarousel)
function FbCarousel({ urls = [], interval = 3000, className = "", height = 340 }) {
  const list = urls.filter(Boolean);
  const n = list.length;
  if (!n) return null;

  const view = n > 1 ? [list[n - 1], ...list, list[0]] : list;
  const [i, setI] = useState(n > 1 ? 1 : 0);
  const [anim, setAnim] = useState(true);
  const wrapRef = useRef(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((ents) => setW(Math.round(ents[0].contentRect.width)));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setI(n > 1 ? 1 : 0); setAnim(true); }, [n]);
  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setI(x => x + 1), interval);
    return () => clearInterval(t);
  }, [n, interval]);

  const onEnd = () => {
    if (i === n + 1) { setAnim(false); setI(1); requestAnimationFrame(() => setAnim(true)); }
    if (i === 0)     { setAnim(false); setI(n); requestAnimationFrame(() => setAnim(true)); }
  };

  return (
    <div ref={wrapRef} className={"relative rounded-2xl border bg-white overflow-hidden " + className} style={{ height }}>
     <div className="relative h-full">
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="h-full flex"
            style={{ transform: `translateX(-${i * 100}%)`, transition: anim ? "transform 500ms ease" : "none" }}
            onTransitionEnd={onEnd}
          >
            {view.map((u, idx) => (
              <div key={`${idx}-${u}`} className="basis-full shrink-0">
               <FbPost url={u} width={w} height={height} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Hero ---------- */
export function Hero({ products = [], interval = 2000, fbUrls = [] }) {
  const slides = useMemo(
    () =>
      (products || [])
        .filter((p) => p?.banner)
        .map((p) => ({
          id: p.id,
          src: getImageUrl(p, 0) || getImageUrl(p, 1),
          alt: p.name || "",
        }))
        .filter((s) => !!s.src),
    [products]
  );
  const leftRef = useRef(null);
  const [heroH, setHeroH] = useState(340);
  useLayoutEffect(() => {
    if (!leftRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.round(entries[0].contentRect.height);
      if (h) setHeroH(h);
    });
    ro.observe(leftRef.current);
    return () => ro.disconnect();
  }, []);

  const n = slides.length;
  const view = n > 1 ? [slides[n - 1], ...slides, slides[0]] : slides;

  const [i, setI] = useState(n > 1 ? 1 : 0);
  const [anim, setAnim] = useState(true);
  const [pause, setPause] = useState(false);

  useEffect(() => {
    setI(n > 1 ? 1 : 0);
    setAnim(true);
  }, [n]);

  useEffect(() => {
    if (pause || n <= 1) return;
    const t = setInterval(() => setI((x) => x + 1), interval);
    return () => clearInterval(t);
  }, [pause, n, interval]);

  const onEnd = () => {
    if (n <= 1) return;
    if (i === n + 1) {
      setAnim(false);
      setI(1);
      requestAnimationFrame(() => setAnim(true));
    } else if (i === 0) {
      setAnim(false);
      setI(n);
      requestAnimationFrame(() => setAnim(true));
    }
  };

  const next = () => {
    setAnim(true);
    setI(i + 1);
  };
  const prev = () => {
    setAnim(true);
    setI(i - 1);
  };

  return (
    <section className="max-w-6xl mx-auto p-4">
      <div className="grid gap-4 md:grid-cols-[7.8fr_4.2fr] items-stretch">
        {/* slider ảnh */}
        <div
         ref={leftRef}
          className="relative rounded-3xl border overflow-hidden bg-neutral-50"
          onMouseEnter={() => setPause(true)}
          onMouseLeave={() => setPause(false)}
        >
          <div className="relative aspect-[4.8/4]">
            {n === 0 && (
              <div className="grid place-items-center w-full h-full text-sm text-gray-500">
                Chưa có ảnh banner
              </div>
            )}

            {n > 0 && (
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="h-full flex"
                  style={{
                    transform: `translateX(-${i * 100}%)`,
                    transition: anim ? "transform 500ms ease" : "none",
                  }}
                  onTransitionEnd={onEnd}
                >
                  {view.map((s, idx) => (
                    <div key={`${s.id}-${idx}`} className="w-full h-full basis-full shrink-0">
                      <img
                        src={s.src}
                        alt={s.alt}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {n > 1 && (
              <>
                <button
                  aria-label="Prev"
                  onClick={prev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white shadow"
                >
                  ‹
                </button>
                <button
                  aria-label="Next"
                  onClick={next}
                  className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white shadow"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>

        {/* FB carousel phải (desktop) */}
          <div className="hidden md:block">
            <FbCarousel urls={fbUrls} interval={3000} height={heroH} />
          </div>
        </div>
          <div className="md:hidden mt-4">
            <FbCarousel urls={fbUrls} interval={3000} height={410} />
          </div>
    </section>
  );
}
