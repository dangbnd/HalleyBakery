const UNKNOWN_ACTION_RE =
  /no action|unknown action|unknown op|invalid action|unsupported action|action not supported|missing action|missing op|no handler|no function/i;
const PRODUCT_IMPRESSION_LIST_LIMIT = 6;

const ALLOWED_EVENT_TYPES = new Set([
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

const EVENT_HEADERS = [
  "id",
  "ip_address",
  "address",
  "ts",
  "ts_ms",
  "type",
  "source",
  "severity",
  "visitor_id",
  "session_id",
  "page_path",
  "page_url",
  "page_title",
  "route",
  "page_type",
  "content_group",
  "section",
  "list_id",
  "list_name",
  "list_position",
  "results_count",
  "zero_results",
  "search_mode",
  "referrer",
  "visibility",
  "product_pid",
  "product_id",
  "product_name",
  "category",
  "query",
  "tag",
  "channel",
  "href",
  "status",
  "message",
  "file",
  "line",
  "col",
  "stack",
  "target_tag",
  "target_text",
  "target_href",
  "target_id",
  "duration_ms",
  "value",
  "first_touch_source",
  "first_touch_medium",
  "first_touch_campaign",
  "first_touch_content",
  "first_touch_term",
  "first_touch_click_id",
  "first_touch_channel",
  "first_touch_landing_path",
  "first_touch_referrer",
  "first_touch_at",
  "last_touch_source",
  "last_touch_medium",
  "last_touch_campaign",
  "last_touch_content",
  "last_touch_term",
  "last_touch_click_id",
  "last_touch_channel",
  "last_touch_landing_path",
  "last_touch_referrer",
  "last_touch_at",
  "meta",
  "user_agent",
  "screen",
  "viewport",
  "language",
  "timezone",
  "connection",
  "app_host",
];

const TRACKING_OPT_OUT_KEY = "hb_tracking_opt_out_v1";

function s(value) {
  return value == null ? "" : String(value).trim();
}

function clip(value = "", max = 500) {
  const text = s(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

function responseMessage(data = {}) {
  return s(data?.msg || data?.message || data?.error || data?.reason || "");
}

function isUnknownAction(data) {
  return UNKNOWN_ACTION_RE.test(responseMessage(data).toLowerCase());
}

function cookieValue(cookieHeader = "", key = "") {
  const prefix = `${encodeURIComponent(key)}=`;
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

function isStaffOptOutRequest(req) {
  try {
    return decodeURIComponent(cookieValue(req.headers?.cookie || "", TRACKING_OPT_OUT_KEY)) === "1";
  } catch {
    return cookieValue(req.headers?.cookie || "", TRACKING_OPT_OUT_KEY) === "1";
  }
}

function isAllowedWebApp(url = "") {
  try {
    const u = new URL(String(url || ""));
    const host = String(u.hostname || "").toLowerCase();
    if (u.protocol !== "https:") return false;
    return host.endsWith("script.google.com") || host.endsWith("script.googleusercontent.com");
  } catch {
    return false;
  }
}

function headerValue(headers = {}, name = "") {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()] ?? headers?.[name.toUpperCase()];
  return Array.isArray(value) ? value[0] : value;
}

function cleanIpAddress(value = "") {
  const first = String(value || "").split(",")[0].trim();
  if (!first || first.toLowerCase() === "unknown") return "";
  if (first.startsWith("[") && first.includes("]")) return first.slice(1, first.indexOf("]"));
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(first)) return first.replace(/:\d+$/, "");
  return first;
}

function cleanGeoValue(value = "") {
  const raw = String(value || "").split(",")[0].trim();
  if (!raw || raw.toLowerCase() === "unknown") return "";
  try {
    return decodeURIComponent(raw).replace(/\+/g, " ").trim();
  } catch {
    return raw.replace(/\+/g, " ").trim();
  }
}

function clientIpFromRequest(req) {
  const headers = req.headers || {};
  // Cloudflare sits in front of the app for the public domain. Prefer its
  // client-IP headers before generic forwarded headers, otherwise we may log
  // the Cloudflare edge IP and geolocation will point to a CDN region.
  return cleanIpAddress(
    headerValue(headers, "cf-connecting-ip") ||
    headerValue(headers, "true-client-ip") ||
    headerValue(headers, "x-vercel-forwarded-for") ||
    headerValue(headers, "x-real-ip") ||
    headerValue(headers, "x-forwarded-for") ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ""
  );
}

function geoHeader(headers = {}, names = []) {
  for (const name of names) {
    const value = cleanGeoValue(headerValue(headers, name));
    if (value) return value;
  }
  return "";
}

function clientAddressFromRequest(req) {
  const headers = req.headers || {};
  const city = geoHeader(headers, ["x-vercel-ip-city", "cf-ipcity"]);
  const region = geoHeader(headers, ["x-vercel-ip-country-region", "cf-region", "cf-region-code"]);
  const country = geoHeader(headers, ["x-vercel-ip-country", "cf-ipcountry"]);
  const parts = [];
  [city, region, country].forEach((part) => {
    if (part && !parts.some((existing) => existing.toLowerCase() === part.toLowerCase())) parts.push(part);
  });
  return parts.join(", ");
}

async function parseRequestBody(req) {
  const raw = req.body;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestWithInit(webApp = "", init = {}) {
  const res = await fetch(webApp, init);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text ? { message: text, error: text, msg: text } : {};
  }
  return { res, data };
}

async function postToAppsScript(webApp = "", payload = {}) {
  const attempts = [
    {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify(payload),
    },
    {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify(payload),
    },
  ];

  let lastErr = null;
  for (const init of attempts) {
    try {
      const { res, data } = await requestWithInit(webApp, init);
      if (!res.ok) {
        lastErr = new Error(responseMessage(data) || `GS WebApp HTTP ${res.status}`);
        continue;
      }
      if (isUnknownAction(data)) {
        lastErr = new Error(responseMessage(data) || "Unknown action/op");
        continue;
      }
      return data;
    } catch (error) {
      lastErr = error;
    }
  }

  throw lastErr || new Error("Cannot call GS WebApp");
}

function uid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function numberOrBlank(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function boolOrBlank(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return "";
}

function metaString(value) {
  if (!value) return "";
  if (typeof value === "string") return clip(value, 4000);
  try {
    return clip(JSON.stringify(value), 4000);
  } catch {
    return clip(String(value), 4000);
  }
}

function productField(event = {}, field = "") {
  const product = event.product && typeof event.product === "object" ? event.product : {};
  if (field === "pid") return s(product.pid || event.product_pid || event.pid);
  if (field === "id") return s(product.id || event.product_id);
  if (field === "name") return clip(product.name || event.product_name, 240);
  if (field === "category") return s(product.category || event.category);
  return "";
}

function isAllowedVolumeEvent(event = {}) {
  if (event.type === "product_impression") {
    const pos = Number(event.list_position);
    return !Number.isFinite(pos) || pos <= PRODUCT_IMPRESSION_LIST_LIMIT;
  }

  return true;
}

function compactMeta(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 500);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function eventUniqueKey(event = {}) {
  const type = s(event.type);
  const pid = productField(event, "pid");

  if (type === "product_impression" && pid) {
    return [
      type,
      event.session_id,
      event.page_type,
      event.list_id || event.list_name || event.section,
      pid,
    ].join("|");
  }

  if (type === "detail_open" && pid) {
    return [
      type,
      event.session_id,
      pid,
      event.source,
      event.page_path,
    ].join("|");
  }

  if (type === "category_results_view" || type === "search_results_view" || type === "search_zero_result") {
    return [
      type,
      event.session_id,
      event.page_path,
      event.route,
      event.query,
      event.category,
      event.list_id || event.list_name,
      compactMeta(event.meta),
    ].join("|");
  }

  return event.id ? `id:${event.id}` : "";
}

function uniqueEvents(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = eventUniqueKey(row);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeEvent(input = {}) {
  const now = Date.now();
  const tsMs = Number(input.ts_ms || input.ts || now);
  const at = Number.isFinite(tsMs) ? tsMs : now;
  return {
    id: s(input.id) || uid(),
    ip_address: clip(input.ip_address || input.ip || input.client_ip, 80),
    address: clip(input.address || input.ip_address_location || input.location, 240),
    ts: input.ts_iso || new Date(at).toISOString(),
    ts_ms: at,
    type: clip(input.type || "event", 80),
    source: clip(input.source, 120),
    severity: clip(input.severity, 40),
    visitor_id: clip(input.visitor_id, 120),
    session_id: clip(input.session_id, 120),
    page_path: clip(input.page_path || input.path, 500),
    page_url: clip(input.page_url || input.url, 1200),
    page_title: clip(input.page_title || input.title, 300),
    route: clip(input.route, 120),
    page_type: clip(input.page_type, 80),
    content_group: clip(input.content_group, 120),
    section: clip(input.section, 120),
    list_id: clip(input.list_id, 160),
    list_name: clip(input.list_name, 160),
    list_position: numberOrBlank(input.list_position),
    results_count: numberOrBlank(input.results_count),
    zero_results: boolOrBlank(input.zero_results),
    search_mode: clip(input.search_mode, 80),
    referrer: clip(input.referrer, 1200),
    visibility: clip(input.visibility, 40),
    product_pid: productField(input, "pid"),
    product_id: productField(input, "id"),
    product_name: productField(input, "name"),
    category: productField(input, "category"),
    query: clip(input.query, 240),
    tag: clip(input.tag, 160),
    channel: clip(input.channel, 80),
    href: clip(input.href, 1200),
    status: clip(input.status, 80),
    message: clip(input.message || input.error, 1000),
    file: clip(input.file || input.filename, 800),
    line: numberOrBlank(input.line || input.lineno),
    col: numberOrBlank(input.col || input.colno),
    stack: clip(input.stack, 3000),
    target_tag: clip(input.target_tag, 80),
    target_text: clip(input.target_text, 300),
    target_href: clip(input.target_href, 1200),
    target_id: clip(input.target_id, 160),
    duration_ms: numberOrBlank(input.duration_ms || input.duration),
    value: clip(input.value, 500),
    first_touch_source: clip(input.first_touch_source, 120),
    first_touch_medium: clip(input.first_touch_medium, 120),
    first_touch_campaign: clip(input.first_touch_campaign, 180),
    first_touch_content: clip(input.first_touch_content, 180),
    first_touch_term: clip(input.first_touch_term, 180),
    first_touch_click_id: clip(input.first_touch_click_id, 240),
    first_touch_channel: clip(input.first_touch_channel, 80),
    first_touch_landing_path: clip(input.first_touch_landing_path, 500),
    first_touch_referrer: clip(input.first_touch_referrer, 1200),
    first_touch_at: clip(input.first_touch_at, 80),
    last_touch_source: clip(input.last_touch_source, 120),
    last_touch_medium: clip(input.last_touch_medium, 120),
    last_touch_campaign: clip(input.last_touch_campaign, 180),
    last_touch_content: clip(input.last_touch_content, 180),
    last_touch_term: clip(input.last_touch_term, 180),
    last_touch_click_id: clip(input.last_touch_click_id, 240),
    last_touch_channel: clip(input.last_touch_channel, 80),
    last_touch_landing_path: clip(input.last_touch_landing_path, 500),
    last_touch_referrer: clip(input.last_touch_referrer, 1200),
    last_touch_at: clip(input.last_touch_at, 80),
    meta: metaString(input.meta),
    user_agent: clip(input.user_agent, 500),
    screen: clip(input.screen, 80),
    viewport: clip(input.viewport, 80),
    language: clip(input.language, 80),
    timezone: clip(input.timezone, 120),
    connection: clip(input.connection, 80),
    app_host: clip(input.app_host, 240),
  };
}

function authPayload(token = "") {
  const clean = s(token);
  if (!clean) return null;
  return {
    token: clean,
    ts: Date.now(),
    user: { username: "admin", role: "owner", isSuper: true },
  };
}

async function trackEvents({ webApp = "", events = [] } = {}) {
  const rows = uniqueEvents(
    events
      .map(normalizeEvent)
      .filter((event) => event.type && ALLOWED_EVENT_TYPES.has(event.type))
      .filter(isAllowedVolumeEvent)
  );
  if (!rows.length) return { ok: true, accepted: 0, inserted: 0 };

  try {
    const data = await postToAppsScript(webApp, {
      action: "tracking.track",
      sheet: "Events",
      headers: EVENT_HEADERS,
      events: rows,
    });
    if (data?.ok !== false) return { ok: true, accepted: rows.length, inserted: data?.inserted ?? rows.length, mode: "tracking.track", data };
  } catch (error) {
    // Fall through to old generic insert below.
  }

  let inserted = 0;
  let lastError = "";
  for (const row of rows) {
    try {
      const data = await postToAppsScript(webApp, {
        action: "insert",
        sheet: "Events",
        row,
      });
      if (data?.ok === false) {
        lastError = responseMessage(data) || "insert_failed";
      } else {
        inserted += 1;
      }
    } catch (error) {
      lastError = s(error?.message || error);
    }
  }

  return {
    ok: inserted > 0,
    accepted: rows.length,
    inserted,
    mode: "insert",
    error: inserted ? "" : lastError || "events_sheet_unavailable",
  };
}

async function listTelemetry({ webApp = "", authToken = "", limit = 5000 } = {}) {
  const auth = authPayload(authToken);
  try {
    const data = await postToAppsScript(webApp, {
      action: "tracking.list",
      sheet: "Events",
      limit,
      _auth: auth,
    });
    if (data?.ok !== false && Array.isArray(data?.events)) {
      return {
        ok: true,
        events: data.events,
        leads: Array.isArray(data.leads) ? data.leads : [],
        source: "tracking.list",
      };
    }
  } catch (error) {
    // Fall back to generic list below.
  }

  const result = { ok: false, events: [], leads: [], source: "sheet.list", error: "" };
  try {
    const data = await postToAppsScript(webApp, { action: "list", sheet: "Events", _auth: auth });
    if (data?.ok !== false) {
      result.ok = true;
      result.events = Array.isArray(data?.rows) ? data.rows : [];
    } else {
      result.error = responseMessage(data) || "events_sheet_unavailable";
    }
  } catch (error) {
    result.error = s(error?.message || error);
  }

  try {
    const data = await postToAppsScript(webApp, { action: "list", sheet: "Consults", _auth: auth });
    if (data?.ok !== false) result.leads = Array.isArray(data?.rows) ? data.rows : [];
  } catch {}

  return result;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.method === "POST" ? await parseRequestBody(req) : {};
    const q = req.query || {};
    const webApp = s(body.webApp || q.webApp);
    if (!webApp) return json(res, 400, { ok: false, error: "Missing webApp URL" });
    if (!isAllowedWebApp(webApp)) return json(res, 400, { ok: false, error: "Invalid webApp URL" });

    const op = s(body.op || q.op || body.action || q.action).toLowerCase();
    if (req.method === "GET" || op === "list" || op === "tracking.list") {
      const data = await listTelemetry({
        webApp,
        authToken: body.authToken || q.authToken,
        limit: Number(body.limit || q.limit || 5000),
      });
      return json(res, data.ok ? 200 : 502, data);
    }

    if (isStaffOptOutRequest(req)) {
      return json(res, 200, { ok: true, accepted: 0, inserted: 0, ignored: true, reason: "staff_opt_out" });
    }

    const events = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
    const ipAddress = clientIpFromRequest(req);
    const address = clientAddressFromRequest(req);
    const data = await trackEvents({
      webApp,
      events: events.map((event) => ({
        ...event,
        ip_address: s(event?.ip_address || event?.ip || event?.client_ip) || ipAddress,
        address: s(event?.address || event?.ip_address_location || event?.location) || address,
      })),
    });
    return json(res, data.ok ? 200 : 202, data);
  } catch (error) {
    return json(res, 500, { ok: false, error: s(error?.message || "track_failed") });
  }
}
