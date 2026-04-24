import { readLS, removeLS, writeLS } from "../utils.js";
import { queueTelemetryEvent } from "../services/telemetry.js";
import { firstImg } from "./img.js";
import { pidOf } from "./pid.js";

export const CUSTOMER_EVENT_KEY = "hb_customer_events_v1";
export const CUSTOMER_FAVORITES_KEY = "hb_favorite_products_v1";
export const CUSTOMER_RECENTS_KEY = "hb_recent_products_v1";
export const CUSTOMER_CONSULT_LEADS_KEY = "hb_consult_leads_v1";
export const CUSTOMER_BEHAVIOR_EVENT = "hb:customer-behavior-changed";

const MAX_EVENTS = 2000;
const MAX_RECENTS = 32;
const MAX_LEADS = 500;

const uid = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

const emitChanged = () => {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CUSTOMER_BEHAVIOR_EVENT));
  } catch {}
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return String(value)
    .split(/[\n,|;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
};

const minPriceOf = (product = {}) => {
  const vals = [];
  if (Array.isArray(product?.pricing?.table)) {
    for (const row of product.pricing.table) {
      const n = Number(row?.price);
      if (Number.isFinite(n) && n > 0) vals.push(n);
    }
  }
  if (product?.priceBySize && typeof product.priceBySize === "object") {
    for (const value of Object.values(product.priceBySize)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) vals.push(n);
    }
  }
  const base = Number(product?.price);
  if (Number.isFinite(base) && base > 0) vals.push(base);
  return vals.length ? Math.min(...vals) : "";
};

export function productSnapshot(product = {}) {
  if (!product || typeof product !== "object") return null;
  const pid = pidOf(product);
  if (!pid) return null;
  return {
    pid,
    id: product.id ?? "",
    name: String(product.name || product.title || pid).trim(),
    category: String(product.category || "").trim(),
    tags: toArray(product.tags),
    image: firstImg(product),
    price: minPriceOf(product),
  };
}

export function readCustomerEvents() {
  const list = readLS(CUSTOMER_EVENT_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function recordCustomerEvent(type, payload = {}) {
  const eventType = String(type || "").trim();
  if (!eventType) return null;

  const entry = {
    id: uid(),
    ts: Date.now(),
    type: eventType,
    source: String(payload.source || "").trim(),
  };

  const snap = productSnapshot(payload.product);
  if (snap) entry.product = snap;

  ["query", "tag", "category", "channel", "href", "status", "message", "value", "route", "page_type", "content_group", "section", "list_id", "list_name", "search_mode"].forEach((key) => {
    const value = payload[key];
    if (value == null) return;
    const text = String(value).trim();
    if (text) entry[key] = text;
  });

  ["list_position", "results_count"].forEach((key) => {
    const value = Number(payload[key]);
    if (Number.isFinite(value)) entry[key] = value;
  });

  if (typeof payload.zero_results === "boolean") entry.zero_results = payload.zero_results;

  if (payload.meta && typeof payload.meta === "object") entry.meta = payload.meta;

  const list = readCustomerEvents();
  list.unshift(entry);
  writeLS(CUSTOMER_EVENT_KEY, list.slice(0, MAX_EVENTS));
  queueTelemetryEvent(entry.type, entry);
  emitChanged();
  return entry;
}

export function getFavoriteIds() {
  const list = readLS(CUSTOMER_FAVORITES_KEY, []);
  if (!Array.isArray(list)) return [];
  return list.map((x) => (typeof x === "string" ? x : x?.pid)).filter(Boolean);
}

export function isFavoriteProduct(productOrPid) {
  const pid = typeof productOrPid === "string" ? productOrPid : pidOf(productOrPid || {});
  if (!pid) return false;
  return getFavoriteIds().includes(pid);
}

export function toggleFavoriteProduct(product = {}) {
  const snap = productSnapshot(product);
  if (!snap) return { active: false, ids: getFavoriteIds() };

  const current = readLS(CUSTOMER_FAVORITES_KEY, []);
  const list = (Array.isArray(current) ? current : [])
    .map((item) => (typeof item === "string" ? { pid: item } : item))
    .filter((item) => item?.pid);

  const exists = list.some((item) => item.pid === snap.pid);
  const next = exists
    ? list.filter((item) => item.pid !== snap.pid)
    : [{ ...snap, savedAt: Date.now() }, ...list.filter((item) => item.pid !== snap.pid)];

  writeLS(CUSTOMER_FAVORITES_KEY, next);
  emitChanged();
  return { active: !exists, ids: next.map((item) => item.pid), product: snap };
}

export function getFavoriteProducts(products = []) {
  const catalog = new Map((products || []).map((p) => [pidOf(p), p]));
  const stored = readLS(CUSTOMER_FAVORITES_KEY, []);
  return (Array.isArray(stored) ? stored : [])
    .map((item) => {
      const pid = typeof item === "string" ? item : item?.pid;
      return catalog.get(pid) || item;
    })
    .filter(Boolean);
}

export function addRecentProduct(product = {}) {
  const snap = productSnapshot(product);
  if (!snap) return [];
  const current = readLS(CUSTOMER_RECENTS_KEY, []);
  const list = (Array.isArray(current) ? current : []).filter((item) => item?.pid !== snap.pid);
  const next = [{ ...snap, viewedAt: Date.now() }, ...list].slice(0, MAX_RECENTS);
  writeLS(CUSTOMER_RECENTS_KEY, next);
  emitChanged();
  return next;
}

export function getRecentProducts(products = []) {
  const catalog = new Map((products || []).map((p) => [pidOf(p), p]));
  const stored = readLS(CUSTOMER_RECENTS_KEY, []);
  return (Array.isArray(stored) ? stored : [])
    .map((item) => catalog.get(item?.pid) || item)
    .filter(Boolean);
}

export function saveConsultLead(lead = {}) {
  const entry = { id: lead.id || uid(), ts: lead.ts || Date.now(), ...lead };
  const list = readLS(CUSTOMER_CONSULT_LEADS_KEY, []);
  const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, MAX_LEADS);
  writeLS(CUSTOMER_CONSULT_LEADS_KEY, next);
  emitChanged();
  return entry;
}

export function readConsultLeads() {
  const list = readLS(CUSTOMER_CONSULT_LEADS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function clearCustomerBehavior() {
  removeLS(CUSTOMER_EVENT_KEY);
  removeLS(CUSTOMER_FAVORITES_KEY);
  removeLS(CUSTOMER_RECENTS_KEY);
  removeLS(CUSTOMER_CONSULT_LEADS_KEY);
  emitChanged();
}

function bumpCounter(map, key, label = key, amount = 1) {
  const clean = String(key || "").trim();
  if (!clean) return;
  const cur = map.get(clean) || { key: clean, label: String(label || clean), count: 0 };
  cur.count += amount;
  map.set(clean, cur);
}

function productStat(map, snap) {
  if (!snap?.pid) return null;
  const cur = map.get(snap.pid) || {
    pid: snap.pid,
    name: snap.name || snap.pid,
    category: snap.category || "",
    image: snap.image || "",
    detail: 0,
    messenger: 0,
    favorite: 0,
    consult: 0,
    total: 0,
    score: 0,
  };
  if (snap.name) cur.name = snap.name;
  if (snap.category) cur.category = snap.category;
  if (snap.image) cur.image = snap.image;
  map.set(snap.pid, cur);
  return cur;
}

export function summarizeCustomerBehavior(products = [], source = {}) {
  const events = Array.isArray(source.events) ? source.events : readCustomerEvents();
  const leads = Array.isArray(source.leads) ? source.leads : readConsultLeads();
  const catalog = new Map((products || []).map((p) => [pidOf(p), productSnapshot(p)]));
  const byProduct = new Map();
  const searches = new Map();
  const tags = new Map();
  const categories = new Map();

  const totals = {
    events: events.length,
    pageViews: 0,
    sessions: 0,
    clicks: 0,
    details: 0,
    messenger: 0,
    searches: 0,
    favorites: getFavoriteIds().length,
    consults: leads.length,
    errors: 0,
    resourceErrors: 0,
  };

  for (const event of events) {
    if (event.type === "page_view") totals.pageViews += 1;
    if (event.type === "session_start") totals.sessions += 1;
    if (event.type === "ui_click") totals.clicks += 1;
    if (event.type === "js_error" || event.type === "react_error" || event.type === "unhandled_rejection") totals.errors += 1;
    if (event.type === "resource_error") {
      totals.errors += 1;
      totals.resourceErrors += 1;
    }

    const snap = event.product?.pid ? { ...(catalog.get(event.product.pid) || {}), ...event.product } : null;
    if (event.query && (event.type === "search_submit" || event.type === "search_query")) {
      totals.searches += 1;
      bumpCounter(searches, event.query.toLowerCase(), event.query);
    }
    if (event.tag) bumpCounter(tags, event.tag.toLowerCase(), event.tag);
    if (event.category) bumpCounter(categories, event.category, event.category);

    if (!snap?.pid) continue;
    const stat = productStat(byProduct, snap);
    if (!stat) continue;

    stat.total += 1;
    if (event.type === "detail_open") {
      stat.detail += 1;
      totals.details += 1;
    } else if (event.type === "messenger_click") {
      stat.messenger += 1;
      totals.messenger += 1;
    } else if (event.type === "favorite_add") {
      stat.favorite += 1;
    } else if (event.type === "consult_submit") {
      stat.consult += 1;
    }

    if (snap.category) bumpCounter(categories, snap.category, snap.category);
    for (const tag of snap.tags || []) bumpCounter(tags, String(tag).toLowerCase(), tag);
  }

  for (const stat of byProduct.values()) {
    stat.score = stat.detail * 2 + stat.messenger * 4 + stat.favorite * 2 + stat.consult * 5 + stat.total;
  }

  const byCount = (a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), "vi");
  const productSort = (a, b) => b.score - a.score || b.messenger - a.messenger || b.detail - a.detail;

  return {
    totals,
    topProducts: [...byProduct.values()].sort(productSort),
    topSearches: [...searches.values()].sort(byCount),
    topTags: [...tags.values()].sort(byCount),
    topCategories: [...categories.values()].sort(byCount),
    recentEvents: events.slice(0, 50),
    recentLeads: leads.slice(0, 50),
  };
}
