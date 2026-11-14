import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_IMAGE, candidatesFor } from "../utils/img.js";
import { KEYS, getConfig } from "../utils/config.js";
import { buildFeedbackDisplayItems, parseFeedbackImagesConfig } from "../utils/feedback.js";

const DEMO_COUNT = 60;
const DESKTOP_CARD_COUNT = 36;
const MOBILE_CARD_COUNT = 16;
const FEEDBACK_CARD_IMAGE_WIDTH = 480;
const FEEDBACK_CARD_IMAGE_QUALITY = 62;
const FEEDBACK_HOVER_IMAGE_WIDTH = 860;
const FEEDBACK_HOVER_IMAGE_QUALITY = 68;
const FEEDBACK_LIGHTBOX_IMAGE_WIDTH = 1600;
const TRANSPARENT_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const ROTATIONS = [-12, -9, -7, -5, -3, 3, 5, 7, 9, 11, -6, 4];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function noise(seed, salt = 0) {
  const value = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function makeVisitSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || Date.now();
  }
  return Date.now() + Math.floor(Math.random() * 1000000);
}

function shuffleBySeed(items = [], seed = 0) {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(noise(seed, index + 31) * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function halton(index, base) {
  let result = 0;
  let factor = 1 / base;
  let value = index;

  while (value > 0) {
    result += factor * (value % base);
    value = Math.floor(value / base);
    factor /= base;
  }

  return result;
}

function buildCollageItems(items = [], count = 0, variantSeed = 0) {
  if (!items.length || count <= 0) return [];
  const shuffled = shuffleBySeed(items, variantSeed);
  return Array.from({ length: count }, (_, index) => {
    const sourceIndex = index % shuffled.length;
    const base = shuffled[sourceIndex];
    return {
      ...base,
      collageId: `${base.id}-stack-${variantSeed}-${index}`,
      sourceIndex,
    };
  });
}

function readRuntimeFeedbackEntries() {
  try {
    return parseFeedbackImagesConfig(getConfig(KEYS.FEEDBACK_IMAGES, "")).map((item, index) => ({
      id: item.id || `feedback-${index}`,
      image: item.image,
      productName: item.name || `Feedback ${index + 1}`,
      categoryLabel: "Feedback khach hang",
    }));
  } catch (error) {
    console.warn("[SocialProofSection] feedback config read failed:", error?.message || error);
    return [];
  }
}

function createArtCollageLayouts(count, mobile = false, variantSeed = 0) {
  if (count <= 0) return [];

  const seedOffset = Math.abs(Number(variantSeed) || 0) % 1000000;
  const n = (index, salt = 0) => noise(index + seedOffset, salt + (mobile ? 97 : 0));
  const rotationAt = (index, salt = 0) => ROTATIONS[Math.floor(n(index, salt) * ROTATIONS.length) % ROTATIONS.length];
  const baseCols = mobile ? 4 : 6;
  const baseRowsTarget = mobile ? 5 : 6;
  const baseCount = Math.min(count, baseCols * baseRowsTarget);
  const accentCount = Math.max(0, count - baseCount);
  const baseRows = Math.max(1, Math.ceil(baseCount / baseCols));
  const cellWidth = 100 / baseCols;
  const cellHeight = 100 / baseRows;
  const orders = mobile
    ? [
        [0, 2, 1, 3],
        [1, 3, 0, 2],
        [3, 1, 2, 0],
        [2, 0, 3, 1],
      ]
    : [
        [0, 3, 5, 2, 4, 1],
        [4, 1, 3, 0, 5, 2],
        [2, 5, 1, 4, 0, 3],
        [5, 2, 4, 1, 3, 0],
        [1, 4, 0, 5, 2, 3],
        [3, 0, 2, 4, 1, 5],
      ];
  const layouts = [];
  const addLayout = ({ centerX, centerY, width, height, rotate, z, frame }) => {
    const safeWidth = clamp(width, mobile ? 22 : 15, mobile ? 42 : 34);
    const safeHeight = clamp(height, mobile ? 24 : 17, mobile ? 48 : 40);
    layouts.push({
      top: `${centerY - safeHeight / 2}%`,
      left: `${centerX - safeWidth / 2}%`,
      width: `${safeWidth}%`,
      height: `${safeHeight}%`,
      rotate,
      z,
      frame,
    });
  };

  for (let index = 0; index < baseCount; index++) {
    const row = Math.floor(index / baseCols);
    const slot = index % baseCols;
    const order = orders[(row + Math.floor(n(row, 20) * orders.length)) % orders.length];
    const col = order[slot % order.length];
    const sizeBoost = n(index, 21) > (mobile ? 0.78 : 0.82) ? (mobile ? 1.16 : 1.22) : 1;
    const width =
      cellWidth * (mobile ? 1.28 + n(index, 1) * 0.34 : 1.2 + n(index, 1) * 0.32) * sizeBoost;
    const height = width * ((mobile ? 1.08 : 1.03) + n(index, 2) * (mobile ? 0.14 : 0.18));
    let centerX =
      (col + 0.5) * cellWidth +
      (n(index, 3) - 0.5) * cellWidth * (mobile ? 0.5 : 0.42) +
      Math.sin((row + 1) * (slot + 1) * 0.9) * (mobile ? 1.5 : 1.8);
    let centerY =
      (row + 0.5) * cellHeight +
      (n(index, 4) - 0.5) * cellHeight * (mobile ? 0.46 : 0.4) +
      (col % 2 === 0 ? -cellHeight * 0.08 : cellHeight * 0.08);
    let rotate =
      rotationAt(index, 22) * (mobile ? 0.7 : 0.82) +
      (n(index, 5) - 0.5) * (mobile ? 8 : 11);
    const frame = n(index, 6) > 0.36 ? "polaroid" : "card";
    let z = 8 + row * 2 + Math.floor(n(index, 7) * (mobile ? 8 : 10));

    if (col === 0) centerX -= cellWidth * 0.28;
    if (col === baseCols - 1) centerX += cellWidth * 0.28;
    if (row === 0) centerY -= cellHeight * 0.22;
    if (row === baseRows - 1) centerY += cellHeight * 0.22;
    if (Math.abs(rotate) > (mobile ? 9 : 11)) {
      centerX += rotate > 0 ? 1.8 : -1.8;
      centerY += index % 2 === 0 ? -1.1 : 1.1;
    }

    rotate = clamp(rotate, mobile ? -15 : -22, mobile ? 15 : 22);

    addLayout({ centerX, centerY, width, height, rotate, z, frame });
  }

  for (let accentIndex = 0; accentIndex < accentCount; accentIndex++) {
    const index = baseCount + accentIndex;
    const seed = accentIndex + 1;
    let width = mobile ? 28 + n(index, 8) * 8 : 18 + n(index, 8) * 11;
    if (accentIndex % 4 === 1) width += mobile ? 4 : 5;
    if (accentIndex % 5 === 3) width += mobile ? 2.5 : 3.5;

    const height = width * ((mobile ? 1.08 : 1.03) + n(index, 9) * (mobile ? 0.15 : 0.2));
    let centerX =
      8 +
      halton(seed, 2) * 84 +
      (n(index, 10) - 0.5) * (mobile ? 8 : 7) +
      Math.sin(seed * 1.9) * (mobile ? 3.5 : 3);
    let centerY =
      8 +
      halton(seed, 3) * 84 +
      (n(index, 11) - 0.5) * (mobile ? 8 : 7) +
      Math.cos(seed * 1.7) * (mobile ? 3.2 : 2.8);
    let rotate =
      rotationAt(index, 23) * (mobile ? 0.88 : 0.98) +
      (n(index, 12) - 0.5) * (mobile ? 10 : 14);
    const frame = n(index, 13) > 0.3 ? "polaroid" : "card";
    let z = 28 + accentIndex * 2 + Math.floor(n(index, 14) * 12);

    if (centerX < 22) centerX -= mobile ? 5.5 : 4.5;
    if (centerX > 78) centerX += mobile ? 5.5 : 4.5;
    if (centerY < 18) centerY -= mobile ? 4.5 : 4;
    if (centerY > 82) centerY += mobile ? 4.5 : 4;
    if (accentIndex % 3 === 0) centerY -= mobile ? 2.4 : 1.8;
    if (accentIndex % 4 === 2) centerX += centerX < 50 ? -(mobile ? 2.8 : 2.2) : mobile ? 2.8 : 2.2;

    rotate = clamp(rotate, mobile ? -17 : -24, mobile ? 17 : 24);

    addLayout({ centerX, centerY, width, height, rotate, z, frame });
  }

  return layouts;
}

function createCollageLayouts(count, mobile = false, variantSeed = 0) {
  return createArtCollageLayouts(count, mobile, variantSeed);
}

function feedbackImageCandidates(raw, width, quality) {
  return candidatesFor(raw, width, 0, quality);
}

function FeedbackProofImage({ item, priority = false, className = "", width, quality }) {
  const raw = String(item?.image || "").trim();
  const candidates = useMemo(() => feedbackImageCandidates(raw, width, quality), [raw, width, quality]);
  const [altIndex, setAltIndex] = useState(0);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef(null);
  const current = candidates[altIndex] || raw || FALLBACK_IMAGE;

  useEffect(() => {
    setAltIndex(0);
    setLoaded(false);
  }, [raw, width, quality]);

  useEffect(() => {
    if (priority) {
      setShouldLoad(true);
      return undefined;
    }

    const node = imageRef.current;
    if (!node || typeof IntersectionObserver !== "function") {
      setShouldLoad(true);
      return undefined;
    }

    setShouldLoad(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "320px 0px", threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [priority, raw]);

  const onError = (event) => {
    if (!shouldLoad) return;
    if (altIndex + 1 < candidates.length) {
      setLoaded(false);
      setAltIndex((index) => index + 1);
      return;
    }

    event.currentTarget.onerror = null;
    event.currentTarget.src = FALLBACK_IMAGE;
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {!loaded ? <div className="skeleton absolute inset-0" aria-hidden="true" /> : null}
      <img
        ref={imageRef}
        src={shouldLoad ? current : TRANSPARENT_IMAGE}
        alt={item?.productName || item?.categoryLabel || "Feedback khach hang"}
        className={`${className} transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        loading={shouldLoad ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "low"}
        decoding="async"
        referrerPolicy="no-referrer"
        width={width}
        height={width}
        onLoad={() => {
          if (shouldLoad) setLoaded(true);
        }}
        onError={onError}
      />
    </div>
  );
}

function ProofImage({ item, priority = false, className = "", variant = "card" }) {
  const imageWidth = variant === "hover" ? FEEDBACK_HOVER_IMAGE_WIDTH : FEEDBACK_CARD_IMAGE_WIDTH;
  const imageQuality = variant === "hover" ? FEEDBACK_HOVER_IMAGE_QUALITY : FEEDBACK_CARD_IMAGE_QUALITY;

  return (
    <FeedbackProofImage
      item={item}
      priority={priority}
      className={className}
      width={imageWidth}
      quality={imageQuality}
    />
  );
}

function PopupProofImage({ item, imageHint }) {
  const raw = String(item?.image || "").trim();
  const candidates = useMemo(() => {
    const hinted = String(imageHint?.src || "").trim();
    return [...new Set([...feedbackImageCandidates(raw, FEEDBACK_LIGHTBOX_IMAGE_WIDTH, 74), hinted].filter(Boolean))];
  }, [imageHint?.src, raw]);
  const [altIndex, setAltIndex] = useState(0);
  const current = candidates[altIndex] || raw || FALLBACK_IMAGE;

  useEffect(() => {
    setAltIndex(0);
  }, [candidates]);

  const onError = (event) => {
    if (altIndex + 1 < candidates.length) {
      setAltIndex((index) => index + 1);
      return;
    }

    event.currentTarget.onerror = null;
    event.currentTarget.src = FALLBACK_IMAGE;
  };

  return (
    <img
      data-feedback-lightbox-image=""
      src={current}
      alt={item?.productName || item?.categoryLabel || "Feedback khach hang"}
      className="block h-auto w-auto max-h-[calc(100dvh-34px)] max-w-[calc(100vw-34px)] object-contain rounded-[16px] bg-white"
      width={imageHint?.width || undefined}
      height={imageHint?.height || undefined}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}

function buildFrameClasses(frame = "card") {
  if (frame === "polaroid") {
    return {
      outer: "rounded-[24px] bg-white p-[6px] pb-[10px] shadow-[0_18px_38px_rgba(15,23,42,0.18)] ring-1 ring-black/5",
      inner: "rounded-[14px]",
    };
  }

  return {
    outer: "rounded-[24px] bg-white p-[6px] shadow-[0_20px_44px_rgba(15,23,42,0.16)] ring-1 ring-black/5",
    inner: "rounded-[15px]",
  };
}

function percentValue(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function previewStyleFor(layout, mobile = false) {
  const left = percentValue(layout.left);
  const top = percentValue(layout.top);
  const width = percentValue(layout.width, 20);
  const height = percentValue(layout.height, 24);
  const gap = mobile ? 1.5 : 1.8;
  const minEdge = mobile ? 2 : 1.5;
  const maxEdge = 100 - minEdge;
  const previewWidth = clamp(width * 2, mobile ? 42 : 30, mobile ? 84 : 56);
  const previewHeight = clamp(height * 2, mobile ? 48 : 34, mobile ? 92 : 78);
  const rightLeft = left + width + gap;
  const leftLeft = left - gap - previewWidth;
  const rightSpace = maxEdge - rightLeft;
  const leftSpace = left - minEdge;
  let previewLeft;

  if (rightLeft + previewWidth <= maxEdge) {
    previewLeft = rightLeft;
  } else if (leftLeft >= minEdge) {
    previewLeft = leftLeft;
  } else {
    previewLeft = rightSpace >= leftSpace ? maxEdge - previewWidth : minEdge;
  }

  const centerY = top + height / 2;
  const previewTop = clamp(centerY - previewHeight / 2, minEdge, maxEdge - previewHeight);

  return {
    left: `${previewLeft}%`,
    top: `${previewTop}%`,
    width: `${previewWidth}%`,
    height: `${previewHeight}%`,
  };
}

function CollageCard({
  item,
  layout,
  index,
  hoveredIndex,
  setHoveredIndex,
  onOpen,
  enableHover = true,
  priority = false,
}) {
  const isHovered = enableHover && hoveredIndex === index;
  const isDimmed = enableHover && hoveredIndex !== null && !isHovered;
  const frame = buildFrameClasses(layout.frame);
  const showHover = (nextIndex) => {
    if (enableHover) setHoveredIndex(nextIndex);
  };

  return (
    <button
      data-feedback-card=""
      type="button"
      onClick={(event) => {
        const image = event.currentTarget.querySelector("img");
        onOpen(index, {
          src: image?.currentSrc || image?.src || "",
          width: image?.naturalWidth || 0,
          height: image?.naturalHeight || 0,
        });
      }}
      onMouseEnter={() => showHover(index)}
      onMouseLeave={() => showHover(null)}
      onFocus={() => showHover(index)}
      onBlur={() => showHover(null)}
      className={`absolute block cursor-zoom-in text-left transition-all duration-300 ease-out ${frame.outer} ${
        isHovered ? "ring-2 ring-white shadow-[0_26px_70px_rgba(15,23,42,0.28)]" : ""
      }`}
      style={{
        top: layout.top,
        left: layout.left,
        width: layout.width,
        height: layout.height,
        transform: isHovered
          ? "translateY(-6px) rotate(0deg)"
          : `rotate(${layout.rotate}deg)`,
        transformOrigin: "center center",
        filter: isDimmed ? "brightness(0.58) saturate(0.82)" : "none",
        zIndex: isHovered ? 240 : layout.z,
        willChange: isHovered ? "transform" : "auto",
      }}
      aria-label={`Mo anh feedback ${index + 1}`}
    >
      <div className={`relative h-full w-full overflow-hidden bg-slate-100 ${frame.inner}`}>
        <ProofImage item={item} priority={priority} className="h-full w-full object-cover" />
      </div>
    </button>
  );
}

function HoverPreview({ item, layout, mobile = false }) {
  if (!item || !layout) return null;

  const frame = buildFrameClasses(layout.frame);

  return (
    <div
      data-feedback-hover-preview=""
      className={`pointer-events-none absolute z-[300] transition-all duration-200 ease-out ${frame.outer}`}
      style={previewStyleFor(layout, mobile)}
      aria-hidden="true"
    >
      <div className={`relative h-full w-full overflow-hidden bg-white ${frame.inner}`}>
        <ProofImage item={item} variant="hover" className="h-full w-full object-contain bg-white" />
      </div>
    </div>
  );
}

function Lightbox({ item, imageHint, canNavigate, onClose, onPrev, onNext }) {
  const swipeStartRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const focusId = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (canNavigate && event.key === "ArrowLeft") onPrev();
      if (canNavigate && event.key === "ArrowRight") onNext();
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) || [])];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusId);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [canNavigate, onClose, onPrev, onNext]);

  const onTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const onTouchEnd = (event) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || !canNavigate) return;

    const touch = event.changedTouches?.[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    const minDistance = 42;
    const mostlyHorizontal = Math.abs(dx) > Math.abs(dy) * 1.25;

    if (elapsed <= 700 && Math.abs(dx) >= minDistance && mostlyHorizontal) {
      event.preventDefault();
      if (dx < 0) onNext();
      else onPrev();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/82 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Ảnh feedback khách hàng"
    >
      <div
        data-feedback-lightbox-frame=""
        className="relative inline-block max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] touch-pan-y rounded-[21px] bg-white p-[5px] shadow-[0_30px_80px_rgba(15,23,42,0.45)]"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute -right-3 -top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-xl text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.2)] transition hover:text-slate-950"
          aria-label="Dong anh"
        >
          ×
        </button>

        {canNavigate ? (
          <>
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-xl text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:text-slate-950 sm:left-3 sm:h-11 sm:w-11"
              aria-label="Anh truoc"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onNext}
              className="absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-xl text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:text-slate-950 sm:right-3 sm:h-11 sm:w-11"
              aria-label="Anh sau"
            >
              ›
            </button>
          </>
        ) : null}

        <PopupProofImage item={item} imageHint={imageHint} />
      </div>
    </div>
  );
}

function useCanHover() {
  const [canHover, setCanHover] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(media.matches);
    update();

    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return canHover;
}

function useDesktopLayout() {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();

    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return desktop;
}

export default function SocialProofSection({
  entries = [],
}) {
  const [visitSeed] = useState(makeVisitSeed);
  const [runtimeFeedbackEntries, setRuntimeFeedbackEntries] = useState(() => readRuntimeFeedbackEntries());
  useEffect(() => {
    const refresh = () => setRuntimeFeedbackEntries(readRuntimeFeedbackEntries());
    window.addEventListener("hb:config-changed", refresh);
    return () => window.removeEventListener("hb:config-changed", refresh);
  }, []);

  const sourceEntries = runtimeFeedbackEntries.length ? runtimeFeedbackEntries : entries;
  const items = useMemo(
    () => buildFeedbackDisplayItems(sourceEntries, DEMO_COUNT),
    [sourceEntries]
  );
  const [hoveredDesktopIndex, setHoveredDesktopIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [selectedPool, setSelectedPool] = useState("desktop");
  const [selectedImageHint, setSelectedImageHint] = useState(null);
  const canHover = useCanHover();
  const desktopLayout = useDesktopLayout();

  const desktopItems = useMemo(
    () => desktopLayout ? buildCollageItems(items, DESKTOP_CARD_COUNT, visitSeed + 101) : [],
    [desktopLayout, items, visitSeed]
  );
  const mobileItems = useMemo(
    () => desktopLayout ? [] : buildCollageItems(items, MOBILE_CARD_COUNT, visitSeed + 202),
    [desktopLayout, items, visitSeed]
  );
  const desktopLayouts = useMemo(
    () => desktopLayout ? createCollageLayouts(DESKTOP_CARD_COUNT, false, visitSeed + 303) : [],
    [desktopLayout, visitSeed]
  );
  const mobileLayouts = useMemo(
    () => desktopLayout ? [] : createCollageLayouts(MOBILE_CARD_COUNT, true, visitSeed + 404),
    [desktopLayout, visitSeed]
  );
  const hoveredDesktopItem = hoveredDesktopIndex === null ? null : desktopItems[hoveredDesktopIndex] || null;
  const hoveredDesktopLayout = hoveredDesktopIndex === null ? null : desktopLayouts[hoveredDesktopIndex] || null;
  const selectedItems = selectedPool === "mobile" ? mobileItems : desktopItems;
  const selectedItem = selectedIndex === null ? null : selectedItems[selectedIndex] || null;

  const openDesktopLightbox = (index, imageHint = null) => {
    setSelectedPool("desktop");
    setSelectedImageHint(imageHint);
    setSelectedIndex(index);
  };
  const openMobileLightbox = (index, imageHint = null) => {
    setSelectedPool("mobile");
    setSelectedImageHint(imageHint);
    setSelectedIndex(index);
  };
  const closeLightbox = useCallback(() => {
    setSelectedIndex(null);
    setSelectedImageHint(null);
  }, []);
  const showPrev = useCallback(() => {
    setSelectedImageHint(null);
    setSelectedIndex((current) => (current === null ? null : (current - 1 + selectedItems.length) % selectedItems.length));
  }, [selectedItems.length]);
  const showNext = useCallback(() => {
    setSelectedImageHint(null);
    setSelectedIndex((current) => (current === null ? null : (current + 1) % selectedItems.length));
  }, [selectedItems.length]);

  if (!items.length) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 py-6 md:py-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Feedback của khách hàng</h2>
      </div>

      <div className="relative z-0 isolate overflow-hidden rounded-[34px] border border-slate-200/70 bg-[radial-gradient(circle_at_top,#ffffff_0%,#f4fbff_58%,#eef7fb_100%)] px-4 py-5 shadow-[0_18px_48px_rgba(148,163,184,0.08)] sm:px-6 md:px-8 md:py-7">
        <div className="relative hidden md:block">
          <div className="relative mx-auto aspect-square w-full max-w-[980px]">
            {desktopItems.map((item, index) => (
              <CollageCard
                key={item.collageId}
                item={item}
                layout={desktopLayouts[index]}
                index={index}
                hoveredIndex={hoveredDesktopIndex}
                setHoveredIndex={setHoveredDesktopIndex}
                onOpen={openDesktopLightbox}
                enableHover={canHover}
                priority={index < 6}
              />
            ))}
            {canHover && hoveredDesktopItem && hoveredDesktopLayout ? (
              <HoverPreview item={hoveredDesktopItem} layout={hoveredDesktopLayout} />
            ) : null}
          </div>
        </div>

        <div className="relative md:hidden">
          <div className="relative mx-auto aspect-square w-full max-w-[460px]">
            {mobileItems.map((item, index) => (
              <CollageCard
                key={item.collageId}
                item={item}
                layout={mobileLayouts[index]}
                index={index}
                hoveredIndex={null}
                setHoveredIndex={() => {}}
                onOpen={openMobileLightbox}
                enableHover={false}
                priority={index < 4}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedItem ? (
        <Lightbox
          item={selectedItem}
          imageHint={selectedImageHint}
          canNavigate={selectedItems.length > 1}
          onClose={closeLightbox}
          onPrev={showPrev}
          onNext={showNext}
        />
      ) : null}
    </section>
  );
}
