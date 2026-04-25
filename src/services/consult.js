import { KEYS, getConfig } from "../utils/config.js";
import { buildProductChatLink, buildProductLink } from "../utils/chatLink.js";
import { productSnapshot, saveConsultLead } from "../utils/customerBehavior.js";
import { getAttributionContext, getCurrentPageContext } from "./attribution.js";
import { isTrackingSuppressed } from "./telemetry.js";

const clean = (value = "") => String(value || "").trim();

const phoneDigits = (value = "") => clean(value).replace(/[^\d+]/g, "");

export function buildConsultChatTarget({ product, form = {} } = {}) {
  const lines = [
    form.name ? `Tên: ${form.name}` : "",
    form.phone ? `Số điện thoại: ${form.phone}` : "",
    form.neededDate ? `Ngày cần bánh: ${form.neededDate}` : "",
    form.note ? `Ghi chú: ${form.note}` : "",
  ].filter(Boolean);

  return buildProductChatLink({
    product,
    sizeLabel: form.sizeLabel || "",
    intent: "consult",
    preferred: "messenger",
    extraLines: lines,
  });
}

function buildLeadRow({ product, form = {}, leadId, productLink }) {
  const snap = productSnapshot(product) || {};
  const attribution = getAttributionContext();
  const page = getCurrentPageContext(form.route || "");
  return {
    id: leadId,
    ts: new Date().toISOString(),
    name: clean(form.name),
    phone: clean(form.phone),
    phone_digits: phoneDigits(form.phone),
    needed_date: clean(form.neededDate),
    size: clean(form.sizeLabel),
    note: clean(form.note),
    product_pid: snap.pid || "",
    product_id: snap.id || "",
    product_name: snap.name || "",
    category: snap.category || "",
    tags: (snap.tags || []).join(", "),
    product_link: productLink || buildProductLink(product),
    source: "website",
    ...page,
    ...attribution,
    lead_status: "",
    lead_score: "",
    quote_amount: "",
    order_value: "",
    lost_reason: "",
    sales_note: "",
    assigned_to: "",
    closed_at: "",
  };
}

async function pushLeadToSheet(row) {
  const webApp = clean(getConfig("gs_webapp_url", ""));
  if (!/^https:\/\/script\.google(?:usercontent)?\.com\//i.test(webApp)) {
    return { ok: false, skipped: true, reason: "missing_webapp" };
  }

  const res = await fetch("/api/gs-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webApp,
      payload: {
        action: "insert",
        sheet: "Consults",
        trackingSheetId: clean(getConfig(KEYS.TRACKING_SHEET_ID, "")),
        row,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `Sheet HTTP ${res.status}`);
  }
  return { ok: true, data };
}

export async function submitConsultLead({ product, form = {} } = {}) {
  const chatTarget = buildConsultChatTarget({ product, form });
  const leadId = `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const row = buildLeadRow({
    product,
    form,
    leadId,
    productLink: chatTarget.productLink || buildProductLink(product),
  });

  if (isTrackingSuppressed()) {
    return {
      ok: true,
      local: false,
      remoteOk: false,
      remoteSkipped: true,
      trackingSkipped: true,
      lead: null,
      chatTarget,
    };
  }

  const localLead = saveConsultLead({
    ...row,
    product: productSnapshot(product),
    remoteOk: false,
  });

  try {
    const remote = await pushLeadToSheet(row);
    return {
      ok: true,
      local: true,
      remoteOk: !!remote.ok,
      remoteSkipped: !!remote.skipped,
      lead: { ...localLead, remoteOk: !!remote.ok },
      chatTarget,
    };
  } catch (error) {
    return {
      ok: true,
      local: true,
      remoteOk: false,
      remoteError: String(error?.message || error || ""),
      lead: localLead,
      chatTarget,
    };
  }
}
