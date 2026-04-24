const FIRST_TOUCH_KEY = "hb_attribution_first_touch_v1";
const LAST_TOUCH_KEY = "hb_attribution_last_touch_v1";
const TRACKED_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "ttclid",
  "msclkid",
];

function s(value) {
  return value == null ? "" : String(value).trim();
}

function clip(value = "", max = 300) {
  const text = s(value).replace(/\s+/g, " ");
  return text.length > max ? text.slice(0, max - 1) : text;
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {}
}

function pagePath() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function pageUrl() {
  if (typeof window === "undefined") return "";
  return window.location.href || "";
}

function pageTitle() {
  if (typeof document === "undefined") return "";
  return document.title || "";
}

function pageReferrer() {
  if (typeof document === "undefined") return "";
  return document.referrer || "";
}

function hostOf(url = "") {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isInternalReferrer(url = "") {
  if (typeof window === "undefined") return false;
  const refHost = hostOf(url);
  const currentHost = s(window.location.hostname).toLowerCase();
  return !!refHost && !!currentHost && refHost === currentHost;
}

function socialSourceFromHost(host = "") {
  if (!host) return "";
  if (host.includes("facebook.com") || host.includes("fb.com") || host.includes("m.me")) return "facebook";
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("zalo.me")) return "zalo";
  return "";
}

function searchSourceFromHost(host = "") {
  if (!host) return "";
  if (host.includes("google.")) return "google";
  if (host.includes("bing.")) return "bing";
  if (host.includes("yahoo.")) return "yahoo";
  if (host.includes("coccoc.")) return "coccoc";
  return "";
}

function captureParams() {
  if (typeof window === "undefined") return {};
  const out = {};
  const sp = new URLSearchParams(window.location.search || "");
  TRACKED_QUERY_KEYS.forEach((key) => {
    const value = clip(sp.get(key), 240);
    if (value) out[key] = value;
  });
  return out;
}

function pickClickId(params = {}) {
  return s(params.gclid || params.fbclid || params.ttclid || params.msclkid);
}

function inferSource(params = {}, referrer = "") {
  if (s(params.utm_source)) return clip(params.utm_source, 120).toLowerCase();
  if (s(params.gclid)) return "google";
  if (s(params.fbclid)) return "facebook";
  if (s(params.ttclid)) return "tiktok";
  if (s(params.msclkid)) return "bing";

  const refHost = hostOf(referrer);
  if (!refHost || isInternalReferrer(referrer)) return "direct";
  return socialSourceFromHost(refHost) || searchSourceFromHost(refHost) || refHost;
}

function inferMedium(params = {}, referrer = "") {
  const utmMedium = s(params.utm_medium).toLowerCase();
  if (utmMedium) return clip(utmMedium, 120);
  if (pickClickId(params)) return "paid";

  const refHost = hostOf(referrer);
  if (!refHost || isInternalReferrer(referrer)) return "direct";
  if (socialSourceFromHost(refHost)) return "social";
  if (searchSourceFromHost(refHost)) return "organic";
  return "referral";
}

function inferChannel(snapshot = {}) {
  const source = s(snapshot.source).toLowerCase();
  const medium = s(snapshot.medium).toLowerCase();

  if (!source || source === "direct" || medium === "direct") return "direct";
  if (medium.includes("email")) return "email";
  if (medium.includes("sms") || medium.includes("zalo")) return "messaging";
  if (medium.includes("affiliate")) return "affiliate";
  if (medium.includes("display")) return "display";
  if (medium.includes("referral")) return "referral";

  const isSocial =
    medium.includes("social") ||
    ["facebook", "instagram", "tiktok", "zalo", "youtube"].includes(source);
  const isSearch =
    medium.includes("search") ||
    medium.includes("seo") ||
    ["google", "bing", "yahoo", "coccoc"].includes(source);
  const isPaid =
    medium.includes("paid") ||
    medium.includes("cpc") ||
    medium.includes("ppc") ||
    medium.includes("ads");

  if (isSocial && isPaid) return "paid_social";
  if (isSocial) return "organic_social";
  if (isSearch && isPaid) return "paid_search";
  if (isSearch) return "organic_search";
  if (isPaid) return "paid_other";
  return "other";
}

function buildSnapshot() {
  const params = captureParams();
  const referrer = pageReferrer();
  const source = inferSource(params, referrer);
  const medium = inferMedium(params, referrer);
  const snapshot = {
    source,
    medium,
    campaign: clip(params.utm_campaign, 180),
    content: clip(params.utm_content, 180),
    term: clip(params.utm_term, 180),
    click_id: clip(pickClickId(params), 240),
    channel: "",
    landing_path: clip(pagePath(), 500),
    landing_url: clip(pageUrl(), 1200),
    referrer: clip(referrer, 1200),
    captured_at: new Date().toISOString(),
  };
  snapshot.channel = inferChannel(snapshot);
  return snapshot;
}

function hasSignal(snapshot = {}) {
  if (!snapshot) return false;
  return !!(
    snapshot.campaign ||
    snapshot.content ||
    snapshot.term ||
    snapshot.click_id ||
    (snapshot.referrer && !isInternalReferrer(snapshot.referrer)) ||
    (snapshot.source && snapshot.source !== "direct")
  );
}

function shouldUpdateLastTouch(current = {}, previous = null) {
  if (!previous) return true;
  if (current.click_id || current.campaign || current.content || current.term) return true;
  if (current.referrer && !isInternalReferrer(current.referrer)) return true;
  return !hasSignal(previous);
}

export function ensureAttributionContext() {
  if (typeof window === "undefined") return null;

  const current = buildSnapshot();
  const firstTouch = readJson(window.localStorage, FIRST_TOUCH_KEY);
  const lastTouch = readJson(window.localStorage, LAST_TOUCH_KEY);

  if (!firstTouch) {
    writeJson(window.localStorage, FIRST_TOUCH_KEY, current);
  }

  if (!lastTouch || shouldUpdateLastTouch(current, lastTouch) || hasSignal(current)) {
    writeJson(window.localStorage, LAST_TOUCH_KEY, current);
  }

  return {
    first: readJson(window.localStorage, FIRST_TOUCH_KEY),
    last: readJson(window.localStorage, LAST_TOUCH_KEY),
    current,
  };
}

export function getAttributionContext() {
  if (typeof window === "undefined") return {};

  const first = readJson(window.localStorage, FIRST_TOUCH_KEY) || {};
  const last = readJson(window.localStorage, LAST_TOUCH_KEY) || {};

  return {
    first_touch_source: clip(first.source, 120),
    first_touch_medium: clip(first.medium, 120),
    first_touch_campaign: clip(first.campaign, 180),
    first_touch_content: clip(first.content, 180),
    first_touch_term: clip(first.term, 180),
    first_touch_click_id: clip(first.click_id, 240),
    first_touch_channel: clip(first.channel, 80),
    first_touch_landing_path: clip(first.landing_path, 500),
    first_touch_referrer: clip(first.referrer, 1200),
    first_touch_at: clip(first.captured_at, 80),
    last_touch_source: clip(last.source, 120),
    last_touch_medium: clip(last.medium, 120),
    last_touch_campaign: clip(last.campaign, 180),
    last_touch_content: clip(last.content, 180),
    last_touch_term: clip(last.term, 180),
    last_touch_click_id: clip(last.click_id, 240),
    last_touch_channel: clip(last.channel, 80),
    last_touch_landing_path: clip(last.landing_path, 500),
    last_touch_referrer: clip(last.referrer, 1200),
    last_touch_at: clip(last.captured_at, 80),
  };
}

export function getCurrentPageContext(route = "") {
  return {
    page_path: clip(pagePath(), 500),
    page_url: clip(pageUrl(), 1200),
    page_title: clip(pageTitle(), 300),
    route: clip(route, 120),
    referrer: clip(pageReferrer(), 1200),
  };
}
