import {
  canUseAdminProxy,
  hashPassword,
  postToConfiguredAppsScript,
  readAdminSession,
} from "./_admin-auth.js";
import { enforceRateLimit, json, readJsonBody, text } from "./_http.js";

function normalizedAction(payload = {}) {
  return text(payload.action || payload.op || payload.operation).toLowerCase();
}

function normalizedSheet(payload = {}) {
  return text(payload.sheet || payload.sheetName || payload.tab).toLowerCase();
}

async function protectUserPassword(payload = {}) {
  const sheet = normalizedSheet(payload);
  const action = normalizedAction(payload);
  if (!/^(users?|user|nguoi dung|người dùng)$/.test(sheet)) return payload;
  if (!/insert|add|append|create|update|edit|patch|save/.test(action)) return payload;

  const row = payload.row && typeof payload.row === "object" ? { ...payload.row } : null;
  if (!row || !Object.prototype.hasOwnProperty.call(row, "password")) return payload;
  const password = String(row.password || "");
  if (!password || password.startsWith("scrypt$")) return payload;
  row.password = await hashPassword(password);
  return { ...payload, row };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }
  if (!enforceRateLimit(req, res, { scope: "gs-proxy", limit: 120, windowMs: 60_000 })) {
    return;
  }

  const session = readAdminSession(req);
  if (!session) return json(res, 401, { ok: false, error: "Unauthorized" });

  try {
    const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
    const rawPayload = body?.payload && typeof body.payload === "object" ? body.payload : body;
    if (!rawPayload || typeof rawPayload !== "object") {
      return json(res, 400, { ok: false, error: "Missing payload" });
    }
    if (!canUseAdminProxy(session.user, rawPayload)) {
      return json(res, 403, { ok: false, error: "Forbidden" });
    }

    const payload = await protectUserPassword(rawPayload);
    const data = await postToConfiguredAppsScript({
      ...payload,
      _sessionUser: session.user,
    });
    return json(res, 200, data && typeof data === "object" ? data : { ok: true, data });
  } catch (error) {
    return json(res, error?.statusCode || 502, {
      ok: false,
      error: error?.message || "gs_proxy_failed",
    });
  }
}
