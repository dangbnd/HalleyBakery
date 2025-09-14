// src/components/Hero.jsx
import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { getImageUrl } from "./ProductImage.jsx";
import FbPost from "./FbPost.jsx";

/* helpers */
const isFbUrl = (u) => /^https?:\/\/(www\.)?facebook\.com\//.test(u || "");
const normalizeFbUrl = (u) => { try { const x = new URL(u); x.search=""; x.hash=""; return x.toString(); } catch { return u; } };

/* FB fade + arrows (giữ nguyên) */
function FbCarousel({ urls = [], interval = 3000, className = "", height = 340 }) {
  const list = urls.filter(Boolean);
  const n = list.length; if (!n) return null;
  const wrapRef = useRef(null);
  const [wLive, setWLive] = useState(320), [wStable, setWStable] = useState(320);
  const debRef = useRef(0);
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((ents) => {
      const nw = Math.round(ents[0].contentRect.width);
      if (Math.abs(nw - wLive) >= 1) setWLive(nw);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [wLive]);
  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { if (Math.abs(wStable - wLive) >= 8) setWStable(wLive); }, 150);
    return () => clearTimeout(debRef.current);
  }, [wLive, wStable]);

  const [i, setI] = useState(0), [pause, setPause] = useState(false);
  useEffect(() => { if (i >= n) setI(0); }, [n]);
  useEffect(() => { if (pause || n<=1) return; const t=setInterval(()=>setI(x=>(x+1)%n), interval); return ()=>clearInterval(t); }, [pause,n,interval]);
  const next = () => setI(x => (x+1)%n);
  const prev = () => setI(x => (x-1+n)%n);

  return (
    <div ref={wrapRef} className={"relative rounded-2xl border bg-white overflow-hidden " + className}
         style={{height}} onMouseEnter={()=>setPause(true)} onMouseLeave={()=>setPause(false)}>
      <div className="relative h-full">
        {list.map((u,k)=>(
          <div key={`${k}-${u}`} className="absolute inset-0 transition-opacity duration-500"
               style={{opacity:i===k?1:0, willChange:"opacity", contain:"layout paint",
                       pointerEvents:i===k?"auto":"none", backfaceVisibility:"hidden"}}>
            <FbPost url={u} width={wStable} height={height}/>
          </div>
        ))}
        {n>1 && <>
          <button aria-label="Prev" onClick={prev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white shadow">‹</button>
          <button aria-label="Next" onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white shadow">›</button>
        </>}
      </div>
    </div>
  );
}

/* ===== Hero: thêm onBannerClick ===== */
export function Hero({ products = [], interval = 2000, fbUrls = [], onBannerClick }) {
  const slides = useMemo(
    () => (products || [])
      .filter(p => p?.banner)
      .map(p => ({ id:p.id, src:getImageUrl(p,0)||getImageUrl(p,1), alt:p.name||"", product:p }))
      .filter(s => !!s.src),
    [products]
  );
  const fbClean = useMemo(()=> (fbUrls||[]).filter(isFbUrl).map(normalizeFbUrl), [fbUrls]);

  const leftRef = useRef(null), trackRef = useRef(null);
  const [heroH, setHeroH] = useState(340);
  useLayoutEffect(() => {
    if (!leftRef.current) return;
    const ro = new ResizeObserver((entries)=>{ const h=Math.round(entries[0].contentRect.height); if (h) setHeroH(h); });
    ro.observe(leftRef.current);
    return () => ro.disconnect();
  }, []);

  const n = slides.length;
  const view = n>1 ? [slides[n-1], ...slides, slides[0]] : slides;
  const [i,setI] = useState(n>1?1:0), [anim,setAnim] = useState(true), [pause,setPause]=useState(false);
  useEffect(()=>{ setI(n>1?1:0); setAnim(true); },[n]);
  useEffect(()=>{ if(pause||n<=1) return; const t=setInterval(()=>setI(x=>x+1), interval); return ()=>clearInterval(t); },[pause,n,interval]);

  const instantJump = (to) => {
    const el = trackRef.current; setAnim(false); setI(to);
    if (el) { el.style.transition="none"; el.style.transform=`translate3d(-${to*100}%,0,0)`; void el.offsetHeight; requestAnimationFrame(()=>{ el.style.transition=""; setAnim(true); }); }
    else { requestAnimationFrame(()=>setAnim(true)); }
  };
  const onEnd = () => { if (n<=1) return; if (i===n+1) instantJump(1); else if (i===0) instantJump(n); };
  const next = () => { setAnim(true); setI(x=>x+1); };
  const prev = () => { setAnim(true); setI(x=>x-1); };

  return (
    <section className="max-w-6xl mx-auto p-4">
      <div className="grid gap-4 md:grid-cols-[7.8fr_4.2fr] items-stretch">
        {/* slider ảnh + click mở QuickView */}
        <div ref={leftRef} className="relative rounded-3xl border overflow-hidden bg-neutral-50"
             onMouseEnter={()=>setPause(true)} onMouseLeave={()=>setPause(false)}>
          <div className="relative aspect-[4.8/4]">
            {n===0 && <div className="grid place-items-center w-full h-full text-sm text-gray-500">Chưa có ảnh banner</div>}
            {n>0 && (
              <div className="absolute inset-0 overflow-hidden">
                <div ref={trackRef}
                     className={"h-full flex will-change-transform [backface-visibility:hidden] "+(anim?"transition-transform duration-500 ease-[cubic-bezier(.4,0,.2,1)]":"")}
                     style={{transform:`translate3d(-${i*100}%,0,0)`}} onTransitionEnd={onEnd}>
                  {view.map((s,idx)=>(
                    <div key={`${s.id}-${idx}`} className="w-full h-full basis-full shrink-0" style={{contain:"layout paint"}}>
                      <button type="button"
                              onClick={()=> onBannerClick?.(s.product)}
                              aria-label={`Xem nhanh: ${s.alt}`}
                              className="block w-full h-full focus:outline-none focus:ring-2 focus:ring-rose-500">
                        <img src={s.src} alt={s.alt} className="w-full h-full object-cover cursor-zoom-in" draggable={false}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {n>1 && <>
              <button aria-label="Prev" onClick={prev}
                      className="absolute left-3 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white shadow">‹</button>
              <button aria-label="Next" onClick={next}
                      className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white shadow">›</button>
            </>}
          </div>
        </div>

        {/* FB carousel phải */}
        <div className="hidden md:block">
          <FbCarousel urls={fbClean} interval={3000} height={heroH}/>
        </div>
      </div>

      {/* FB carousel dưới (mobile) */}
      <div className="md:hidden mt-4">
        <FbCarousel urls={fbClean} interval={3000} height={410}/>
      </div>
    </section>
  );
}
