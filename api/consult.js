import {
  configuredTrackingSheetId,
  postToConfiguredAppsScript,
} from "./_admin-auth.js";
import { enforceRateLimit, json, readJsonBody, text } from "./_http.js";

const ALLOWED_FIELDS = new Set([
  "id", "ts", "name", "phone", "phone_digits", "needed_date", "size", "note",
  "product_pid", "product_id", "product_name", "category", "tags", "product_link",
  "source", "page_path", "page_url", "page_title", "route", "referrer",
  "first_touch_source", "first_touch_medium", "first_touch_campaign",
  "first_touch_content", "first_touch_term", "first_touch_click_id",
  "first_touch_channel", "first_touch_landing_path", "first_touch_referrer",
  "first_touch_at", "last_touch_source", "last_touch_medium",
  "last_touch_campaign", "last_touch_content", "last_touch_term",
  "last_touch_click_id", "last_touch_channel", "last_touch_landing_path",
  "last_touch_referrer", "last_touch_at",
]);

function sanitizeLead(input = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    out[key] = text(value).slice(0, key === "note" ? 1500 : 500);
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }
  if (!enforceRateLimit(req, res, { scope: "consult", limit: 8, windowMs: 15 * 60_000 })) {
    return;
  }

  try {
    const body = await readJsonBody(req, { maxBytes: 32 * 1024 });
    const row = sanitizeLead(body.row || body);
    const phoneDigits = String(row.phone_digits || row.phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      return json(res, 400, { ok: false, error: "Số điện thoại không hợp lệ" });
    }
    row.phone_digits = phoneDigits;
    const data = await postToConfiguredAppsScript({
      action: "insert",
      sheet: "Consults",
      trackingSheetId: configuredTrackingSheetId(),
      row,
    });
    return json(res, 200, { ok: true, inserted: data?.inserted ?? 1 });
  } catch (error) {
    return json(res, error?.statusCode || 502, {
      ok: false,
      error: error?.message || "Không thể gửi yêu cầu tư vấn",
    });
  }
}
