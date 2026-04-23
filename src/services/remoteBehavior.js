import { KEYS, getConfig } from "../utils/config.js";

const EVENT_LIMIT = 8000;

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
  return out.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
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

export async function loadRemoteCustomerBehavior() {
  const webApp = s(getConfig(KEYS.GS_WEBAPP_URL, ""));
  const authToken = s(getConfig(KEYS.GS_WEBAPP_TOKEN, ""));
  if (!webApp) {
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
  const leads = mergeLeads(explicitLeads, leadsFromEvents(events));

  return {
    ok: !!data.ok,
    events: mergeEvents(events),
    leads,
    source: data.source || "remote",
    error: data.error || "",
  };
}
