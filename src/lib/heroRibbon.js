import { firstImg } from "../utils/img.js";

export const HERO_RIBBON_CARD_COUNT = 5;

function hashString(value = "") {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed = "") {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list = [], random = Math.random) {
  const output = [...list];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

export function heroProductKey(product = {}) {
  return String(
    product.id ||
    product.pid ||
    product.sku ||
    `${product.category || "uncategorized"}:${product.name || firstImg(product)}`
  );
}

function buildPools(products = [], cardCount = HERO_RIBBON_CARD_COUNT) {
  const groups = new Map();
  const seen = new Set();

  for (const product of products) {
    const image = firstImg(product);
    const key = heroProductKey(product);
    if (!image || !key || seen.has(key)) continue;
    seen.add(key);
    const category = String(product.category || "uncategorized").trim() || "uncategorized";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  }

  const eligible = [...groups.entries()].filter(([, items]) => items.length >= cardCount);
  if (eligible.length) return eligible;

  const fallback = [...groups.values()].flat();
  return fallback.length ? [["all", fallback]] : [];
}

function freshCycle(pool, random, avoid = new Set()) {
  const shuffled = shuffle(pool, random);
  if (!avoid.size) return shuffled;
  return [
    ...shuffled.filter((product) => !avoid.has(heroProductKey(product))),
    ...shuffled.filter((product) => avoid.has(heroProductKey(product))),
  ];
}

export function createHeroRibbonDeck(
  products = [],
  {
    seed = `${Date.now()}`,
    cardCount = HERO_RIBBON_CARD_COUNT,
    layoutCount = 1,
  } = {}
) {
  const random = seededRandom(seed);
  const pools = buildPools(products, cardCount);
  const states = new Map(
    pools.map(([category, items]) => [
      category,
      {
        source: [...items],
        deck: freshCycle(items, random),
        cursor: 0,
      },
    ])
  );
  const categories = pools.map(([category]) => category);
  let categoryOrder = shuffle(categories, random);
  let categoryCursor = 0;
  let previousCategory = "";
  let previousLayout = -1;
  let sceneNumber = 0;

  function nextCategory() {
    if (!categoryOrder.length) return "";
    if (categoryCursor >= categoryOrder.length) {
      categoryOrder = shuffle(categories, random);
      if (
        categoryOrder.length > 1 &&
        categoryOrder[0] === previousCategory
      ) {
        [categoryOrder[0], categoryOrder[1]] = [categoryOrder[1], categoryOrder[0]];
      }
      categoryCursor = 0;
    }
    const category = categoryOrder[categoryCursor];
    categoryCursor += 1;
    previousCategory = category;
    return category;
  }

  function drawProducts(state) {
    const selected = [];
    const selectedKeys = new Set();
    const targetCount = Math.min(cardCount, state.source.length);

    while (selected.length < targetCount) {
      if (state.cursor >= state.deck.length) {
        state.deck = freshCycle(state.source, random, selectedKeys);
        state.cursor = 0;
      }
      const product = state.deck[state.cursor];
      state.cursor += 1;
      const key = heroProductKey(product);
      if (selectedKeys.has(key)) continue;
      selected.push(product);
      selectedKeys.add(key);
    }
    return selected;
  }

  function nextLayout() {
    const count = Math.max(1, Number(layoutCount) || 1);
    if (count === 1) return 0;
    let layout = Math.floor(random() * count);
    if (layout === previousLayout) layout = (layout + 1) % count;
    previousLayout = layout;
    return layout;
  }

  return {
    size: categories.length,
    next() {
      const category = nextCategory();
      const state = states.get(category);
      if (!state) return null;
      const items = drawProducts(state);
      if (!items.length) return null;
      sceneNumber += 1;
      return {
        id: `${seed}:${sceneNumber}:${category}`,
        category,
        layout: nextLayout(),
        items: items.map((product) => ({
          id: heroProductKey(product),
          raw: firstImg(product),
          product,
        })),
      };
    },
  };
}
