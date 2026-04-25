import { readLS, removeLS, writeLS } from "../utils.js";
import { isTrackingSuppressed, queueTelemetryEvent } from "../services/telemetry.js";
import { firstImg } from "./img.js";
import { pidOf } from "./pid.js";

export const CUSTOMER_EVENT_KEY = "hb_customer_events_v1";
export const CUSTOMER_FAVORITES_KEY = "hb_favorite_products_v1";
export const CUSTOMER_RECENTS_KEY = "hb_recent_products_v1";
export const CUSTOMER_CONSULT_LEADS_KEY = "hb_consult_leads_v1";
export const CUSTOMER_BEHAVIOR_EVENT = "hb:customer-behavior-changed";
export const BUSINESS_EVENT_TYPES = new Set([
  "search_submit",
  "detail_open",
  "messenger_click",
  "contact_entry_click",
  "consult_submit",
  "category_click",
  "tag_click",
  "search_suggestion_click",
  "favorite_add",
  "favorites_page_open",
  "size_select",
  "consult_form_open",
  "consult_form_start",
  "share_copy",
]);

export const ERROR_EVENT_TYPES = new Set();

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

export function timestampOf(value, fallback = Date.now()) {
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

export function isBusinessEvent(event = {}) {
  return BUSINESS_EVENT_TYPES.has(String(event?.type || "").trim());
}

export function isErrorEvent(event = {}) {
  return ERROR_EVENT_TYPES.has(String(event?.type || "").trim());
}

export function filterBusinessEvents(events = []) {
  return (Array.isArray(events) ? events : []).filter(isBusinessEvent);
}

export function filterReportEvents(events = []) {
  return (Array.isArray(events) ? events : []).filter((event) => isBusinessEvent(event) || isErrorEvent(event));
}

export function recordCustomerEvent(type, payload = {}) {
  if (isTrackingSuppressed()) return null;

  const eventType = String(type || "").trim();
  if (!eventType) return null;
  if (!BUSINESS_EVENT_TYPES.has(eventType)) return null;

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
  const entry = { id: lead.id || uid(), ...lead, ts: timestampOf(lead.ts || Date.now()) };
  const list = readLS(CUSTOMER_CONSULT_LEADS_KEY, []);
  const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, MAX_LEADS);
  writeLS(CUSTOMER_CONSULT_LEADS_KEY, next);
  emitChanged();
  return entry;
}

export function readConsultLeads() {
  const list = readLS(CUSTOMER_CONSULT_LEADS_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .map((lead) => ({ ...lead, ts: timestampOf(lead?.ts || lead?.created_at || lead?.timestamp, 0) }))
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
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

function bumpOnce(map, seen, key, label = key, amount = 1) {
  const clean = String(key || "").trim();
  if (!clean || Number(amount || 0) <= 0 || seen.has(clean)) return;
  seen.add(clean);
  bumpCounter(map, clean, label, amount);
}

function tagList(value) {
  return Array.isArray(value) ? value : toArray(value);
}

function demandSignalWeight(type = "") {
  switch (String(type || "").trim()) {
    case "consult_submit":
      return 10;
    case "messenger_click":
    case "contact_entry_click":
      return 7;
    case "detail_open":
      return 4;
    case "search_submit":
    case "search_zero_result":
      return 3;
    case "category_click":
    case "tag_click":
    case "category_results_view":
      return 2;
    default:
      return 0;
  }
}

function productStat(map, snap) {
  if (!snap?.pid) return null;
  const cur = map.get(snap.pid) || {
    pid: snap.pid,
    name: snap.name || snap.pid,
    category: snap.category || "",
    image: snap.image || "",
    impression: 0,
    detail: 0,
    messenger: 0,
    favorite: 0,
    consult: 0,
    total: 0,
    detailRate: 0,
    contactRate: 0,
    leadRate: 0,
    score: 0,
  };
  if (snap.name) cur.name = snap.name;
  if (snap.category) cur.category = snap.category;
  if (snap.image) cur.image = snap.image;
  map.set(snap.pid, cur);
  return cur;
}

export function summarizeCustomerBehavior(products = [], source = {}) {
  const rawEvents = Array.isArray(source.events) ? source.events : readCustomerEvents();
  const events = filterBusinessEvents(rawEvents);
  const errorEvents = (Array.isArray(rawEvents) ? rawEvents : []).filter(isErrorEvent);
  const rawLeads = Array.isArray(source.leads) ? source.leads : readConsultLeads();
  const leads = rawLeads
    .map((lead) => ({ ...lead, ts: timestampOf(lead?.ts || lead?.created_at || lead?.timestamp, 0) }))
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  const catalog = new Map((products || []).map((p) => [pidOf(p), productSnapshot(p)]));
  const byProduct = new Map();
  const searches = new Map();
  const zeroSearches = new Map();
  const tags = new Map();
  const categories = new Map();

  const totals = {
    events: events.length,
    pageViews: 0,
    sessions: 0,
    impressions: 0,
    details: 0,
    messenger: 0,
    contactEntries: 0,
    searches: 0,
    searchSubmits: 0,
    searchResultViews: 0,
    zeroResultSearches: 0,
    categoryResultViews: 0,
    categoryClicks: 0,
    tagClicks: 0,
    consultSubmits: 0,
    favorites: getFavoriteIds().length,
    consults: leads.length,
    errors: errorEvents.length,
  };

  for (const event of events) {
    if (event.type === "page_view") totals.pageViews += 1;
    if (event.type === "session_start") totals.sessions += 1;
    if (event.type === "product_impression") totals.impressions += 1;
    if (event.type === "detail_open") totals.details += 1;
    if (event.type === "messenger_click" || event.type === "contact_entry_click") totals.messenger += 1;
    if (event.type === "contact_entry_click") totals.contactEntries += 1;
    if (event.type === "consult_submit") totals.consultSubmits += 1;
    if (event.type === "category_results_view") totals.categoryResultViews += 1;
    if (event.type === "category_click") totals.categoryClicks += 1;
    if (event.type === "tag_click") totals.tagClicks += 1;
    if (event.type === "search_zero_result") {
      totals.zeroResultSearches += 1;
      if (event.query) bumpCounter(zeroSearches, event.query.toLowerCase(), event.query);
    }
    if (event.type === "search_results_view") totals.searchResultViews += 1;
    if (event.type === "search_submit") {
      totals.searchSubmits += 1;
      if (event.query) {
        totals.searches += 1;
        bumpCounter(searches, event.query.toLowerCase(), event.query);
      }
    }

    const snap = event.product?.pid ? { ...(catalog.get(event.product.pid) || {}), ...event.product } : null;
    const demandWeight = demandSignalWeight(event.type);
    const categorySeen = new Set();
    const tagSeen = new Set();
    if (event.tag) bumpOnce(tags, tagSeen, event.tag.toLowerCase(), event.tag, demandWeight);
    if (event.category) bumpOnce(categories, categorySeen, event.category, event.category, demandWeight);

    if (!snap?.pid) continue;
    const stat = productStat(byProduct, snap);
    if (!stat) continue;

    stat.total += 1;
    if (event.type === "product_impression") {
      stat.impression += 1;
    } else if (event.type === "detail_open") {
      stat.detail += 1;
    } else if (event.type === "messenger_click" || event.type === "contact_entry_click") {
      stat.messenger += 1;
    }

    if (snap.category) bumpOnce(categories, categorySeen, snap.category, snap.category, demandWeight);
    for (const tag of tagList(snap.tags)) bumpOnce(tags, tagSeen, String(tag).toLowerCase(), tag, demandWeight);
  }

  for (const lead of leads) {
    const product = lead.product && typeof lead.product === "object"
      ? lead.product
      : {
          pid: lead.product_pid,
          id: lead.product_id,
          name: lead.product_name,
          category: lead.category,
          tags: lead.tags,
        };
    const snap = product?.pid || product?.id || product?.name
      ? { ...(catalog.get(product.pid) || {}), ...productSnapshot(product), ...product }
      : null;
    if (!snap?.pid) continue;
    const stat = productStat(byProduct, snap);
    if (stat) stat.consult += 1;
    const categorySeen = new Set();
    const tagSeen = new Set();
    if (snap.category) bumpOnce(categories, categorySeen, snap.category, snap.category, demandSignalWeight("consult_submit"));
    for (const tag of tagList(snap.tags)) bumpOnce(tags, tagSeen, String(tag).toLowerCase(), tag, demandSignalWeight("consult_submit"));
  }

  for (const stat of byProduct.values()) {
    stat.detailRate = stat.impression ? stat.detail / stat.impression : 0;
    stat.contactRate = stat.detail ? stat.messenger / stat.detail : 0;
    stat.leadRate = stat.messenger ? stat.consult / stat.messenger : 0;
    stat.score =
      stat.detail * 3 +
      stat.messenger * 6 +
      stat.consult * 10 +
      stat.favorite * 2 +
      Math.min(stat.impression, stat.detail);
  }

  const byCount = (a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), "vi");
  const productSort = (a, b) =>
    b.score - a.score ||
    b.consult - a.consult ||
    b.messenger - a.messenger ||
    b.detail - a.detail;

  const recentEventTypes = new Set([
    "search_submit",
    "search_results_view",
    "detail_open",
    "messenger_click",
    "contact_entry_click",
    "consult_submit",
    "search_zero_result",
    "category_click",
    "tag_click",
  ]);

  return {
    totals,
    topProducts: [...byProduct.values()].sort(productSort),
    topSearches: [...searches.values()].sort(byCount),
    topZeroSearches: [...zeroSearches.values()].sort(byCount),
    topTags: [...tags.values()].sort(byCount),
    topCategories: [...categories.values()].sort(byCount),
    recentEvents: events.filter((event) => recentEventTypes.has(event.type)).slice(0, 50),
    recentLeads: leads.slice(0, 50),
  };
}
