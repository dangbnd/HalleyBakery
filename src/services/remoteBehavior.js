import { KEYS, getConfig } from "../utils/config.js";

const EVENT_LIMIT = 8000;
export const REMOTE_BEHAVIOR_CACHE_KEY = "hb_remote_customer_behavior_cache_v1";
export const REMOTE_BEHAVIOR_CACHE_EVENT = "hb:remote-customer-behavior-changed";
export const REMOTE_BEHAVIOR_CACHE_MS = 10 * 60 * 1000;

function s(value) {
  return value == null ? "" : String(value).trim();
}

function parseTs(value, fallback = Date.now()) {
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function field(row = {}, names = []) {
  for (const name of names) {
    const direct = row[name];
    if (direct != null && String(direct).trim() !== "") return direct;
    const lower = row[String(name).toLowerCase()];
    if (lower != null && String(lower).trim() !== "") return lower;
  }
  return "";
}

function productFromRow(row = {}) {
  const pid = s(field(row, ["product_pid", "pid"]));
  const id = s(field(row, ["product_id"]));
  const name = s(field(row, ["product_name", "name"]));
  const category = s(field(row, ["category"]));
  if (!pid && !id && !name && !category) return null;
  return {
    pid: pid || id || name,
    id,
    name,
    category,
    tags: [],
    image: s(field(row, ["product_image", "image"])),
  };
}

export function normalizeRemoteEvent(row = {}) {
  const product = parseJson(row.product, null) || productFromRow(row);
  const meta = parseJson(row.meta, row.meta ? { raw: String(row.meta) } : undefined);
  const ts = parseTs(field(row, ["ts_ms", "ts", "timestamp", "created_at"]));
  return {
    id: s(field(row, ["id", "event_id"])) || `remote_${ts}_${Math.random().toString(36).slice(2, 8)}`,
    ts,
    type: s(field(row, ["type", "event", "event_type"])) || "event",
    source: s(field(row, ["source"])),
    product,
    query: s(field(row, ["query"])),
    tag: s(field(row, ["tag"])),
    category: s(field(row, ["category"])),
    channel: s(field(row, ["channel"])),
    href: s(field(row, ["href", "target_href"])),
    message: s(field(row, ["message", "error"])),
    severity: s(field(row, ["severity"])),
    page_path: s(field(row, ["page_path"])),
    page_url: s(field(row, ["page_url"])),
    page_title: s(field(row, ["page_title"])),
    route: s(field(row, ["route"])),
    page_type: s(field(row, ["page_type"])),
    content_group: s(field(row, ["content_group"])),
    section: s(field(row, ["section"])),
    list_id: s(field(row, ["list_id"])),
    list_name: s(field(row, ["list_name"])),
    list_position: s(field(row, ["list_position"])),
    results_count: s(field(row, ["results_count"])),
    zero_results: s(field(row, ["zero_results"])),
    search_mode: s(field(row, ["search_mode"])),
    referrer: s(field(row, ["referrer"])),
    user_agent: s(field(row, ["user_agent", "ua"])),
    screen: s(field(row, ["screen"])),
    viewport: s(field(row, ["viewport"])),
    language: s(field(row, ["language", "lang"])),
    timezone: s(field(row, ["timezone"])),
    connection: s(field(row, ["connection"])),
    app_host: s(field(row, ["app_host", "host"])),
    target_tag: s(field(row, ["target_tag"])),
    target_text: s(field(row, ["target_text"])),
    target_href: s(field(row, ["target_href"])),
    target_id: s(field(row, ["target_id"])),
    file: s(field(row, ["file", "filename"])),
    line: s(field(row, ["line", "lineno"])),
    col: s(field(row, ["col", "colno"])),
    stack: s(field(row, ["stack"])),
    duration_ms: s(field(row, ["duration_ms", "duration"])),
    value: s(field(row, ["value"])),
    first_touch_source: s(field(row, ["first_touch_source"])),
    first_touch_medium: s(field(row, ["first_touch_medium"])),
    first_touch_campaign: s(field(row, ["first_touch_campaign"])),
    first_touch_content: s(field(row, ["first_touch_content"])),
    first_touch_term: s(field(row, ["first_touch_term"])),
    first_touch_click_id: s(field(row, ["first_touch_click_id"])),
    first_touch_channel: s(field(row, ["first_touch_channel"])),
    first_touch_landing_path: s(field(row, ["first_touch_landing_path"])),
    first_touch_referrer: s(field(row, ["first_touch_referrer"])),
    first_touch_at: s(field(row, ["first_touch_at"])),
    last_touch_source: s(field(row, ["last_touch_source"])),
    last_touch_medium: s(field(row, ["last_touch_medium"])),
    last_touch_campaign: s(field(row, ["last_touch_campaign"])),
    last_touch_content: s(field(row, ["last_touch_content"])),
    last_touch_term: s(field(row, ["last_touch_term"])),
    last_touch_click_id: s(field(row, ["last_touch_click_id"])),
    last_touch_channel: s(field(row, ["last_touch_channel"])),
    last_touch_landing_path: s(field(row, ["last_touch_landing_path"])),
    last_touch_referrer: s(field(row, ["last_touch_referrer"])),
    last_touch_at: s(field(row, ["last_touch_at"])),
    session_id: s(field(row, ["session_id"])),
    visitor_id: s(field(row, ["visitor_id"])),
    meta,
  };
}

export function normalizeRemoteLead(row = {}) {
  const product = productFromRow(row);
  const ts = parseTs(field(row, ["ts_ms", "ts", "timestamp", "created_at"]));
  return {
    id: s(field(row, ["id", "lead_id"])) || `lead_${ts}_${Math.random().toString(36).slice(2, 8)}`,
    ts,
    name: s(field(row, ["name"])),
    phone: s(field(row, ["phone"])),
    needed_date: s(field(row, ["needed_date", "neededDate"])),
    note: s(field(row, ["note"])),
    product,
    product_pid: product?.pid || "",
    product_id: product?.id || "",
    product_name: product?.name || s(field(row, ["product_name"])),
    category: product?.category || s(field(row, ["category"])),
    product_link: s(field(row, ["product_link", "href"])),
    source: s(field(row, ["source"])) || "remote",
    page_path: s(field(row, ["page_path"])),
    page_url: s(field(row, ["page_url"])),
    page_title: s(field(row, ["page_title"])),
    route: s(field(row, ["route"])),
    referrer: s(field(row, ["referrer"])),
    first_touch_source: s(field(row, ["first_touch_source"])),
    first_touch_medium: s(field(row, ["first_touch_medium"])),
    first_touch_campaign: s(field(row, ["first_touch_campaign"])),
    first_touch_content: s(field(row, ["first_touch_content"])),
    first_touch_term: s(field(row, ["first_touch_term"])),
    first_touch_click_id: s(field(row, ["first_touch_click_id"])),
    first_touch_channel: s(field(row, ["first_touch_channel"])),
    first_touch_landing_path: s(field(row, ["first_touch_landing_path"])),
    first_touch_referrer: s(field(row, ["first_touch_referrer"])),
    first_touch_at: s(field(row, ["first_touch_at"])),
    last_touch_source: s(field(row, ["last_touch_source"])),
    last_touch_medium: s(field(row, ["last_touch_medium"])),
    last_touch_campaign: s(field(row, ["last_touch_campaign"])),
    last_touch_content: s(field(row, ["last_touch_content"])),
    last_touch_term: s(field(row, ["last_touch_term"])),
    last_touch_click_id: s(field(row, ["last_touch_click_id"])),
    last_touch_channel: s(field(row, ["last_touch_channel"])),
    last_touch_landing_path: s(field(row, ["last_touch_landing_path"])),
    last_touch_referrer: s(field(row, ["last_touch_referrer"])),
    last_touch_at: s(field(row, ["last_touch_at"])),
    lead_status: s(field(row, ["lead_status", "status"])),
    lead_score: s(field(row, ["lead_score"])),
    quote_amount: s(field(row, ["quote_amount"])),
    order_value: s(field(row, ["order_value"])),
    lost_reason: s(field(row, ["lost_reason"])),
    sales_note: s(field(row, ["sales_note"])),
    assigned_to: s(field(row, ["assigned_to"])),
    closed_at: s(field(row, ["closed_at"])),
    remoteOk: true,
  };
}

function dedupeById(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = s(row?.id) || `${row?.type || "row"}:${row?.ts || ""}:${row?.source || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => parseTs(b.ts, 0) - parseTs(a.ts, 0));
}

export function mergeEvents(...groups) {
  return dedupeById(groups.flat().filter(Boolean));
}

export function mergeLeads(...groups) {
  return dedupeById(groups.flat().filter(Boolean));
}

function leadsFromEvents(events = []) {
  return events
    .filter((event) => event.type === "consult_submit")
    .map((event) => ({
      id: `lead_event_${event.id}`,
      ts: event.ts,
      product: event.product,
      product_pid: event.product?.pid || "",
      product_id: event.product?.id || "",
      product_name: event.product?.name || "",
      category: event.product?.category || "",
      source: event.source || "event",
      remoteOk: true,
    }));
}

function emitRemoteCacheChanged() {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(REMOTE_BEHAVIOR_CACHE_EVENT));
  } catch {}
}

export function readRemoteCustomerBehaviorCache({ ttlMs = REMOTE_BEHAVIOR_CACHE_MS } = {}) {
  try {
    const cached = JSON.parse(localStorage.getItem(REMOTE_BEHAVIOR_CACHE_KEY) || "null");
    if (!cached || typeof cached !== "object") return null;
    const fetchedAt = Number(cached.fetchedAt || 0);
    return {
      ...cached,
      events: Array.isArray(cached.events) ? cached.events : [],
      leads: Array.isArray(cached.leads) ? cached.leads : [],
      fresh: fetchedAt > 0 && Date.now() - fetchedAt < ttlMs,
      ageMs: fetchedAt > 0 ? Date.now() - fetchedAt : Infinity,
    };
  } catch {
    return null;
  }
}

function writeRemoteCustomerBehaviorCache(data = {}) {
  const payload = {
    ok: !!data.ok,
    events: Array.isArray(data.events) ? data.events : [],
    leads: Array.isArray(data.leads) ? data.leads : [],
    source: data.source || "remote",
    error: data.error || "",
    fetchedAt: Date.now(),
  };
  try {
    localStorage.setItem(REMOTE_BEHAVIOR_CACHE_KEY, JSON.stringify(payload));
    emitRemoteCacheChanged();
  } catch {}
  return payload;
}

export function clearRemoteCustomerBehaviorCache() {
  try {
    localStorage.removeItem(REMOTE_BEHAVIOR_CACHE_KEY);
    emitRemoteCacheChanged();
  } catch {}
}

function fromCache(cached, extra = {}) {
  return {
    ok: !!cached?.ok,
    events: Array.isArray(cached?.events) ? cached.events : [],
    leads: Array.isArray(cached?.leads) ? cached.leads : [],
    source: cached?.source || "cache",
    error: cached?.error || "",
    fetchedAt: cached?.fetchedAt || 0,
    cached: true,
    fresh: !!cached?.fresh,
    stale: !cached?.fresh,
    ...extra,
  };
}

export async function loadRemoteCustomerBehavior({ force = false, ttlMs = REMOTE_BEHAVIOR_CACHE_MS } = {}) {
  const cached = readRemoteCustomerBehaviorCache({ ttlMs });
  if (!force && cached?.fresh) return fromCache(cached, { stale: false });

  const webApp = s(getConfig(KEYS.GS_WEBAPP_URL, ""));
  const authToken = s(getConfig(KEYS.GS_WEBAPP_TOKEN, ""));
  if (!webApp) {
    if (cached) return fromCache(cached, { error: "missing_webapp" });
    return { ok: false, events: [], leads: [], source: "missing_webapp", error: "missing_webapp" };
  }

  const res = await fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify({
      op: "list",
      webApp,
      authToken,
      limit: EVENT_LIMIT,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !Array.isArray(data.events)) {
    if (cached) return fromCache(cached, { error: data.error || `remote_http_${res.status}` });
    return {
      ok: false,
      events: [],
      leads: [],
      source: data.source || "remote",
      error: data.error || `remote_http_${res.status}`,
    };
  }

  const events = (Array.isArray(data.events) ? data.events : []).map(normalizeRemoteEvent);
  const explicitLeads = (Array.isArray(data.leads) ? data.leads : []).map(normalizeRemoteLead);
  const eventFallbackLeads = explicitLeads.length ? [] : leadsFromEvents(events);
  const leads = mergeLeads(explicitLeads, eventFallbackLeads);

  const result = {
    ok: !!data.ok,
    events: mergeEvents(events),
    leads,
    source: data.source || "remote",
    error: data.error || "",
  };
  writeRemoteCustomerBehaviorCache(result);
  return {
    ...result,
    fetchedAt: Date.now(),
    cached: false,
    fresh: true,
    stale: false,
  };
}
