import { useEffect, useMemo, useRef, useState } from "react";
import ProductImage from "./ProductImage.jsx";
import { FALLBACK_IMAGE, candidatesFor, firstImg } from "../utils/img.js";
import { pidOf } from "../utils/pid.js";
import { KEYS, getConfig } from "../utils/config.js";
import { parseFeedbackImagesConfig } from "../utils/feedback.js";

const DEFAULT_ENTRIES = [
  { key: "than-tai" },
  { key: "be-trai" },
  { key: "3d" },
  { key: "basic" },
];

const CATEGORY_LABEL_FALLBACKS = {
  "than-tai": "Banh than tai",
  "be-trai": "Banh be trai",
  "be-gai": "Banh be gai",
  "tre-em": "Banh tre em",
  "thu-noi": "Banh thoi noi",
  "3d": "Banh tao hinh 3D",
  basic: "Banh basic",
  "100k": "Banh 100K",
};

const DEMO_COUNT = 60;
const DESKTOP_CARD_COUNT = 54;
const MOBILE_CARD_COUNT = 28;
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

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

function humanizeKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d+d$/i.test(raw)) return raw.toUpperCase();
  if (/^\d+k$/i.test(raw)) return raw.toUpperCase();
  return raw
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryLabelOf(product, categoryTitleMap = {}) {
  const key = String(product?.category || "").trim();
  if (!key) return "";
  return String(categoryTitleMap[key] || CATEGORY_LABEL_FALLBACKS[key] || humanizeKey(key) || "").trim();
}

function buildIndexes(products = []) {
  const byPid = new Map();
  const byId = new Map();
  const byCategory = new Map();
  const byName = [];

  (products || []).forEach((product) => {
    if (!firstImg(product)) return;

    const pid = String(pidOf(product) || "").trim();
    const id = String(product?.id || "").trim();
    const category = String(product?.category || "").trim();
    const name = String(product?.name || product?.title || "").trim();

    if (pid) byPid.set(normalize(pid), product);
    if (id) byId.set(normalize(id), product);
    if (category && !byCategory.has(normalize(category))) byCategory.set(normalize(category), product);
    if (name) byName.push({ key: normalize(name), product });
  });

  return { byPid, byId, byCategory, byName };
}

function resolveProduct(entry = {}, indexes) {
  const pid = normalize(entry.pid);
  if (pid && indexes.byPid.has(pid)) return indexes.byPid.get(pid);

  const id = normalize(entry.id);
  if (id && indexes.byId.has(id)) return indexes.byId.get(id);

  const key = normalize(entry.key || entry.category);
  if (key && indexes.byCategory.has(key)) return indexes.byCategory.get(key);

  const nameHint = normalize(entry.productName || entry.name);
  if (nameHint) {
    const exact = indexes.byName.find((item) => item.key === nameHint);
    if (exact?.product) return exact.product;

    const partial = indexes.byName.find((item) => item.key.includes(nameHint) || nameHint.includes(item.key));
    if (partial?.product) return partial.product;
  }

  return null;
}

function buildAutoEntries(products = [], categoryTitleMap = {}, usedPids = new Set(), limit = DEMO_COUNT) {
  const out = [];

  for (const product of products || []) {
    const pid = String(pidOf(product) || "").trim();
    const image = firstImg(product);
    if (!pid || !image || usedPids.has(pid)) continue;

    const categoryLabel = categoryLabelOf(product, categoryTitleMap) || String(product?.name || "").trim();
    out.push({
      id: `auto-${pid}`,
      product,
      image,
      productName: String(product?.name || categoryLabel || "Mau da giao").trim(),
      categoryLabel,
    });

    usedPids.add(pid);
    if (out.length >= limit) break;
  }

  return out;
}

function buildDisplayItems(entries = [], products = [], categoryTitleMap = {}, { fillWithProducts = true } = {}) {
  const indexes = buildIndexes(products);
  const usedPids = new Set();
  const configured = (Array.isArray(entries) && entries.length ? entries : DEFAULT_ENTRIES)
    .map((entry, index) => {
      const product = resolveProduct(entry, indexes);
      const image = String(entry?.image || (product ? firstImg(product) : "") || "").trim();
      if (!image) return null;

      const pid = product ? String(pidOf(product) || "").trim() : "";
      if (pid) usedPids.add(pid);

      const categoryLabel =
        String(
          entry?.categoryLabel ||
            categoryLabelOf(product, categoryTitleMap) ||
            CATEGORY_LABEL_FALLBACKS[String(entry?.key || entry?.category || "").trim()] ||
            humanizeKey(entry?.key || entry?.category) ||
            ""
        ).trim() || "Mau noi bat";

      return {
        id: String(entry?.id || entry?.key || `proof-${index}`),
        product,
        image,
        productName: String(entry?.productName || product?.name || categoryLabel).trim(),
        categoryLabel,
      };
    })
    .filter(Boolean);

  if (!fillWithProducts) return configured.slice(0, DEMO_COUNT);

  const limit = configured.length >= DEMO_COUNT ? DEMO_COUNT : DEMO_COUNT - configured.length;
  const auto = limit > 0 ? buildAutoEntries(products, categoryTitleMap, usedPids, limit) : [];
  return [...configured, ...auto].slice(0, DEMO_COUNT);
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

    layouts.push({
      top: `${centerY - height / 2}%`,
      left: `${centerX - width / 2}%`,
      width: `${width}%`,
      height: `${height}%`,
      rotate,
      z,
      frame,
    });
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

    layouts.push({
      top: `${centerY - height / 2}%`,
      left: `${centerX - width / 2}%`,
      width: `${width}%`,
      height: `${height}%`,
      rotate,
      z,
      frame,
    });
  }

  return layouts;
}

function createCollageLayouts(count, mobile = false, variantSeed = 0) {
  return createArtCollageLayouts(count, mobile, variantSeed);
  const cols = mobile ? 4 : 6;
  const rows = Math.ceil(count / cols);

  if (mobile) {
    const xCenters = Array.from({ length: cols }, (_, index) =>
      cols === 1 ? 50 : 11 + (index / (cols - 1)) * 78
    );
    const yCenters = Array.from({ length: rows }, (_, index) =>
      rows === 1 ? 50 : 8 + (index / (rows - 1)) * 84
    );
    const orders = [
      [0, 2, 1, 3],
      [1, 3, 0, 2],
      [2, 0, 3, 1],
      [3, 1, 2, 0],
    ];
    const sizePattern = [
      [28.5, 33, 29.5, 31.5],
      [31.5, 28.5, 33, 29.5],
      [29.5, 31.5, 28.5, 33],
      [33, 29.5, 31.5, 28.5],
    ];
    const layouts = [];

    for (let index = 0; index < count; index++) {
      const row = Math.floor(index / cols);
      const slot = index % cols;
      const order = orders[row % orders.length];
      const col = order[slot];
      const baseWidth = sizePattern[row % sizePattern.length][col];
      const width = baseWidth + (noise(index, 1) - 0.5) * 2.4;
      const height = width * (1.08 + noise(index, 2) * 0.13);
      let centerX = xCenters[col] + (noise(index, 3) - 0.5) * 5.5 + (row % 2 === 0 ? -1.4 : 1.4);
      let centerY = yCenters[row] + (noise(index, 4) - 0.5) * 4.5 + (col % 2 === 0 ? -1.2 : 1.2);
      let rotate = ROTATIONS[index % ROTATIONS.length] * 0.62 + (noise(index, 5) - 0.5) * 7;
      const frame = noise(index, 6) > 0.38 ? "polaroid" : "card";
      let z = 18 + row * 3 + ((row + col) % 4);

      if ((row + col) % 5 === 0) {
        centerY -= 1.8;
        rotate *= 0.78;
        z += 12;
      }

      if ((row + col) % 4 === 2) {
        centerX += col < cols / 2 ? -1.4 : 1.4;
        centerY += row % 2 === 0 ? 1.2 : -1.2;
      }

      if (row === 0) centerY -= 4;
      if (row === rows - 1) centerY += 4;
      if (col === 0) centerX -= 5;
      if (col === cols - 1) centerX += 5;

      rotate = clamp(rotate, -14, 14);

      layouts.push({
        top: `${centerY - height / 2}%`,
        left: `${centerX - width / 2}%`,
        width: `${width}%`,
        height: `${height}%`,
        rotate,
        z,
        frame,
      });
    }

    return layouts;
  }

  const spreadX = mobile ? 88 : 100;
  const spreadY = mobile ? 82 : 100;
  const startX = (100 - spreadX) / 2;
  const startY = (100 - spreadY) / 2;
  const xCenters = Array.from({ length: cols }, (_, index) =>
    cols === 1 ? 50 : startX + (index / (cols - 1)) * spreadX
  );
  const yCenters = Array.from({ length: rows }, (_, index) =>
    rows === 1 ? 50 : startY + (index / (rows - 1)) * spreadY
  );
  const orders = mobile
    ? [
        [0, 2, 3, 1],
        [3, 1, 0, 2],
        [1, 3, 2, 0],
      ]
    : [
        [0, 3, 5, 2, 4, 1],
        [4, 1, 3, 0, 5, 2],
        [2, 5, 1, 4, 0, 3],
        [5, 2, 4, 1, 3, 0],
      ];
  const layouts = [];

  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / cols);
    const order = orders[row % orders.length];
    const col = order[index % cols];
    const jitterX = (noise(index, 1) - 0.5) * (mobile ? 15 : 14);
    const jitterY = (noise(index, 2) - 0.5) * (mobile ? 12 : 13);
    const sizeNoise = noise(index, 3);
    const aspectNoise = noise(index, 4);
    const frameNoise = noise(index, 5);
    const zNoise = noise(index, 6);
    const offsetNoise = noise(index, 7);
    const edgeNoise = noise(index, 8);
    const rotationBias = ROTATIONS[index % ROTATIONS.length];
    const driftNoise = noise(index, 13);

    let width;
    if (sizeNoise > 0.82) width = mobile ? 36 + noise(index, 9) * 6 : 30 + noise(index, 9) * 6;
    else if (sizeNoise > 0.45) width = mobile ? 29 + noise(index, 10) * 5 : 23 + noise(index, 10) * 5;
    else width = mobile ? 23 + noise(index, 11) * 4.5 : 18 + noise(index, 11) * 4;

    let height = width * (mobile ? 1.08 + aspectNoise * 0.18 : 1.02 + aspectNoise * 0.22);
    let centerX = xCenters[col] + jitterX + (row % 2 === 0 ? -5 : 5) + (driftNoise - 0.5) * (mobile ? 8 : 10);
    let centerY = yCenters[row] + jitterY + (col % 2 === 0 ? -3.5 : 3.5) + (driftNoise - 0.5) * (mobile ? 7 : 8);
    let rotate = rotationBias + (noise(index, 12) - 0.5) * (mobile ? 10 : 16);
    let frame = frameNoise > 0.35 ? "polaroid" : "card";
    let z = 10 + Math.floor(zNoise * 18) + row * 2;

    if (!mobile && index % 9 === 2) {
      width += 7;
      height += 8;
      centerX -= 4;
      centerY -= 3;
      rotate = rotationBias * 0.55 + (offsetNoise - 0.5) * 18;
      z += 24;
      frame = "card";
    }

    if (!mobile && index % 11 === 7) {
      width += 5;
      height += 6;
      centerX += 4;
      centerY += 3;
      rotate += rotationBias > 0 ? 8 : -8;
      z += 18;
    }

    if (mobile && index % 6 === 1) {
      width += 6;
      height += 7;
      rotate = rotationBias * 0.6 + (offsetNoise - 0.5) * 12;
      centerX += index % 12 === 1 ? -3 : 3;
      centerY -= 3;
      z += 16;
    }

    if (mobile && index % 8 === 4) {
      width += 4;
      height += 5;
      centerY += 3;
      rotate += rotate > 0 ? 5 : -5;
      z += 10;
    }

    if (row === 0) centerY -= mobile ? 6 : 6;
    if (row === rows - 1) centerY += mobile ? 6 : 6;
    if (col === 0) centerX -= mobile ? 7 : 6;
    if (col === cols - 1) centerX += mobile ? 7 : 6;

    if (edgeNoise > 0.76) centerX += col < cols / 2 ? -(mobile ? 7 : 6) : mobile ? 7 : 6;
    if (edgeNoise < 0.24) centerY += row < rows / 2 ? -(mobile ? 7 : 6) : mobile ? 7 : 6;

    if (index % 5 === 0) rotate *= 1.18;
    if (index % 7 === 3) rotate += mobile ? -5 : -7;
    if (index % 8 === 6) rotate += mobile ? 4 : 6;
    if (Math.abs(rotate) > (mobile ? 11 : 14)) {
      centerX += rotate > 0 ? 2.5 : -2.5;
      centerY += index % 2 === 0 ? -1.8 : 1.8;
    }

    rotate = clamp(rotate, mobile ? -18 : -24, mobile ? 18 : 24);

    const left = centerX - width / 2;
    const top = centerY - height / 2;

    layouts.push({
      top: `${top}%`,
      left: `${left}%`,
      width: `${width}%`,
      height: `${height}%`,
      rotate,
      z,
      frame,
    });
  }

  return layouts;
}

function ProofImage({ item, priority = false, className = "" }) {
  if (item?.product) {
    return (
      <ProductImage
        product={item.product}
        priority={priority}
        lqip={false}
        className={className}
        w={priority ? 1440 : 960}
        q={priority ? 74 : 68}
      />
    );
  }

  return (
    <img
      src={item?.image}
      alt={item?.productName || item?.categoryLabel || "Feedback khach hang"}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}

function PopupProofImage({ item, imageHint }) {
  const raw = String(item?.image || (item?.product ? firstImg(item.product) : "") || "").trim();
  const candidates = useMemo(() => {
    const hinted = String(imageHint?.src || "").trim();
    return [...new Set([hinted, ...candidatesFor(raw, 1600, 0, 74)].filter(Boolean))];
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

function CollageCard({ item, layout, index, hoveredIndex, setHoveredIndex, onOpen, enableHover = true }) {
  const isHovered = enableHover && hoveredIndex === index;
  const isDimmed = enableHover && hoveredIndex !== null && !isHovered;
  const frame = buildFrameClasses(layout.frame);
  const showHover = (nextIndex) => {
    if (enableHover) setHoveredIndex(nextIndex);
  };

  return (
    <button
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
        <ProofImage item={item} className="h-full w-full object-cover" />
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
        <ProofImage item={item} className="h-full w-full object-contain bg-white" />
      </div>
    </div>
  );
}

function Lightbox({ item, imageHint, canNavigate, onClose, onPrev, onNext }) {
  const swipeStartRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (canNavigate && event.key === "ArrowLeft") onPrev();
      if (canNavigate && event.key === "ArrowRight") onNext();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/82 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        data-feedback-lightbox-frame=""
        className="relative inline-block max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] touch-pan-y rounded-[21px] bg-white p-[5px] shadow-[0_30px_80px_rgba(15,23,42,0.45)]"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
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

export default function SocialProofSection({
  entries = [],
  products = [],
  categoryTitleMap = {},
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
    () => buildDisplayItems(sourceEntries, products, categoryTitleMap, { fillWithProducts: runtimeFeedbackEntries.length === 0 }),
    [sourceEntries, products, categoryTitleMap, runtimeFeedbackEntries.length]
  );
  const [hoveredDesktopIndex, setHoveredDesktopIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [selectedPool, setSelectedPool] = useState("desktop");
  const [selectedImageHint, setSelectedImageHint] = useState(null);
  const canHover = useCanHover();

  const desktopItems = useMemo(() => buildCollageItems(items, DESKTOP_CARD_COUNT, visitSeed + 101), [items, visitSeed]);
  const mobileItems = useMemo(() => buildCollageItems(items, MOBILE_CARD_COUNT, visitSeed + 202), [items, visitSeed]);
  const desktopLayouts = useMemo(() => createCollageLayouts(DESKTOP_CARD_COUNT, false, visitSeed + 303), [visitSeed]);
  const mobileLayouts = useMemo(() => createCollageLayouts(MOBILE_CARD_COUNT, true, visitSeed + 404), [visitSeed]);
  const hoveredDesktopItem = hoveredDesktopIndex === null ? null : desktopItems[hoveredDesktopIndex] || null;
  const hoveredDesktopLayout = hoveredDesktopIndex === null ? null : desktopLayouts[hoveredDesktopIndex] || null;
  const selectedItems = selectedPool === "mobile" ? mobileItems : desktopItems;
  const selectedItem = selectedIndex === null ? null : selectedItems[selectedIndex] || null;

  if (!items.length) return null;

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
  const closeLightbox = () => {
    setSelectedIndex(null);
    setSelectedImageHint(null);
  };
  const showPrev = () => {
    setSelectedImageHint(null);
    setSelectedIndex((current) => (current === null ? null : (current - 1 + selectedItems.length) % selectedItems.length));
  };
  const showNext = () => {
    setSelectedImageHint(null);
    setSelectedIndex((current) => (current === null ? null : (current + 1) % selectedItems.length));
  };

  return (
    <section className="max-w-6xl mx-auto px-4 py-6 md:py-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Feedback của khách hàng</h2>
      </div>

      <div className="relative z-0 isolate overflow-hidden rounded-[34px] border border-slate-200/70 bg-[radial-gradient(circle_at_top,#ffffff_0%,#f4fbff_58%,#eef7fb_100%)] px-4 py-5 shadow-[0_18px_48px_rgba(148,163,184,0.08)] sm:px-6 md:px-8 md:py-7">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[-7rem] top-10 h-36 w-36 rounded-full bg-white/70 blur-3xl md:h-52 md:w-52" />
          <div className="absolute right-[-5rem] top-20 h-40 w-40 rounded-full bg-sky-100/60 blur-3xl md:h-56 md:w-56" />
          <div className="absolute bottom-8 left-1/2 h-28 w-[56%] -translate-x-1/2 rounded-full bg-white/80 blur-3xl" />
        </div>

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
