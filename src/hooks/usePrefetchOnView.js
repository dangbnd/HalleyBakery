import { useEffect, useRef } from "react";
export function usePrefetchOnView(cb, rootMargin="400px") {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    let done = false;
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!done && e.isIntersecting) { done = true; cb?.(); io.disconnect(); }
      }
    }, { root: null, rootMargin, threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [cb, rootMargin]);
  return ref;
}
