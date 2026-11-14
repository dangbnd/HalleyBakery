import { buildProductChatLink, buildProductLink } from "../utils/chatLink.js";
import {
  productSnapshot,
  readConsultLeads,
  saveConsultLead,
  updateConsultLead,
} from "../utils/customerBehavior.js";
import { getAttributionContext, getCurrentPageContext } from "./attribution.js";

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
  const res = await fetch("/api/consult", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ row }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `Consult API HTTP ${res.status}`);
  }
  return { ok: true, data };
}

function storedLead(id = "") {
  return readConsultLeads().find((lead) => String(lead?.id || "") === String(id || "")) || null;
}

function remoteLeadRow(lead = {}) {
  const row = { ...lead };
  delete row.product;
  delete row.remoteOk;
  delete row.remotePending;
  delete row.remoteError;
  delete row.remoteUpdatedAt;
  return row;
}

export async function retryPendingConsultLeads() {
  const pending = readConsultLeads()
    .filter((lead) => lead?.remotePending && !lead?.remoteOk)
    .slice(0, 20);
  let sent = 0;
  for (const lead of pending) {
    try {
      await pushLeadToSheet(remoteLeadRow(lead));
      updateConsultLead(lead.id, {
        remoteOk: true,
        remotePending: false,
        remoteError: "",
        remoteUpdatedAt: Date.now(),
      });
      sent += 1;
    } catch {
      break;
    }
  }
  return { ok: true, attempted: pending.length, sent };
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

  const localLead = saveConsultLead({
    ...row,
    product: productSnapshot(product),
    remoteOk: false,
    remotePending: true,
  });
  const localStored = !!storedLead(leadId);

  try {
    const remote = await pushLeadToSheet(row);
    const syncedLead = updateConsultLead(leadId, {
      remoteOk: true,
      remotePending: false,
      remoteError: "",
      remoteUpdatedAt: Date.now(),
    }) || { ...localLead, remoteOk: true, remotePending: false };
    return {
      ok: true,
      local: localStored,
      remoteOk: !!remote.ok,
      remoteSkipped: !!remote.skipped,
      lead: syncedLead,
      chatTarget,
    };
  } catch (error) {
    const message = String(error?.message || error || "");
    const pendingLead = updateConsultLead(leadId, {
      remoteOk: false,
      remotePending: true,
      remoteError: message,
      remoteUpdatedAt: Date.now(),
    }) || localLead;
    return {
      ok: localStored,
      local: localStored,
      remoteOk: false,
      remoteError: message,
      error: localStored
        ? ""
        : "Không thể gửi hoặc lưu yêu cầu. Vui lòng thử lại.",
      lead: localStored ? pendingLead : null,
      chatTarget,
    };
  }
}
