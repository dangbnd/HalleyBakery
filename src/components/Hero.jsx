// src/components/Hero.jsx
import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { getImageUrl } from "./ProductImage.jsx";
import { cdn } from "../utils/img.js";
import FbPost from "./FbPost.jsx";

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

function useMediaQuery(query, defaultValue = false) {
  const [matches, setMatches] = useState(defaultValue);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

function FbCarousel({ urls = [], interval = 3000, className = "", height = 340 }) {
  const list = useMemo(() => (urls || []).filter(Boolean), [urls]);
  const n = list.length;

  const wrapRef = useRef(null);
  const [wLive, setWLive] = useState(320);
  const [wStable, setWStable] = useState(320);
  const debRef = useRef(0);

  useLayoutEffect(() => {
    if (!wrapRef.current || !n) return;
    const ro = new ResizeObserver((entries) => {
      const nw = Math.round(entries[0].contentRect.width);
      if (Math.abs(nw - wLive) >= 1) setWLive(nw);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [n, wLive]);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      if (Math.abs(wStable - wLive) >= 8) setWStable(wLive);
    }, 150);
    return () => clearTimeout(debRef.current);
  }, [wLive, wStable]);

  const [i, setI] = useState(0);
  const [pause, setPause] = useState(false);

  useEffect(() => {
    if (i >= n) setI(0);
  }, [n, i]);

  useEffect(() => {
    if (pause || n <= 1) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), interval);
    return () => clearInterval(t);
  }, [pause, n, interval]);

  if (!n) return null;

  const activeUrl = list[i] || list[0];
  const next = () => setI((x) => (x + 1) % n);
  const prev = () => setI((x) => (x - 1 + n) % n);

  return (
    <div
      ref={wrapRef}
      className={"relative rounded-2xl border bg-white overflow-hidden " + className}
      style={{ height }}
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
    >
      <div className="relative h-full">
        <div className="absolute inset-0" style={{ contain: "layout paint", backfaceVisibility: "hidden" }}>
          <FbPost key={activeUrl} url={activeUrl} width={wStable} height={height} />
        </div>

        {n > 1 && (
          <>
            <button
              aria-label="Prev"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200"
            >
              {"<"}
            </button>
            <button
              aria-label="Next"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200"
            >
              {">"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function Hero({ products = [], interval = 2000, fbUrls = [], onBannerClick }) {
  const slides = useMemo(
    () =>
      (products || [])
        .filter((p) => p?.banner)
        .map((p) => ({ id: p.id, src: getImageUrl(p, 0) || getImageUrl(p, 1), alt: p.name || "", product: p }))
        .filter((s) => !!s.src),
    [products]
  );

  const fbClean = useMemo(() => (fbUrls || []).filter(isFbUrl).map(normalizeFbUrl), [fbUrls]);
  const isMobile = useMediaQuery("(max-width: 767px)", false);
  const [showFb, setShowFb] = useState(false);

  const leftRef = useRef(null);
  const trackRef = useRef(null);
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

  useEffect(() => {
    let canceled = false;
    let timer = 0;
    const run = () => {
      if (canceled) return;
      setShowFb(true);
    };
    const afterLoad = () => {
      // Mount FB embeds after window load so they do not block initial page load.
      timer = window.setTimeout(run, 300);
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return () => {
      canceled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("load", afterLoad);
    };
  }, []);

  const instantJump = (to) => {
    const el = trackRef.current;
    setAnim(false);
    setI(to);
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translate3d(-${to * 100}%,0,0)`;
      void el.offsetHeight;
      requestAnimationFrame(() => {
        el.style.transition = "";
        setAnim(true);
      });
    } else {
      requestAnimationFrame(() => setAnim(true));
    }
  };

  const onEnd = () => {
    if (n <= 1) return;
    if (i === n + 1) instantJump(1);
    else if (i === 0) instantJump(n);
  };

  const next = () => {
    setAnim(true);
    setI((x) => x + 1);
  };

  const prev = () => {
    setAnim(true);
    setI((x) => x - 1);
  };

  return (
    <section className="max-w-6xl mx-auto p-4">
      <div className="grid gap-4 md:grid-cols-[7.8fr_4.2fr] items-stretch">
        <div
          ref={leftRef}
          className="relative rounded-3xl border overflow-hidden bg-neutral-50"
          onMouseEnter={() => setPause(true)}
          onMouseLeave={() => setPause(false)}
        >
          <div className="relative aspect-[4.8/4]">
            {n === 0 && <div className="grid place-items-center w-full h-full text-sm text-gray-500">Chua co anh banner</div>}

            {n > 0 && (
              <div className="absolute inset-0 overflow-hidden">
                <div
                  ref={trackRef}
                  className={
                    "h-full flex will-change-transform [backface-visibility:hidden] " +
                    (anim ? "transition-transform duration-500 ease-[cubic-bezier(.4,0,.2,1)]" : "")
                  }
                  style={{ transform: `translate3d(-${i * 100}%,0,0)` }}
                  onTransitionEnd={onEnd}
                >
                  {view.map((s, idx) => (
                    <div key={`${s.id}-${idx}`} className="w-full h-full basis-full shrink-0" style={{ contain: "layout paint" }}>
                      <button
                        type="button"
                        onClick={() => onBannerClick?.(s.product)}
                        aria-label={`Xem nhanh: ${s.alt}`}
                        className="block w-full h-full focus:outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <img
                          src={cdn(s.src, { w: 960, q: 70 })}
                          alt={s.alt}
                          className="w-full h-full object-cover cursor-zoom-in"
                          draggable={false}
                          loading="eager"
                          fetchPriority="high"
                        />
                      </button>
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
                  {"<"}
                </button>
                <button
                  aria-label="Next"
                  onClick={next}
                  className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white shadow"
                >
                  {">"}
                </button>
              </>
            )}
          </div>
        </div>

        {!isMobile && (
          <div>
            {showFb ? (
              <FbCarousel urls={fbClean} interval={3000} height={heroH} />
            ) : (
              <div className="rounded-2xl border bg-white/60 animate-pulse" style={{ height: heroH }} />
            )}
          </div>
        )}
      </div>

      {isMobile && (
        <div className="mt-4">
          {showFb ? (
            <FbCarousel urls={fbClean} interval={3000} height={410} />
          ) : (
            <div className="rounded-2xl border bg-white/60 animate-pulse" style={{ height: 410 }} />
          )}
        </div>
      )}
    </section>
  );
}
