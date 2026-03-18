const UNKNOWN_ACTION_RE =
  /no action|unknown action|unknown op|invalid action|unsupported action|action not supported|unknown action\/op|missing action|missing op|no handler|no function/i;

function s(v) {
  return v == null ? "" : String(v).trim();
}

function responseMessage(data = {}) {
  return s(data?.msg || data?.message || data?.error || data?.reason || "");
}

function isUnknownAction(data) {
  const msg = responseMessage(data).toLowerCase();
  return UNKNOWN_ACTION_RE.test(msg);
}

function toFormEncoded(obj = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    if (typeof v === "object") params.set(k, JSON.stringify(v));
    else params.set(k, String(v));
  }
  return params.toString();
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
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      redirect: "follow",
      body: toFormEncoded(payload),
    },
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      redirect: "follow",
      body: toFormEncoded({
        action: payload?.action ?? "",
        op: payload?.op ?? "",
        payload: JSON.stringify(payload),
      }),
    },
  ];

  let lastErr = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const { res, data } = await requestWithInit(webApp, attempts[i]);
      if (!res.ok) {
        lastErr = new Error(responseMessage(data) || `GS WebApp lỗi HTTP ${res.status}`);
        continue;
      }
      const emptyObj = data && typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0;
      if ((isUnknownAction(data) || emptyObj) && i < attempts.length - 1) {
        lastErr = new Error(responseMessage(data) || "Unknown action/op");
        continue;
      }
      return data;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Không thể gọi GS WebApp");
}

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = await parseRequestBody(req);
    const webApp = s(body?.webApp || "");
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

    if (!webApp) return json(res, 400, { ok: false, error: "Missing webApp URL" });
    if (!isAllowedWebApp(webApp)) {
      return json(res, 400, { ok: false, error: "webApp URL không hợp lệ" });
    }

    const data = await postToAppsScript(webApp, payload);
    return json(res, 200, data && typeof data === "object" ? data : { ok: true, data });
  } catch (e) {
    return json(res, 502, { ok: false, error: s(e?.message || "gs_proxy_failed") });
  }
}

