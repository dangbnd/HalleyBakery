import test from "node:test";
import assert from "node:assert/strict";

import {
  createHeroRibbonDeck,
  heroProductKey,
} from "../src/lib/heroRibbon.js";

function makeProducts(category, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${category}-${index + 1}`,
    name: `${category} ${index + 1}`,
    category,
    images: [`https://example.com/${category}-${index + 1}.jpg`],
  }));
}

test("hero ribbon does not repeat category products before its pool is exhausted", () => {
  const products = makeProducts("be-gai", 12);
  const deck = createHeroRibbonDeck(products, {
    seed: "no-repeat",
    cardCount: 5,
    layoutCount: 4,
  });

  const first = deck.next();
  const second = deck.next();
  const third = deck.next();
  const firstIds = new Set(first.items.map((item) => item.id));
  const secondIds = new Set(second.items.map((item) => item.id));
  const firstTenIds = new Set([...firstIds, ...secondIds]);
  const allSeenIds = new Set([
    ...first.items,
    ...second.items,
    ...third.items,
  ].map((item) => item.id));

  assert.equal(first.items.length, 5);
  assert.equal(second.items.length, 5);
  assert.equal([...secondIds].some((id) => firstIds.has(id)), false);
  assert.equal(firstTenIds.size, 10);
  assert.equal(allSeenIds.size, 12);
});

test("hero ribbon rotates eligible categories without consecutive repeats", () => {
  const products = [
    ...makeProducts("be-gai", 6),
    ...makeProducts("be-trai", 6),
    ...makeProducts("basic", 6),
  ];
  const deck = createHeroRibbonDeck(products, {
    seed: "category-rotation",
    cardCount: 5,
    layoutCount: 4,
  });
  const scenes = Array.from({ length: 9 }, () => deck.next());

  scenes.forEach((scene) => {
    assert.equal(scene.items.length, 5);
    assert.equal(new Set(scene.items.map((item) => heroProductKey(item.product))).size, 5);
  });
  for (let index = 1; index < scenes.length; index += 1) {
    assert.notEqual(scenes[index].category, scenes[index - 1].category);
  }
});

test("hero ribbon ignores products without images", () => {
  const products = [
    ...makeProducts("basic", 5),
    { id: "missing-image", name: "Missing image", category: "basic" },
  ];
  const scene = createHeroRibbonDeck(products, {
    seed: "missing-image",
    cardCount: 5,
  }).next();

  assert.equal(scene.items.length, 5);
  assert.equal(scene.items.some((item) => item.id === "missing-image"), false);
});
