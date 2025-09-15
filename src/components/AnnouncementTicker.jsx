// src/components/AnnouncementTicker.jsx
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";

/** Marquee ticker: continuous, no jump. Mobile & Desktop đều rực rỡ, không che UI. */
export default function AnnouncementTicker({ items = [], speed = 80 }) {
  const texts = useMemo(
    () =>
      (items || [])
        .map((x) => (typeof x === "string" ? x : x?.text))
        .map((s) => String(s || "").trim())
        .filter(Boolean),
    [items]
  );

  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const [repeat, setRepeat] = useState(2);
  const [anim, setAnim] = useState({ distance: 0, duration: 0 });

  const Chunk = () => (
    <div className="flex items-center whitespace-nowrap select-none">
      {texts.map((t, i) => (
        <span key={`${i}-${t}`} className="px-4 md:px-6 py-1 text-[13px] md:text-[14px]">
          <span className="inline-block mr-3 -translate-y-[2px] h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,.75)] animate-pulse" />
          <span className="font-semibold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-fuchsia-300 to-rose-300 drop-shadow-[0_1px_0_rgba(255,255,255,.15)]">
            {t}
          </span>
        </span>
      ))}
    </div>
  );

  const recalc = () => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;

    const oneChunk = track.scrollWidth / Math.max(1, repeat);
    const need = Math.max(2, Math.ceil((wrap.clientWidth * 2) / Math.max(1, oneChunk)));
    if (need !== repeat) { setRepeat(need); return; }

    const total = oneChunk * need;
    const distance = total / 2;                         // cuộn nửa track là khít
    const duration = Math.max(10, distance / Math.max(24, speed));
    setAnim({ distance, duration });
  };

  useLayoutEffect(recalc, [texts.join("|")]);
  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, texts.join("|")]);
  
  if (!texts.length) return null;

  return (
    // Dưới header (56/72px), thấp hơn CategoryBar để không đè.
    <div className="sticky top-[56px] md:top-[68px] z-30 md:pointer-events-auto pointer-events-none">
      <div className="max-w-6xl mx-auto px-4">
        {/* Viền gradient + glow: luôn hiển thị (mobile & desktop) */}
        <div className="group relative rounded-md p-[2px] bg-gradient-to-r from-fuchsia-500 via-rose-500 to-amber-400 shadow-[0_12px_40px_-12px_rgba(244,63,94,.35)]">
          {/* Thanh chạy nền tối */}
          <div
            ref={wrapRef}
            role="region"
            aria-label="Thông báo"
            className="relative h-9 md:h-10 overflow-hidden rounded-md bg-slate-900/95 backdrop-blur-md"
          >
            {/* Icon chuông (luôn hiện) */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 ring-1 ring-white/10 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                  className="h-[20px] w-[20px] text-amber-300" fill="currentColor">
                  <path d="M3 11a1 1 0 0 1 1-1h1l6-4v14l-6-4H4a1 1 0 0 1-1-1v-4Z" />
                  <path d="M20 8a1 1 0 0 1 2 0v8a1 1 0 0 1-2 0V8Z" />
                </svg>
              </div>
            </div>

            {/* Fade mép */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 md:w-20 bg-gradient-to-r from-slate-900 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 md:w-20 bg-gradient-to-l from-slate-900 to-transparent" />

            {/* Track chạy liên tục */}
            <div
              ref={trackRef}
              className="ml-14 flex h-full items-center text-white will-change-transform"
              style={{
                animationName: "hb-marquee",
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                animationDuration: `${anim.duration || 0}s`,
                ["--hb-distance"]: `-${anim.distance || 0}px`,
              }}
            >
              {Array.from({ length: repeat }).map((_, k) => <Chunk key={k} />)}
            </div>
          </div>

          {/* Glow dưới thanh */}
          <div className="pointer-events-none hidden md:block absolute -inset-x-10 -bottom-7 h-12 blur-3xl bg-gradient-to-r from-amber-400/15 via-fuchsia-400/12 to-rose-400/15" />
        </div>
      </div>

      <style>{`
        @keyframes hb-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(var(--hb-distance)); }
        }
        .group:hover [style*="hb-marquee"] { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
