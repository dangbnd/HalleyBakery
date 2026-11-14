import { forwardRef, useEffect, useRef, useState } from "react";

const DeferredSection = forwardRef(function DeferredSection(
  {
    children,
    eager = false,
    onLayout,
    placeholderHeight = 420,
    rootMargin = "900px 0px",
  },
  forwardedRef
) {
  const localRef = useRef(null);
  const [active, setActive] = useState(eager);

  useEffect(() => {
    if (eager) setActive(true);
  }, [eager]);

  useEffect(() => {
    const element = localRef.current;
    if (active || !element) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setActive(true);
        observer.disconnect();
      },
      { rootMargin, threshold: 0.01 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, rootMargin]);

  useEffect(() => {
    if (!active || !localRef.current) return undefined;
    onLayout?.();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => onLayout?.());
    observer.observe(localRef.current);
    return () => observer.disconnect();
  }, [active, onLayout]);

  const setRefs = (element) => {
    localRef.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  };

  return (
    <div ref={setRefs}>
      {active ? children : (
        <div
          aria-hidden="true"
          style={{ minHeight: `${placeholderHeight}px` }}
        />
      )}
    </div>
  );
});

export default DeferredSection;
