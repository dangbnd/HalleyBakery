import { KEYS, getConfig } from "../utils/config.js";
import { parseBooleanLike } from "../utils.js";
import { ensureAttributionContext, getAttributionContext } from "./attribution.js";

const VISITOR_ID_KEY = "hb_visitor_id_v1";
const SESSION_ID_KEY = "hb_session_id_v1";
const SESSION_STARTED_KEY = "hb_session_started_at_v1";
export const TRACKING_OPT_OUT_KEY = "hb_tracking_opt_out_v1";
const QUEUE_LIMIT = 120;
const BATCH_LIMIT = 40;
const FLUSH_DELAY_MS = 1600;
const RECENT_DEDUPE_LIMIT = 240;
const PRODUCT_IMPRESSION_RATE_LIMIT = { windowMs: 60000, max: 24 };
const EVENT_RATE_LIMITS = {
  product_impression: PRODUCT_IMPRESSION_RATE_LIMIT,
  category_results_view: { windowMs: 60000, max: 10 },
  search_results_view: { windowMs: 60000, max: 10 },
  search_zero_result: { windowMs: 60000, max: 10 },
  detail_open: { windowMs: 60000, max: 30 },
};
const EVENT_DEDUPE_TTL_MS = {
  product_impression: 6 * 60 * 60 * 1000,
  category_results_view: 2 * 60 * 1000,
  search_results_view: 45 * 1000,
  search_zero_result: 45 * 1000,
  detail_open: 3500,
};
const GPS_LOCATION_CACHE_KEY = "hb_tracking_gps_location_v1";
const GPS_LOCATION_STATUS_KEY = "hb_tracking_gps_status_v1";
const GPS_LOCATION_REQUESTED_SESSION_KEY = "hb_tracking_gps_requested_session_v1";
const GPS_LOCATION_CACHE_TTL_MS = 30 * 60 * 1000;

let queue = [];
let flushTimer = 0;
let flushing = false;
let initialized = false;
let cleanupFns = [];
let lastPageKey = "";
const recentEventKeys = new Map();
const rateBuckets = new Map();
let gpsContext = {};
let gpsRequestStarted = false;
let gpsLocationEventQueued = false;

const IMPORTANT_EVENT_TYPES = new Set([
  "session_start",
  "page_view",
  "search_submit",
  "search_results_view",
  "search_zero_result",
  "category_results_view",
  "detail_open",
  "product_impression",
  "messenger_click",
  "contact_entry_click",
  "consult_submit",
  "category_click",
  "tag_click",
]);

function s(value) {
  return value == null ? "" : String(value).trim();
}

function clip(value = "", max = 500) {
  const text = s(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function uid(prefix = "id") {
  try {
    if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  } catch {}
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readStorage(storage, key, fallback = "") {
  try {
    return storage?.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {}
}

function readCookie(key) {
  if (typeof document === "undefined") return "";
  try {
    const prefix = `${encodeURIComponent(key)}=`;
    const item = String(document.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  } catch {
    return "";
  }
}

function writeCookie(key, value, maxAge = 31536000) {
  if (typeof document === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const host = String(window.location.hostname || "").toLowerCase();
    const domain = host === "halleybakery.io.vn" || host.endsWith(".halleybakery.io.vn")
      ? "; Domain=.halleybakery.io.vn"
      : "";
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}${domain}`;
  } catch {}
}

function clearCookie(key) {
  writeCookie(key, "", 0);
}

function truthy(value = "") {
  return ["1", "true", "yes", "y", "on", "staff"].includes(String(value || "").trim().toLowerCase());
}

function falsy(value = "") {
  return ["0", "false", "no", "n", "off", "customer"].includes(String(value || "").trim().toLowerCase());
}

export function syncTrackingOptOutFromUrl() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const staff = params.get("hb_staff") ?? params.get("staff") ?? params.get("staff_mode");
    const tracking = params.get("tracking");

    if (truthy(staff) || String(tracking || "").trim().toLowerCase() === "off") {
      writeStorage(window.localStorage, TRACKING_OPT_OUT_KEY, "1");
      writeCookie(TRACKING_OPT_OUT_KEY, "1");
      queue = [];
      if (flushTimer) {
        window.clearTimeout(flushTimer);
        flushTimer = 0;
      }
      return true;
    }
    if (falsy(staff) || String(tracking || "").trim().toLowerCase() === "on") {
      window.localStorage?.removeItem(TRACKING_OPT_OUT_KEY);
      clearCookie(TRACKING_OPT_OUT_KEY);
      return false;
    }
  } catch {}
  return readStorage(window.localStorage, TRACKING_OPT_OUT_KEY) === "1" || readCookie(TRACKING_OPT_OUT_KEY) === "1";
}

export function isTrackingOptedOut() {
  if (typeof window === "undefined") return false;
  return syncTrackingOptOutFromUrl();
}

export function isAdminRuntime() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host.startsWith("admin.") || window.location.pathname.startsWith("/admin") || window.location.hash === "#admin";
}

export function isTelemetryEnabled() {
  const raw = getConfig(KEYS.ENABLE_VISITOR_TRACKING, "true");
  return parseBooleanLike(raw, true);
}

export function isTrackingSuppressed() {
  return isAdminRuntime() || !isTelemetryEnabled() || isTrackingOptedOut();
}

function getWebAppUrl() {
  return s(getConfig(KEYS.GS_WEBAPP_URL, ""));
}

function getVisitorId() {
  if (typeof window === "undefined") return "";
  let id = readStorage(window.localStorage, VISITOR_ID_KEY);
  if (!id) {
    id = uid("v");
    writeStorage(window.localStorage, VISITOR_ID_KEY, id);
  }
  return id;
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  let id = readStorage(window.sessionStorage, SESSION_ID_KEY);
  if (!id) {
    id = uid("s");
    writeStorage(window.sessionStorage, SESSION_ID_KEY, id);
    writeStorage(window.sessionStorage, SESSION_STARTED_KEY, String(Date.now()));
  }
  return id;
}

function connectionLabel() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return "";
    return [c.effectiveType, c.downlink ? `${c.downlink}mbps` : "", c.saveData ? "saveData" : ""].filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

function screenLabel() {
  try {
    return `${window.screen?.width || 0}x${window.screen?.height || 0}@${window.devicePixelRatio || 1}`;
  } catch {
    return "";
  }
}

function viewportLabel() {
  try {
    return `${window.innerWidth || 0}x${window.innerHeight || 0}`;
  } catch {
    return "";
  }
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function roundCoord(value) {
  const n = finiteNumber(value);
  return n === "" ? "" : Number(n.toFixed(6));
}

function fillMissing(value, fallback) {
  return value == null || value === "" ? fallback : value;
}

function hasGpsCoords(ctx = {}) {
  return ctx.gps_latitude !== "" && ctx.gps_latitude != null && ctx.gps_longitude !== "" && ctx.gps_longitude != null;
}

function normalizeGpsContext(ctx = {}) {
  const next = {
    gps_latitude: roundCoord(ctx.gps_latitude ?? ctx.latitude ?? ctx.lat),
    gps_longitude: roundCoord(ctx.gps_longitude ?? ctx.longitude ?? ctx.lng ?? ctx.lon),
    gps_accuracy_m: finiteNumber(ctx.gps_accuracy_m ?? ctx.accuracy ?? ctx.accuracy_m),
    location_source: clip(ctx.location_source || "browser_gps", 80),
  };
  if (next.gps_accuracy_m !== "") next.gps_accuracy_m = Math.round(next.gps_accuracy_m);
  return hasGpsCoords(next) ? next : {};
}

function setGpsContext(ctx = {}) {
  const next = normalizeGpsContext(ctx);
  if (!hasGpsCoords(next)) return false;

  gpsContext = next;
  queue = queue.map((event) => ({
    ...event,
    gps_latitude: fillMissing(event.gps_latitude, next.gps_latitude),
    gps_longitude: fillMissing(event.gps_longitude, next.gps_longitude),
    gps_accuracy_m: fillMissing(event.gps_accuracy_m, next.gps_accuracy_m),
    location_source: fillMissing(event.location_source, next.location_source),
  }));
  return true;
}

function readCachedGpsContext() {
  if (typeof window === "undefined") return {};
  try {
    const raw = readStorage(window.localStorage, GPS_LOCATION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.at || 0) > GPS_LOCATION_CACHE_TTL_MS) return {};
    return normalizeGpsContext(parsed.context || parsed);
  } catch {
    return {};
  }
}

function writeCachedGpsContext(ctx = {}) {
  if (typeof window === "undefined" || !hasGpsCoords(ctx)) return;
  try {
    writeStorage(window.localStorage, GPS_LOCATION_CACHE_KEY, JSON.stringify({ at: Date.now(), context: ctx }));
  } catch {}
}

function hydrateGpsContextFromCache() {
  const cached = readCachedGpsContext();
  return setGpsContext(cached);
}

function secureGeolocationAllowed() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return window.isSecureContext || host === "localhost" || host === "127.0.0.1";
}

async function geolocationPermissionState() {
  try {
    if (!navigator.permissions?.query) return "";
    const status = await navigator.permissions.query({ name: "geolocation" });
    return String(status?.state || "");
  } catch {
    return "";
  }
}

function getBrowserGpsPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: GPS_LOCATION_CACHE_TTL_MS,
    });
  });
}

function gpsContextFromPosition(position) {
  const coords = position?.coords || {};
  return normalizeGpsContext({
    gps_latitude: coords.latitude,
    gps_longitude: coords.longitude,
    gps_accuracy_m: coords.accuracy,
    location_source: "browser_gps",
  });
}

function queueGpsLocationEvent(ctx = {}) {
  if (gpsLocationEventQueued || !hasGpsCoords(ctx)) return;
  gpsLocationEventQueued = true;
  queueTelemetryEvent("page_view", {
    source: "browser_gps",
    page_type: "location_permission",
    content_group: "location",
    section: "browser_gps",
    gps_latitude: ctx.gps_latitude,
    gps_longitude: ctx.gps_longitude,
    gps_accuracy_m: ctx.gps_accuracy_m,
    location_source: ctx.location_source,
    meta: {
      location_permission: "granted",
      gps_accuracy_m: ctx.gps_accuracy_m,
    },
  });
  flushTelemetry();
}

async function requestBrowserGpsLocation() {
  if (typeof window === "undefined" || gpsRequestStarted || isTrackingSuppressed()) return;
  if (!navigator.geolocation || !secureGeolocationAllowed()) return;

  const sessionId = getSessionId();
  if (readStorage(window.sessionStorage, GPS_LOCATION_REQUESTED_SESSION_KEY) === sessionId) return;
  if (hasGpsCoords(gpsContext) || hydrateGpsContextFromCache()) return;

  const storedStatus = readStorage(window.localStorage, GPS_LOCATION_STATUS_KEY);
  const permission = await geolocationPermissionState();
  if (permission === "denied" || (!permission && storedStatus === "denied")) return;

  writeStorage(window.sessionStorage, GPS_LOCATION_REQUESTED_SESSION_KEY, sessionId);
  gpsRequestStarted = true;

  try {
    const position = await getBrowserGpsPosition();
    const ctx = gpsContextFromPosition(position);
    if (setGpsContext(ctx)) {
      writeStorage(window.localStorage, GPS_LOCATION_STATUS_KEY, "granted");
      writeCachedGpsContext(ctx);
      queueGpsLocationEvent(ctx);
    }
  } catch (error) {
    if (Number(error?.code) === 1) {
      writeStorage(window.localStorage, GPS_LOCATION_STATUS_KEY, "denied");
    }
  } finally {
    gpsRequestStarted = false;
  }
}

function commonContext() {
  if (typeof window === "undefined") return {};
  return {
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    page_url: window.location.href,
    page_title: document.title || "",
    referrer: document.referrer || "",
    visibility: document.visibilityState || "",
    user_agent: navigator.userAgent || "",
    screen: screenLabel(),
    viewport: viewportLabel(),
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    connection: connectionLabel(),
    app_host: window.location.host,
    ...gpsContext,
    ...getAttributionContext(),
  };
}

function productKey(event = {}) {
  const product = event.product && typeof event.product === "object" ? event.product : {};
  return s(product.pid || event.product_pid || product.id || event.product_id);
}

function stableMetaKey(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 500);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function eventDedupeKey(event = {}) {
  const type = s(event.type);
  if (!EVENT_DEDUPE_TTL_MS[type]) return "";

  if (type === "product_impression") {
    const pid = productKey(event);
    if (!pid) return "";
    return [
      type,
      event.session_id || "",
      event.page_type || "",
      event.list_id || event.list_name || event.section || "",
      pid,
    ].join("|");
  }

  if (type === "detail_open") {
    const pid = productKey(event);
    if (!pid) return "";
    return [
      type,
      event.session_id || "",
      pid,
      event.source || "",
      event.page_path || "",
    ].join("|");
  }

  return [
    type,
    event.session_id || "",
    event.page_path || "",
    event.route || "",
    event.query || "",
    event.category || "",
    event.list_id || event.list_name || "",
    stableMetaKey(event.meta),
  ].join("|");
}

function pruneRecentEvents(now = Date.now()) {
  if (recentEventKeys.size <= RECENT_DEDUPE_LIMIT) return;
  for (const [key, item] of recentEventKeys.entries()) {
    if (!item || now - item.at > item.ttl) recentEventKeys.delete(key);
    if (recentEventKeys.size <= RECENT_DEDUPE_LIMIT) return;
  }
  while (recentEventKeys.size > RECENT_DEDUPE_LIMIT) {
    const oldest = recentEventKeys.keys().next().value;
    if (!oldest) break;
    recentEventKeys.delete(oldest);
  }
}

function shouldDropDuplicateEvent(event = {}) {
  const type = s(event.type);
  const ttl = EVENT_DEDUPE_TTL_MS[type];
  if (!ttl) return false;

  const key = eventDedupeKey(event);
  if (!key) return false;

  const now = Number(event.ts || Date.now()) || Date.now();
  const prev = recentEventKeys.get(key);
  if (prev && now - prev.at < ttl) return true;

  recentEventKeys.set(key, { at: now, ttl });
  pruneRecentEvents(now);
  return false;
}

function shouldDropRateLimitedEvent(event = {}) {
  const type = s(event.type);
  const config = EVENT_RATE_LIMITS[type];
  if (!config) return false;

  const now = Number(event.ts || Date.now()) || Date.now();
  const bucket = rateBuckets.get(type);
  if (!bucket || now - bucket.startedAt >= config.windowMs) {
    rateBuckets.set(type, { startedAt: now, count: 1 });
    return false;
  }

  if (bucket.count >= config.max) return true;
  bucket.count += 1;
  return false;
}

function normalizeEvent(type, payload = {}) {
  const ts = Date.now();
  return {
    id: payload.id || uid("evt"),
    ts,
    ts_iso: new Date(ts).toISOString(),
    type: clip(type, 80),
    source: clip(payload.source || "telemetry", 120),
    ...commonContext(),
    ...payload,
  };
}

function scheduleFlush() {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = window.setTimeout(() => {
    flushTimer = 0;
    flushTelemetry();
  }, FLUSH_DELAY_MS);
}

export function queueTelemetryEvent(typeOrEvent, payload = {}) {
  if (typeof window === "undefined") return null;
  if (isTrackingSuppressed()) return null;

  const event =
    typeof typeOrEvent === "string"
      ? normalizeEvent(typeOrEvent, payload)
      : normalizeEvent(typeOrEvent?.type || "event", { ...typeOrEvent, ...payload });

  if (!IMPORTANT_EVENT_TYPES.has(event.type)) return null;
  if (shouldDropDuplicateEvent(event) || shouldDropRateLimitedEvent(event)) return null;

  queue.push(event);
  if (queue.length > QUEUE_LIMIT) queue = queue.slice(-QUEUE_LIMIT);
  scheduleFlush();
  return event;
}

export async function flushTelemetry({ beacon = false } = {}) {
  if (typeof window === "undefined") return { ok: false, skipped: true };
  if (!queue.length || isTrackingSuppressed()) return { ok: true, skipped: true };
  if (flushing) {
    scheduleFlush();
    return { ok: true, skipped: true, reason: "flush_in_flight" };
  }

  const webApp = getWebAppUrl();
  if (!webApp) {
    scheduleFlush();
    return { ok: false, skipped: true, error: "missing_webapp" };
  }

  const batch = queue.slice(0, BATCH_LIMIT);
  queue = queue.slice(BATCH_LIMIT);
  const body = JSON.stringify({ webApp, events: batch });
  flushing = true;

  const requeueBatch = () => {
    queue = [...batch, ...queue].slice(0, QUEUE_LIMIT);
    scheduleFlush();
  };

  if (beacon && navigator.sendBeacon) {
    try {
      const sent = navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain;charset=utf-8" }));
      if (sent) {
        flushing = false;
        if (queue.length) scheduleFlush();
        return { ok: true, beacon: true };
      }
    } catch {}
    flushing = false;
    requeueBatch();
    return { ok: false, beacon: true, error: "beacon_rejected" };
  }

  try {
    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      body,
      keepalive: batch.length <= 8,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok || data?.inserted > 0 || data?.accepted > 0) {
      flushing = false;
      if (queue.length) scheduleFlush();
      return { ok: true, data };
    }
    flushing = false;
    requeueBatch();
    return { ok: false, data };
  } catch (error) {
    flushing = false;
    requeueBatch();
    return { ok: false, error: s(error?.message || error) };
  }
}

function errorPayload(error, extra = {}) {
  return {
    source: extra.source || "window_error",
    severity: "error",
    message: clip(error?.message || error || extra.message, 1000),
    file: extra.file || error?.filename || "",
    line: extra.line || error?.lineno || "",
    col: extra.col || error?.colno || "",
    stack: clip(error?.stack || extra.stack || "", 3000),
    meta: extra.meta,
  };
}

export function trackReactError(error, info = {}, name = "react") {
  // React errors stay in the browser console/ErrorBoundary UI. They are not
  // written to the customer analytics sheet.
}

export function trackPageView(meta = {}) {
  if (typeof window === "undefined" || isTrackingSuppressed()) return;
  const key = `${window.location.pathname}${window.location.search}${window.location.hash}:${meta.route || ""}`;
  if (key === lastPageKey) return;
  lastPageKey = key;
  queueTelemetryEvent("page_view", {
    source: meta.source || "route",
    route: meta.route || "",
    query: meta.query || "",
    category: meta.category || "",
    tag: meta.tag || "",
    page_type: meta.pageType || "",
    content_group: meta.contentGroup || "",
    section: meta.section || "",
    list_id: meta.listId || "",
    list_name: meta.listName || "",
    results_count: meta.resultsCount,
    zero_results: meta.zeroResults,
    search_mode: meta.searchMode || "",
    meta,
  });
}

export function initTelemetry() {
  if (typeof window === "undefined" || initialized || isTrackingSuppressed()) return () => {};
  initialized = true;
  ensureAttributionContext();
  hydrateGpsContextFromCache();

  queueTelemetryEvent("session_start", {
    source: "telemetry",
    meta: {
      startedAt: readStorage(window.sessionStorage, SESSION_STARTED_KEY),
    },
  });
  requestBrowserGpsLocation();

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushTelemetry({ beacon: true });
  };

  const onPageHide = () => flushTelemetry({ beacon: true });

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  cleanupFns = [
    () => document.removeEventListener("visibilitychange", onVisibility),
    () => window.removeEventListener("pagehide", onPageHide),
  ];

  return () => {
    cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    cleanupFns = [];
    initialized = false;
  };
}
