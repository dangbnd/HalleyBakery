// encode App state -> query string
export function encodeState({ route, q, cat, filters }) {
  const p = new URLSearchParams();
  if (route && route !== "home") p.set("view", route);     // home|search|pageKey|categoryKey
  if (cat && cat !== "all") p.set("cat", cat);
  if (q?.trim()) p.set("q", q.trim());

  const f = filters || {};
  if (f.priceActive && Array.isArray(f.price)) {
    const [a = 0, b = 0] = f.price;
    p.set("price", `${a}-${b}`);
  }
  const addSet = (k, s) => s?.size && p.set(k, [...s].join(","));
  addSet("tags", f.tags);
  addSet("sizes", f.sizes);
  addSet("lvls", f.levels);
  if (f.featured) p.set("feat", "1");
  if (f.inStock) p.set("stock", "1");
  if (f.sort) p.set("sort", f.sort);

  return p.toString();
}

// decode query string -> App state (partial)
export function decodeState(search) {
  const p = new URLSearchParams(search);
  const pickSet = (k) => new Set((p.get(k) || "").split(",").filter(Boolean));

  // Chỉ tạo filter object nếu URL thực sự có tham số lọc
  const hasFilterParams = p.has("price") || p.has("tags") || p.has("sizes") ||
    p.has("lvls") || p.has("feat") || p.has("stock") || p.has("sort");

  let filters = null;
  if (hasFilterParams) {
    filters = {
      price: [0, 0],
      priceActive: false,
      tags: pickSet("tags"),
      sizes: pickSet("sizes"),
      levels: pickSet("lvls"),
      featured: p.get("feat") === "1",
      inStock: p.get("stock") === "1",
      sort: p.get("sort") || "",
    };
    if (p.get("price")) {
      const [a, b] = p.get("price").split("-").map((n) => Number(n) || 0);
      filters.price = [a, b];
      filters.priceActive = true;
    }
  }

  return {
    view: p.get("view") || null,
    q: p.get("q") || "",
    cat: p.get("cat") || "all",
    filters,
  };
}
