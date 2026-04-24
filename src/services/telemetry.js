import { KEYS, getConfig } from "../utils/config.js";
import { parseBooleanLike } from "../utils.js";
import { ensureAttributionContext, getAttributionContext } from "./attribution.js";

const VISITOR_ID_KEY = "hb_visitor_id_v1";
const SESSION_ID_KEY = "hb_session_id_v1";
const SESSION_STARTED_KEY = "hb_session_started_at_v1";
const QUEUE_LIMIT = 120;
const BATCH_LIMIT = 40;
const FLUSH_DELAY_MS = 1600;

let queue = [];
let flushTimer = 0;
let initialized = false;
let cleanupFns = [];
let lastPageKey = "";

const IMPORTANT_EVENT_TYPES = new Set([
  "session_start",
  "page_view",
  "search_submit",
  "search_suggestion_click",
  "search_results_view",
  "search_zero_result",
  "category_results_view",
  "detail_open",
  "product_impression",
  "size_select",
  "favorite_add",
  "favorite_remove",
  "messenger_click",
  "contact_entry_click",
  "consult_form_open",
  "consult_form_start",
  "consult_form_abandon",
  "consult_submit",
  "category_click",
  "tag_click",
  "favorites_page_open",
  "share_copy",
  "resource_error",
  "js_error",
  "react_error",
  "unhandled_rejection",
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

export function isAdminRuntime() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host.startsWith("admin.") || window.location.pathname.startsWith("/admin");
}

export function isTelemetryEnabled() {
  const raw = getConfig(KEYS.ENABLE_VISITOR_TRACKING, "true");
  return parseBooleanLike(raw, true);
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
    ...getAttributionContext(),
  };
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
  if (isAdminRuntime() || !isTelemetryEnabled()) return null;

  const event =
    typeof typeOrEvent === "string"
      ? normalizeEvent(typeOrEvent, payload)
      : normalizeEvent(typeOrEvent?.type || "event", { ...typeOrEvent, ...payload });

  if (!IMPORTANT_EVENT_TYPES.has(event.type)) return null;

  queue.push(event);
  if (queue.length > QUEUE_LIMIT) queue = queue.slice(-QUEUE_LIMIT);
  scheduleFlush();
  return event;
}

export async function flushTelemetry({ beacon = false } = {}) {
  if (typeof window === "undefined") return { ok: false, skipped: true };
  if (!queue.length || isAdminRuntime() || !isTelemetryEnabled()) return { ok: true, skipped: true };

  const webApp = getWebAppUrl();
  if (!webApp) {
    scheduleFlush();
    return { ok: false, skipped: true, error: "missing_webapp" };
  }

  const batch = queue.slice(0, BATCH_LIMIT);
  const rest = queue.slice(BATCH_LIMIT);
  const body = JSON.stringify({ webApp, events: batch });

  if (beacon && navigator.sendBeacon) {
    try {
      const sent = navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain;charset=utf-8" }));
      if (sent) {
        queue = rest;
        if (queue.length) scheduleFlush();
        return { ok: true, beacon: true };
      }
    } catch {}
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
      queue = rest;
      if (queue.length) scheduleFlush();
      return { ok: true, data };
    }
    scheduleFlush();
    return { ok: false, data };
  } catch (error) {
    scheduleFlush();
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
  queueTelemetryEvent("react_error", errorPayload(error, {
    source: "react_error_boundary",
    meta: {
      boundary: name,
      componentStack: clip(info?.componentStack || "", 2500),
    },
  }));
  flushTelemetry();
}

export function trackPageView(meta = {}) {
  if (typeof window === "undefined" || isAdminRuntime()) return;
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
  if (typeof window === "undefined" || initialized || isAdminRuntime()) return () => {};
  initialized = true;
  ensureAttributionContext();

  queueTelemetryEvent("session_start", {
    source: "telemetry",
    meta: {
      startedAt: readStorage(window.sessionStorage, SESSION_STARTED_KEY),
    },
  });

  const onError = (event) => {
    const target = event.target;
    if (target && target !== window) {
      queueTelemetryEvent("resource_error", {
        source: "resource",
        severity: "error",
        target_tag: target.tagName || "",
        target_href: target.src || target.href || "",
        message: `Resource failed: ${target.tagName || "unknown"}`,
      });
      flushTelemetry();
      return;
    }
    queueTelemetryEvent("js_error", errorPayload(event.error || event.message, {
      file: event.filename,
      line: event.lineno,
      col: event.colno,
      stack: event.error?.stack,
    }));
    flushTelemetry();
  };

  const onRejection = (event) => {
    const reason = event.reason;
    queueTelemetryEvent("unhandled_rejection", errorPayload(reason, {
      source: "unhandled_rejection",
      meta: { reason: clip(typeof reason === "string" ? reason : reason?.message || "", 1000) },
    }));
    flushTelemetry();
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushTelemetry({ beacon: true });
  };

  const onPageHide = () => flushTelemetry({ beacon: true });

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  cleanupFns = [
    () => window.removeEventListener("error", onError, true),
    () => window.removeEventListener("unhandledrejection", onRejection),
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
