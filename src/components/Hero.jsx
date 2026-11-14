import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { candidatesFor, FALLBACK_IMAGE } from "../utils/img.js";
import {
  createHeroRibbonDeck,
  HERO_RIBBON_CARD_COUNT,
  heroProductKey,
} from "../lib/heroRibbon.js";

const HERO_TRANSITION_MS = 1180;
const MIN_HERO_INTERVAL_MS = 6500;
const HERO_LAYOUT_COUNT = 4;
const PRELOAD_TIMEOUT_MS = 5000;
const DISPLAY_SOURCE_TIMEOUT_MS = 3200;
const PRELOAD_WIDTHS = [420, 620, 780, 620, 420];

const DESKTOP_LAYOUTS = [
  [
    { x: -5, y: -5, w: 22, max: 340, r: 2, z: 1 },
    { x: 6, y: 4, w: 27, max: 455, r: -9, z: 2 },
    { x: 30, y: 14, w: 34, max: 560, r: 7, z: 5 },
    { x: 58, y: 36, w: 29, max: 470, r: -9, z: 3 },
    { x: 84, y: 61, w: 22, max: 340, r: 1, z: 1 },
  ],
  [
    { x: -6, y: -3, w: 23, max: 350, r: -3, z: 1 },
    { x: 7, y: 8, w: 28, max: 460, r: 7, z: 2 },
    { x: 33, y: 12, w: 33, max: 550, r: -6, z: 5 },
    { x: 61, y: 38, w: 28, max: 460, r: 9, z: 3 },
    { x: 86, y: 63, w: 21, max: 330, r: -3, z: 1 },
  ],
  [
    { x: -7, y: -4, w: 22, max: 340, r: -4, z: 1 },
    { x: 5, y: 5, w: 29, max: 470, r: -5, z: 2 },
    { x: 31, y: 17, w: 35, max: 570, r: 6, z: 5 },
    { x: 60, y: 35, w: 28, max: 460, r: -8, z: 3 },
    { x: 85, y: 60, w: 23, max: 350, r: 4, z: 1 },
  ],
  [
    { x: -5, y: -6, w: 21, max: 330, r: 4, z: 1 },
    { x: 8, y: 7, w: 27, max: 450, r: -10, z: 2 },
    { x: 32, y: 13, w: 34, max: 560, r: 4, z: 5 },
    { x: 59, y: 39, w: 30, max: 480, r: -5, z: 3 },
    { x: 86, y: 62, w: 22, max: 340, r: 3, z: 1 },
  ],
];

const MOBILE_LAYOUTS = [
  [
    { x: -28, y: -5, w: 42, r: 2, z: 1 },
    { x: -5, y: 10, w: 52, r: -8, z: 2 },
    { x: 23, y: 28, w: 62, r: 6, z: 5 },
    { x: 58, y: 52, w: 52, r: -8, z: 3 },
    { x: 88, y: 75, w: 42, r: 2, z: 1 },
  ],
  [
    { x: -30, y: -4, w: 44, r: -3, z: 1 },
    { x: -3, y: 12, w: 53, r: 7, z: 2 },
    { x: 25, y: 27, w: 61, r: -6, z: 5 },
    { x: 60, y: 51, w: 51, r: 8, z: 3 },
    { x: 90, y: 76, w: 41, r: -3, z: 1 },
  ],
  [
    { x: -31, y: -5, w: 43, r: -4, z: 1 },
    { x: -6, y: 9, w: 54, r: -5, z: 2 },
    { x: 22, y: 30, w: 63, r: 6, z: 5 },
    { x: 59, y: 50, w: 52, r: -8, z: 3 },
    { x: 89, y: 74, w: 43, r: 4, z: 1 },
  ],
  [
    { x: -29, y: -6, w: 42, r: 4, z: 1 },
    { x: -4, y: 11, w: 52, r: -9, z: 2 },
    { x: 24, y: 27, w: 62, r: 4, z: 5 },
    { x: 57, y: 53, w: 54, r: -5, z: 3 },
    { x: 89, y: 75, w: 42, r: 3, z: 1 },
  ],
];

function useMediaQuery(query, defaultValue = false) {
  const [matches, setMatches] = useState(defaultValue);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    if (media.addEventListener) media.addEventListener("change", update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", update);
      else media.removeListener(update);
    };
  }, [query]);
  return matches;
}

function sessionSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `${values[0]}-${values[1]}`;
  }
  return `${Date.now()}-${Math.random()}`;
}

function loadDecodedImage(url, timeoutMs = PRELOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      callback(value);
    };
    const timer = window.setTimeout(
      () => finish(reject, new Error("Hero image preload timed out")),
      timeoutMs
    );
    image.decoding = "async";
    image.onload = () => {
      const decoded = typeof image.decode === "function"
        ? image.decode().catch(() => {})
        : Promise.resolve();
      decoded.then(() => finish(resolve, {
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
    };
    image.onerror = () => finish(reject, new Error("Hero image preload failed"));
    image.src = url;
  });
}

async function resolveImage(raw, width) {
  const candidates = candidatesFor(raw, width, 0, 72);
  for (const candidate of candidates) {
    try {
      return await loadDecodedImage(candidate);
    } catch {
      // Keep current scene visible and try next image source.
    }
  }
  return "";
}

async function preloadScene(scene) {
  if (!scene) return null;
  const items = await Promise.all(
    scene.items.map(async (item, index) => {
      const image = await resolveImage(item.raw, PRELOAD_WIDTHS[index] || 620);
      return {
        ...item,
        resolved: image?.url || "",
        aspectRatio: image?.width && image?.height
          ? image.width / image.height
          : undefined,
      };
    })
  );
  if (items.some((item) => !item.resolved)) return null;
  return { ...scene, items };
}

function RibbonImage({ item, slot, priority, onAspectRatio, onReady }) {
  const sources = useMemo(() => {
    const width = PRELOAD_WIDTHS[slot] || 620;
    return [
      item.resolved,
      ...candidatesFor(item.raw, width, 0, 72),
      FALLBACK_IMAGE,
    ].filter((value, index, list) => value && list.indexOf(value) === index);
  }, [item.raw, item.resolved, slot]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setLoaded(false);
  }, [item.id, item.resolved]);

  useEffect(() => {
    if (loaded || sourceIndex >= sources.length - 1) return undefined;
    const timer = window.setTimeout(() => {
      setSourceIndex((index) => Math.min(index + 1, sources.length - 1));
    }, DISPLAY_SOURCE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, sourceIndex, sources.length]);

  return (
    <>
      {!loaded && <span className="hero-ribbon-card-skeleton" aria-hidden="true" />}
      <img
        src={sources[sourceIndex] || FALLBACK_IMAGE}
        alt=""
        className={`hero-ribbon-image ${loaded ? "is-loaded" : ""}`}
        width="640"
        height="800"
        loading="eager"
        fetchpriority={priority ? "high" : "auto"}
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) {
            onAspectRatio?.(image.naturalWidth / image.naturalHeight);
          }
          setLoaded(true);
          onReady?.();
        }}
        onError={() => {
          setLoaded(false);
          setSourceIndex((index) => Math.min(index + 1, sources.length - 1));
        }}
      />
    </>
  );
}

function RibbonCard({ item, slot, index, current, scene, onPick, onReady }) {
  const [aspectRatio, setAspectRatio] = useState(item.aspectRatio || 0.8);

  useEffect(() => {
    setAspectRatio(item.aspectRatio || 0.8);
  }, [item.id, item.aspectRatio]);

  const style = {
    "--hero-card-x": `${slot.x}%`,
    "--hero-card-y": `${slot.y}%`,
    "--hero-card-width": `${slot.w}%`,
    "--hero-card-max": `${slot.max || 999}px`,
    "--hero-card-rotation": `${slot.r}deg`,
    "--hero-card-z": slot.z,
    "--hero-card-delay": `${index * 52}ms`,
    "--hero-card-exit-delay": `${(HERO_RIBBON_CARD_COUNT - index - 1) * 52}ms`,
    "--hero-card-ratio": aspectRatio,
  };

  return (
    <button
      type="button"
      className="hero-ribbon-card"
      style={style}
      tabIndex={current ? 0 : -1}
      aria-label={`Xem nhanh ${item.product?.name || "mẫu bánh"}`}
      onClick={() => current && onPick?.(item.product, index, scene)}
    >
      <RibbonImage
        item={item}
        slot={index}
        priority={current && index === 2}
        onAspectRatio={setAspectRatio}
        onReady={() => onReady?.(item.id)}
      />
    </button>
  );
}

function HeroScene({ scene, mobile, current, entering, onPick, onReady }) {
  const readinessRef = useRef({ sceneId: "", items: new Set() });
  const readyTarget = scene
    ? Math.min(scene.items.length, HERO_RIBBON_CARD_COUNT)
    : 0;

  const handleReady = useCallback((itemId) => {
    if (!scene) return;
    if (readinessRef.current.sceneId !== scene.id) {
      readinessRef.current = { sceneId: scene.id, items: new Set() };
    }
    if (readinessRef.current.items.has(itemId)) return;
    readinessRef.current.items.add(itemId);
    if (readinessRef.current.items.size >= readyTarget) {
      onReady?.(scene.id);
    }
  }, [onReady, readyTarget, scene]);

  useEffect(() => {
    if (
      current &&
      scene &&
      readinessRef.current.sceneId === scene.id &&
      readinessRef.current.items.size >= readyTarget
    ) {
      onReady?.(scene.id);
    }
  }, [current, onReady, readyTarget, scene]);

  if (!scene) return null;
  const layouts = mobile ? MOBILE_LAYOUTS : DESKTOP_LAYOUTS;
  const layout = layouts[scene.layout % layouts.length] || layouts[0];
  const stateClass = current
    ? "is-current"
    : entering
      ? "is-pending is-entering"
      : "is-pending";

  return (
    <div className={`hero-ribbon-scene ${stateClass}`} aria-hidden={!current}>
      <div className="hero-ribbon-track">
        {scene.items.slice(0, HERO_RIBBON_CARD_COUNT).map((item, index) => {
          const slot = layout[index] || layout[layout.length - 1];
          return (
            <RibbonCard
              key={item.id}
              item={item}
              slot={slot}
              index={index}
              current={current}
              scene={scene}
              onPick={onPick}
              onReady={handleReady}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Hero({
  products = [],
  loading = false,
  interval = 7600,
  onBannerClick,
}) {
  const mobile = useMediaQuery("(max-width: 767px)", false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const deckRef = useRef(null);
  const currentSceneRef = useRef(null);
  const generationRef = useRef(0);
  const transitionTimerRef = useRef(0);
  const animationFrameRef = useRef(0);
  const currentStartedAtRef = useRef(Date.now());
  const [currentScene, setCurrentScene] = useState(null);
  const [preparedScene, setPreparedScene] = useState(null);
  const [pendingScene, setPendingScene] = useState(null);
  const [deckRevision, setDeckRevision] = useState(0);
  const [currentReady, setCurrentReady] = useState(false);
  const [pendingReady, setPendingReady] = useState(false);
  const [entering, setEntering] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const safeInterval = Math.max(Number(interval) || 7600, MIN_HERO_INTERVAL_MS);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState !== "hidden");
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    currentSceneRef.current = currentScene;
  }, [currentScene]);

  useEffect(() => {
    generationRef.current += 1;
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    const seed = sessionSeed();
    const deck = createHeroRibbonDeck(products, {
      seed,
      cardCount: HERO_RIBBON_CARD_COUNT,
      layoutCount: HERO_LAYOUT_COUNT,
    });
    deckRef.current = deck;
    setPreparedScene(null);
    setPendingScene(null);
    setPendingReady(false);
    setEntering(false);
    const visibleScene = currentSceneRef.current;

    if (!visibleScene) {
      const initial = deck.next();
      currentStartedAtRef.current = Date.now();
      currentSceneRef.current = initial;
      setCurrentReady(false);
      setCurrentScene(initial);
    } else {
      const latestProducts = new Map(
        products.map((product) => [heroProductKey(product), product])
      );
      const updatedScene = {
        ...visibleScene,
        items: visibleScene.items.map((item) => ({
          ...item,
          product: latestProducts.get(item.id) || item.product,
        })),
      };
      currentSceneRef.current = updatedScene;
      setCurrentScene(updatedScene);
    }
    setDeckRevision((revision) => revision + 1);
  }, [products]);

  useEffect(() => {
    if (!currentScene || !currentReady || !deckRef.current) return undefined;
    const generation = generationRef.current;
    let cancelled = false;

    const prepare = async () => {
      let candidate = deckRef.current?.next();
      for (let attempt = 0; candidate && attempt < 3; attempt += 1) {
        const scene = await preloadScene(candidate);
        if (cancelled || generation !== generationRef.current) return;
        if (scene) {
          setPreparedScene(scene);
          return;
        }
        candidate = deckRef.current?.next();
      }
    };

    prepare();

    return () => {
      cancelled = true;
    };
  }, [currentReady, currentScene?.id, deckRevision]);

  const beginTransition = useCallback(() => {
    if (!preparedScene || pendingScene) return;
    const nextScene = preparedScene;
    setPreparedScene(null);
    setPendingScene(nextScene);
    setPendingReady(false);
    setEntering(false);
  }, [pendingScene, preparedScene]);

  useEffect(() => {
    if (!pendingScene || !pendingReady || entering) return undefined;
    const nextScene = pendingScene;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = window.requestAnimationFrame(() => {
        setEntering(true);
        transitionTimerRef.current = window.setTimeout(() => {
          setCurrentReady(false);
          currentSceneRef.current = nextScene;
          setCurrentScene(nextScene);
          setPendingScene(null);
          setPendingReady(false);
          setEntering(false);
          currentStartedAtRef.current = Date.now();
        }, reduceMotion ? 80 : HERO_TRANSITION_MS);
      });
    });
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [entering, pendingReady, pendingScene, reduceMotion]);

  useEffect(() => {
    if (
      reduceMotion ||
      paused ||
      !pageVisible ||
      !currentScene ||
      !preparedScene ||
      pendingScene
    ) {
      return undefined;
    }
    const elapsed = Date.now() - currentStartedAtRef.current;
    const remaining = Math.max(320, safeInterval - elapsed);
    const timer = window.setTimeout(beginTransition, remaining);
    return () => window.clearTimeout(timer);
  }, [
    beginTransition,
    currentScene,
    pageVisible,
    paused,
    pendingScene,
    preparedScene,
    reduceMotion,
    safeInterval,
  ]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const handlePick = useCallback(
    (product, index, scene) => {
      onBannerClick?.(product, {
        listPosition: index + 1,
        resultsCount: scene.items.length,
        category: scene.category,
      });
    },
    [onBannerClick]
  );

  const handleCurrentReady = useCallback((sceneId) => {
    if (sceneId === currentScene?.id) setCurrentReady(true);
  }, [currentScene?.id]);

  const handlePendingReady = useCallback((sceneId) => {
    if (sceneId === pendingScene?.id) setPendingReady(true);
  }, [pendingScene?.id]);

  if (!currentScene && !loading) return null;

  return (
    <section
      className="hero-ribbon-shell"
      aria-label="Bộ sưu tập bánh nổi bật"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className={`hero-ribbon ${paused ? "is-paused" : ""} ${pendingScene ? "is-transitioning" : ""}`}>
        <div className="hero-ribbon-backdrop" aria-hidden="true" />
        {!currentScene && (
          <div className="hero-ribbon-loading skeleton" aria-label="Đang tải sản phẩm nổi bật" />
        )}
        {[currentScene, pendingScene].filter(Boolean).map((scene) => {
          const isCurrent = scene.id === currentScene?.id;
          return (
            <HeroScene
              key={scene.id}
              scene={scene}
              mobile={mobile}
              current={isCurrent}
              entering={!isCurrent && entering}
              onPick={handlePick}
              onReady={isCurrent ? handleCurrentReady : handlePendingReady}
            />
          );
        })}
      </div>
    </section>
  );
}
