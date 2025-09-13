import { useEffect, useState } from "react";

export default function BackToTop({ threshold = 400 }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return (
    <button
      type="button"
      aria-label="Lên đầu trang"
      title="Lên đầu trang"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={
        "fixed right-4 bottom-4 md:right-6 md:bottom-6 z-50 h-10 w-10 md:h-12 md:w-12 " +
        "rounded-full bg-rose-600 text-white shadow-lg ring-1 ring-rose-300 " +
        "transition-opacity duration-200 " +
        (show ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
      }
    >
      ↑
    </button>
  );
}
