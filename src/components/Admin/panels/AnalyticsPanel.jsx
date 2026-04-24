import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LS, readLS } from "../../../utils.js";
import {
  CUSTOMER_BEHAVIOR_EVENT,
  filterBusinessEvents,
  clearCustomerBehavior,
  readConsultLeads,
  readCustomerEvents,
  summarizeCustomerBehavior,
  timestampOf,
} from "../../../utils/customerBehavior.js";
import {
  REMOTE_BEHAVIOR_CACHE_EVENT,
  loadRemoteCustomerBehavior,
  mergeEvents,
  mergeLeads,
} from "../../../services/remoteBehavior.js";
import { cdnThumb } from "../../../utils/img.js";
import { Badge, Button, Empty, PageHeader, Section, cn } from "../ui/primitives.jsx";

const COLORS = {
  blue: "#60a5fa",
  cyan: "#22d3ee",
  emerald: "#34d399",
  amber: "#fbbf24",
  rose: "#fb7185",
  violet: "#a78bfa",
  slate: "#64748b",
};

const PERIODS = [
  { value: 7, label: "7 ngày" },
  { value: 14, label: "14 ngày" },
  { value: 30, label: "30 ngày" },
];

const CATEGORY_FALLBACK_LABELS = {
  "100k": "100K",
  "basic": "Bánh Basic",
  "tre-em": "Bánh trẻ em",
  "be-trai": "Bánh bé trai",
  "be-gai": "Bánh bé gái",
  "khumori": "Kuromi & Melody & Cinna",
  "thu-noi": "Bánh thú nổi",
  "3d": "Bánh 3D",
  "doraemon": "Bánh Doraemon",
  "nam": "Bánh nam",
  "nu": "Bánh nữ",
  "banh-va-hoa": "Bánh và Hoa",
  "set-hoa-banh": "Set hoa bánh",
  "banh-hoa": "Bánh hoa",
  "tulip": "Bánh Tulip",
  "hoa-dac-biet": "Bánh hoa đặc biệt",
  "hoa-qua": "Bánh hoa quả",
  "banh-lanh": "Bánh Lạnh",
  "redvelvet": "Red Velvet",
  "tiramisu": "Tiramisu",
  "mousse": "Mousse hoa quả",
  "btm": "Bông lan trứng muối",
  "noel": "Bánh noel",
  "love": "Love cake",
  "set-tiec": "Bánh chủ đề bánh tiệc",
  "cong-ty": "Bánh 2 tầng công ty",
  "than-tai": "Bánh thần tài",
  "chau-hoa": "Chậu hoa",
};

const EVENT_LABELS = {
  session_start: "Bắt đầu phiên",
  page_view: "Xem trang",
  search_submit: "Tìm kiếm",
  search_suggestion_click: "Bấm gợi ý search",
  search_results_view: "Xem kết quả",
  search_zero_result: "Search 0 kết quả",
  category_results_view: "Xem danh mục",
  product_impression: "Hiển thị mẫu",
  detail_open: "Mở detail",
  size_select: "Chọn size",
  messenger_click: "Liên hệ",
  contact_entry_click: "Bấm liên hệ chung",
  favorite_add: "Yêu thích",
  favorite_remove: "Bỏ yêu thích",
  consult_form_open: "Mở form tư vấn",
  consult_form_start: "Bắt đầu nhập form",
  consult_form_abandon: "Bỏ form tư vấn",
  consult_submit: "Gửi tư vấn",
  category_click: "Bấm danh mục",
  tag_click: "Bấm tag",
  favorites_page_open: "Mở yêu thích",
  share_copy: "Copy link",
};

const fmt = new Intl.NumberFormat("vi-VN");
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function format(value = 0) {
  return fmt.format(Number(value || 0));
}

function rate(part = 0, total = 0) {
  if (!total) return "0%";
  return `${Math.round((Number(part || 0) / Number(total || 0)) * 100)}%`;
}

function formatPercent(value = 0) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function percentNumber(part = 0, total = 0) {
  const p = Number(part || 0);
  const t = Number(total || 0);
  return t > 0 ? (p / t) * 100 : 0;
}

function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(ts = Date.now()) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isInWindow(ts = 0, days = 14) {
  const time = timestampOf(ts, 0);
  const end = startOfDay(Date.now()) + 86_400_000;
  const start = end - days * 86_400_000;
  return time >= start && time < end;
}

function buildTrend(events = [], leads = [], periodDays = 14) {
  const today = startOfDay(Date.now());
  const rows = [];
  const byKey = new Map();

  for (let i = periodDays - 1; i >= 0; i -= 1) {
    const ts = today - i * 86_400_000;
    const key = dayKey(ts);
    const row = {
      key,
      label: dayLabel(ts),
      "Vào web": 0,
      "Hiển thị mẫu": 0,
      "Mở detail": 0,
      "Liên hệ": 0,
      "Tìm kiếm": 0,
      "Tư vấn": 0,
      "0 kết quả": 0,
      total: 0,
    };
    rows.push(row);
    byKey.set(key, row);
  }

  events.forEach((event) => {
    const ts = timestampOf(event.ts, 0);
    if (!isInWindow(ts, periodDays)) return;
    const row = byKey.get(dayKey(ts));
    if (!row) return;
    row.total += 1;
    if (event.type === "page_view") row["Vào web"] += 1;
    if (event.type === "product_impression") row["Hiển thị mẫu"] += 1;
    if (event.type === "detail_open") row["Mở detail"] += 1;
    if (event.type === "messenger_click" || event.type === "contact_entry_click") row["Liên hệ"] += 1;
    if (event.type === "search_submit") row["Tìm kiếm"] += 1;
    if (event.type === "search_zero_result") row["0 kết quả"] += 1;
  });

  leads.forEach((lead) => {
    const ts = timestampOf(lead.ts, 0);
    if (!isInWindow(ts, periodDays)) return;
    const row = byKey.get(dayKey(ts));
    if (!row) return;
    row["Tư vấn"] += 1;
    row.total += 1;
  });

  return rows;
}

function buildMix(summary, periodEvents = [], periodLeads = []) {
  const totals = summary.totals || {};
  const pageViews = Number(totals.pageViews || 0);
  const impressions = Number(totals.impressions || 0);
  const details = Number(totals.details || 0);
  const contacts = Number(totals.messenger || 0);
  const searches = Number(totals.searches || totals.searchSubmits || 0);
  const favorites = Number(totals.favoriteAdds || 0);
  const consults = Number(totals.consults || periodLeads.length || 0);
  const shares = Number(totals.shares || 0);

  return [
    { name: "Vào web", value: pageViews, color: COLORS.cyan },
    { name: "Hiển thị mẫu", value: impressions, color: COLORS.slate },
    { name: "Mở detail", value: details, color: COLORS.blue },
    { name: "Liên hệ", value: contacts, color: COLORS.rose },
    { name: "Tìm kiếm", value: searches, color: COLORS.amber },
    { name: "Yêu thích", value: favorites, color: COLORS.violet },
    { name: "Tư vấn", value: consults, color: COLORS.emerald },
    { name: "Copy link", value: shares, color: COLORS.blue },
  ].filter((item) => item.value > 0);
}

function buildActionInsights(summary = {}, sourceRows = [], campaignRows = []) {
  const totals = summary.totals || {};
  const insights = [];
  const topZero = summary.topZeroSearches?.[0];
  const lowOpen = (summary.topProducts || []).find((row) => row.impression >= 5 && row.detailRate < 0.08);
  const lowContact = (summary.topProducts || []).find((row) => row.detail >= 3 && row.contactRate < 0.18);
  const sourceWinner = sourceRows.find((row) => row.leads > 0 || row.contacts > 0);
  const campaignWinner = campaignRows.find((row) => row.leads > 0);

  if (topZero) {
    insights.push({
      tone: "amber",
      title: `Bổ sung mẫu cho "${topZero.label}"`,
      detail: `${format(topZero.count)} lượt tìm không có kết quả. Nên thêm mẫu/tag hoặc đổi tên sản phẩm cho khớp nhu cầu này.`,
    });
  }

  if (lowOpen) {
    insights.push({
      tone: "blue",
      title: `Tối ưu ảnh/tên: ${lowOpen.name}`,
      detail: `${format(lowOpen.impression)} lượt hiển thị nhưng chỉ ${formatPercent(lowOpen.detailRate)} mở detail. Nên đổi ảnh đại diện, tiêu đề hoặc đưa mẫu khác lên trước.`,
    });
  }

  if (lowContact) {
    insights.push({
      tone: "rose",
      title: `Tăng CTA cho ${lowContact.name}`,
      detail: `${format(lowContact.detail)} lượt mở detail nhưng chỉ ${formatPercent(lowContact.contactRate)} liên hệ. Kiểm tra giá, size, mô tả và nút Messenger.`,
    });
  }

  if (totals.consultAbandons > 0) {
    insights.push({
      tone: "violet",
      title: "Form tư vấn đang bị bỏ ngang",
      detail: `${format(totals.consultAbandons)} lượt bỏ form, tỷ lệ ${rate(totals.consultAbandons, Math.max(totals.consultStarts, 1))} từ người đã nhập. Nên rút gọn field hoặc đẩy Messenger rõ hơn.`,
    });
  }

  if (campaignWinner) {
    insights.push({
      tone: "emerald",
      title: `Campaign có lead: ${campaignWinner.name}`,
      detail: `${format(campaignWinner.leads)} lead, ${format(campaignWinner.contacts)} liên hệ. Có thể nhân ngân sách nếu đơn thực tế tốt.`,
    });
  } else if (sourceWinner) {
    insights.push({
      tone: "emerald",
      title: `Nguồn đang có tín hiệu: ${sourceWinner.name}`,
      detail: `${format(sourceWinner.contacts)} liên hệ, ${format(sourceWinner.leads)} lead. Nên soi lại nội dung/campaign từ nguồn này.`,
    });
  }

  if (!insights.length) {
    insights.push({
      tone: "neutral",
      title: "Chưa đủ tín hiệu để kết luận",
      detail: "Cần thêm lượt xem, tìm kiếm, liên hệ và lead trong kỳ đang chọn để dashboard đưa ra gợi ý chắc hơn.",
    });
  }

  return insights.slice(0, 4);
}

function rowName(row = {}, fallback = "Chưa rõ") {
  return String(row.name || row.label || row.key || row.product_name || row.pid || fallback).trim() || fallback;
}

function buildFunnelBottleneck(summary = {}) {
  const totals = summary.totals || {};
  const checks = [
    {
      key: "listing",
      label: "Ảnh/list chưa kéo mở detail",
      tone: "amber",
      rate: percentNumber(totals.details, totals.impressions),
      ready: Number(totals.impressions || 0) >= 10,
      detail: `${rate(totals.details, totals.impressions)} mở detail từ hiển thị mẫu.`,
      action: "Đổi ảnh đại diện, tên mẫu, đưa mẫu mạnh hơn lên đầu list.",
    },
    {
      key: "detail",
      label: "Detail chưa ra liên hệ",
      tone: "rose",
      rate: percentNumber(totals.messenger, totals.details),
      ready: Number(totals.details || 0) >= 5,
      detail: `${rate(totals.messenger, totals.details)} liên hệ từ lượt mở detail.`,
      action: "Làm rõ giá, size, mô tả, feedback và nút Messenger trên detail.",
    },
    {
      key: "lead",
      label: "Liên hệ chưa thành lead",
      tone: "violet",
      rate: percentNumber(totals.consults, totals.messenger),
      ready: Number(totals.messenger || 0) >= 3,
      detail: `${rate(totals.consults, totals.messenger)} lead từ người đã liên hệ.`,
      action: "Chuẩn hóa kịch bản tư vấn, hỏi ngày cần bánh và chốt mẫu nhanh hơn.",
    },
    {
      key: "search",
      label: "Khách tìm nhưng thiếu kết quả",
      tone: "amber",
      rate: 100 - percentNumber(totals.zeroResultSearches, Math.max(totals.searches, 1)),
      ready: Number(totals.searches || 0) >= 3 && Number(totals.zeroResultSearches || 0) > 0,
      detail: `${rate(totals.zeroResultSearches, Math.max(totals.searches, 1))} lượt search không ra kết quả.`,
      action: "Bổ sung tag/tên mẫu theo từ khóa khách đang tìm.",
    },
    {
      key: "form",
      label: "Form tư vấn bị bỏ ngang",
      tone: "rose",
      rate: 100 - percentNumber(totals.consultAbandons, Math.max(totals.consultStarts, 1)),
      ready: Number(totals.consultStarts || 0) >= 2 && Number(totals.consultAbandons || 0) > 0,
      detail: `${rate(totals.consultAbandons, Math.max(totals.consultStarts, 1))} bỏ form từ người đã bắt đầu nhập.`,
      action: "Rút field, giữ form ngắn và đặt Messenger là đường chốt chính.",
    },
  ];

  const candidates = checks.filter((item) => item.ready).sort((a, b) => a.rate - b.rate);
  return candidates[0] || {
    key: "collect",
    label: "Cần thêm dữ liệu",
    tone: "neutral",
    rate: 0,
    detail: "Chưa đủ view, search, liên hệ và lead để xác định điểm nghẽn chắc chắn.",
    action: "Tiếp tục gom tracking khách thật trong vài ngày rồi xem lại.",
  };
}

function buildDecisionCards(summary = {}, sourceRows = [], campaignRows = [], categoryRows = [], searchRows = [], zeroSearchRows = []) {
  const totals = summary.totals || {};
  const topProduct = (summary.topProducts || []).find((row) => row.consult > 0 || row.messenger > 0 || row.detail > 0) || summary.topProducts?.[0];
  const topDemand = categoryRows[0] || searchRows[0] || zeroSearchRows[0];
  const topSource = sourceRows.find((row) => row.leads > 0 || row.contacts > 0) || sourceRows[0];
  const topCampaign = campaignRows.find((row) => row.leads > 0 || row.contacts > 0);
  const bottleneck = buildFunnelBottleneck(summary);

  return [
    {
      key: "post",
      tone: "blue",
      eyebrow: "Bài đăng",
      title: topDemand ? `Đăng về ${rowName(topDemand)}` : "Đăng album mẫu đang bán",
      metric: topDemand ? `${format(topDemand.value || topDemand.count)} tín hiệu` : `${format(totals.details)} lượt xem mẫu`,
      detail: topDemand
        ? "Dùng làm chủ đề album, caption, reel hoặc bài feedback vì đang có nhu cầu rõ."
        : "Chưa có nhóm nhu cầu nổi bật, ưu tiên bài tổng hợp mẫu đẹp và feedback thật.",
    },
    {
      key: "ads",
      tone: "emerald",
      eyebrow: "Quảng cáo",
      title: topCampaign ? `Scale ${topCampaign.name}` : topSource ? `Test lại ${topSource.name}` : "Chạy test traffic nhỏ",
      metric: topCampaign
        ? `${format(topCampaign.leads)} lead`
        : topSource
          ? `${format(topSource.contacts)} liên hệ`
          : `${format(totals.messenger)} liên hệ`,
      detail: topCampaign || topSource
        ? "Nguồn này đã có tín hiệu cuối phễu, nên ưu tiên ngân sách hoặc remake nội dung tương tự."
        : "Chưa có nguồn thắng rõ, cần gắn UTM cho từng bài/post/ad để đọc campaign sạch hơn.",
    },
    {
      key: "product",
      tone: "violet",
      eyebrow: "Kinh doanh",
      title: topProduct ? `Đẩy ${rowName(topProduct)}` : "Chưa có mẫu thắng rõ",
      metric: topProduct
        ? `${format(topProduct.messenger)} liên hệ • ${format(topProduct.consult)} lead`
        : `${format(totals.consults)} lead`,
      detail: topProduct
        ? "Đưa mẫu này lên đầu section, dùng ảnh thật/feedback và chuẩn bị size/giá để tư vấn nhanh."
        : "Cần thêm khách thật mở detail/liên hệ để xác định mẫu nên nhập/đẩy.",
    },
    {
      key: "bottleneck",
      tone: bottleneck.tone,
      eyebrow: "Điểm nghẽn",
      title: bottleneck.label,
      metric: bottleneck.detail,
      detail: bottleneck.action,
    },
  ];
}

function buildPlaybookRows(summary = {}, sourceRows = [], campaignRows = [], categoryRows = [], searchRows = [], zeroSearchRows = []) {
  const totals = summary.totals || {};
  const topProduct = (summary.topProducts || []).find((row) => row.consult > 0 || row.messenger > 0) || summary.topProducts?.[0];
  const hotSearch = searchRows[0];
  const missingSearch = zeroSearchRows[0];
  const hotCategory = categoryRows[0];
  const source = sourceRows.find((row) => row.leads > 0 || row.contacts > 0) || sourceRows[0];
  const campaign = campaignRows.find((row) => row.leads > 0 || row.contacts > 0);
  const bottleneck = buildFunnelBottleneck(summary);

  return [
    {
      key: "content",
      title: "Nên đăng gì",
      action: hotSearch
        ? `Làm album/reel theo từ khóa "${rowName(hotSearch)}".`
        : hotCategory
          ? `Làm bộ sưu tập ${rowName(hotCategory)}.`
          : "Đăng feedback thật + album mẫu bán chạy.",
      evidence: hotSearch
        ? `${format(hotSearch.value)} lượt tìm trong kỳ.`
        : hotCategory
          ? `${format(hotCategory.value)} tín hiệu danh mục.`
          : `${format(totals.details)} lượt mở detail.`,
    },
    {
      key: "ads",
      title: "Nên quảng cáo gì",
      action: topProduct ? `Chạy mẫu ${rowName(topProduct)} với ảnh thật và CTA Messenger.` : "Chạy test catalog nhỏ, mỗi ad gắn UTM riêng.",
      evidence: topProduct
        ? `${format(topProduct.detail)} detail, ${format(topProduct.messenger)} liên hệ, ${format(topProduct.consult)} lead.`
        : "Chưa có sản phẩm thắng rõ.",
    },
    {
      key: "business",
      title: "Nên bổ sung/sửa gì",
      action: missingSearch ? `Bổ sung mẫu/tag cho "${rowName(missingSearch)}".` : bottleneck.action,
      evidence: missingSearch ? `${format(missingSearch.value)} lượt tìm 0 kết quả.` : bottleneck.detail,
    },
    {
      key: "reach",
      title: "Nên tiếp cận ở đâu",
      action: campaign ? `Nhân nội dung từ campaign ${campaign.name}.` : source ? `Ưu tiên kênh ${source.name}.` : "Chưa scale kênh, trước mắt gắn UTM cho mọi link đăng.",
      evidence: campaign
        ? `${format(campaign.contacts)} liên hệ, ${format(campaign.leads)} lead.`
        : source
          ? `${format(source.contacts)} liên hệ, ${format(source.leads)} lead.`
          : "Nguồn/campaign chưa đủ sạch.",
    },
  ];
}

function buildContentPlanRows(summary = {}, categoryRows = [], searchRows = [], zeroSearchRows = [], tagRows = []) {
  const rows = [];
  const topProduct = (summary.topProducts || []).find((row) => row.consult > 0 || row.messenger > 0 || row.detail > 0);

  if (zeroSearchRows[0]) {
    rows.push({
      type: "Sản phẩm mới",
      topic: rowName(zeroSearchRows[0]),
      action: "Đăng bài hỏi nhu cầu hoặc thêm mẫu/tag tương ứng.",
      evidence: `${format(zeroSearchRows[0].value)} lượt tìm 0 kết quả.`,
    });
  }
  if (searchRows[0]) {
    rows.push({
      type: "SEO/Search",
      topic: rowName(searchRows[0]),
      action: "Làm album có đúng cụm từ này trong tiêu đề/caption.",
      evidence: `${format(searchRows[0].value)} lượt tìm.`,
    });
  }
  if (categoryRows[0]) {
    rows.push({
      type: "Bộ sưu tập",
      topic: rowName(categoryRows[0]),
      action: "Gom 8-12 mẫu cùng nhóm, đẩy lên home và post mạng xã hội.",
      evidence: `${format(categoryRows[0].value)} tín hiệu danh mục.`,
    });
  }
  if (topProduct) {
    rows.push({
      type: "Feedback",
      topic: rowName(topProduct),
      action: "Đăng ảnh thật/feedback, ghim CTA đặt bánh qua Messenger.",
      evidence: `${format(topProduct.messenger)} liên hệ, ${format(topProduct.consult)} lead.`,
    });
  }
  if (tagRows[0]) {
    rows.push({
      type: "Tag hot",
      topic: rowName(tagRows[0]),
      action: "Tạo carousel theo tag này, dẫn về search/tag tương ứng.",
      evidence: `${format(tagRows[0].value)} tín hiệu tag.`,
    });
  }

  if (!rows.length) {
    rows.push({
      type: "Khởi động",
      topic: "Album mẫu đẹp + feedback",
      action: "Đăng bài tổng hợp mẫu mạnh nhất hiện có, mỗi link gắn UTM riêng.",
      evidence: "Chưa đủ dữ liệu để chọn chủ đề hẹp.",
    });
  }

  return rows.slice(0, 5);
}

function buildOpportunityRows(summary = {}, zeroSearchRows = []) {
  const products = summary.topProducts || [];
  const rows = [];
  const scale = products.find((row) => row.consult > 0 || row.messenger >= 2);
  const lowOpen = products.find((row) => row.impression >= 8 && row.detailRate < 0.08);
  const lowContact = products.find((row) => row.detail >= 3 && row.contactRate < 0.18);

  if (scale) {
    rows.push({
      key: "scale",
      label: "Đẩy mạnh",
      tone: "emerald",
      title: rowName(scale),
      detail: `${format(scale.detail)} detail, ${format(scale.messenger)} liên hệ, ${format(scale.consult)} lead.`,
    });
  }
  if (lowOpen) {
    rows.push({
      key: "listing",
      label: "Sửa ảnh/tên",
      tone: "amber",
      title: rowName(lowOpen),
      detail: `${format(lowOpen.impression)} hiển thị nhưng ${formatPercent(lowOpen.detailRate)} mở detail.`,
    });
  }
  if (lowContact) {
    rows.push({
      key: "detail",
      label: "Sửa chốt",
      tone: "rose",
      title: rowName(lowContact),
      detail: `${format(lowContact.detail)} detail nhưng ${formatPercent(lowContact.contactRate)} liên hệ/detail.`,
    });
  }
  if (zeroSearchRows[0]) {
    rows.push({
      key: "missing",
      label: "Thiếu nhu cầu",
      tone: "violet",
      title: rowName(zeroSearchRows[0]),
      detail: `${format(zeroSearchRows[0].value)} lượt tìm không có kết quả.`,
    });
  }

  if (!rows.length) {
    rows.push({
      key: "watch",
      label: "Theo dõi",
      tone: "neutral",
      title: "Chưa có cơ hội rõ",
      detail: "Cần thêm impression, detail, liên hệ và lead trong kỳ đang chọn.",
    });
  }

  return rows.slice(0, 4);
}

function buildHourly(events = []) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}h`, value: 0 }));
  const usefulTypes = new Set([
    "page_view",
    "search_submit",
    "search_zero_result",
    "detail_open",
    "messenger_click",
    "contact_entry_click",
    "consult_form_open",
    "consult_form_start",
    "consult_submit",
  ]);
  events.forEach((event) => {
    const ts = timestampOf(event.ts, 0);
    if (!isInWindow(ts, 30)) return;
    if (!usefulTypes.has(event.type)) return;
    rows[new Date(ts).getHours()].value += 1;
  });
  const max = Math.max(1, ...rows.map((row) => row.value));
  return rows.map((row) => ({ ...row, level: row.value / max }));
}

function humanizeKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw || /^undefined(?:[._-]undefined)?$/i.test(raw)) return "Chưa phân loại";
  return raw
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fingerprint(value = "") {
  return String(value || "")
    .replace(/\([^)]*\)/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function readField(item = {}, names = []) {
  for (const name of names) {
    const value = item[name] ?? item[String(name).toLowerCase()];
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function buildCategoryLabelMap(menu = [], categories = []) {
  const map = new Map();
  const putValue = (key, label) => {
    const rawKey = String(key || "").trim();
    const rawLabel = String(label || "").trim();
    if (!rawKey || !rawLabel) return;
    const exactKey = rawKey.toLowerCase();
    const aliasKey = fingerprint(rawKey);
    const existing = map.get(exactKey) || map.get(aliasKey) || "";
    const weakLabel =
      rawLabel.toLowerCase() === exactKey ||
      rawLabel.toLowerCase() === humanizeKey(rawKey).toLowerCase() ||
      (fingerprint(rawLabel) === aliasKey && !/[\s\u00C0-\u1EF9]/.test(rawLabel));

    if (existing && weakLabel) return;
    map.set(exactKey, rawLabel);
    if (aliasKey) map.set(aliasKey, rawLabel);
  };
  const put = (item = {}) => {
    const key = readField(item, ["key", "slug", "code", "value", "id", "path", "category", "category_key", "categorykey"]);
    const label = readField(item, [
      "label",
      "title",
      "name",
      "ten",
      "tên",
      "display",
      "display_name",
      "displayname",
      "category_label",
      "categorylabel",
    ]);
    putValue(key, label);
  };
  const walk = (items = []) => {
    const list = Array.isArray(items) ? items : items && typeof items === "object" ? Object.values(items) : [];
    list.forEach((item) => {
      put(item);
      if (Array.isArray(item.children)) walk(item.children);
      if (Array.isArray(item.items)) walk(item.items);
    });
  };

  Object.entries(CATEGORY_FALLBACK_LABELS).forEach(([key, label]) => putValue(key, label));
  walk(menu);
  walk(categories);
  return map;
}

function categoryLabelOf(value = "", labelMap = new Map()) {
  const raw = String(value || "").trim();
  if (!raw) return "Chưa phân loại";
  return labelMap.get(raw.toLowerCase()) || labelMap.get(fingerprint(raw)) || humanizeKey(raw);
}

function normalizeRankRows(rows = [], limit = 8, labelMap = null) {
  return rows.slice(0, limit).map((row) => ({
    key: row.key || row.label,
    name: labelMap ? categoryLabelOf(row.key || row.label, labelMap) : row.label || row.key,
    value: Number(row.count || row.value || 0),
  }));
}

function attributionSourceOf(item = {}) {
  const source = readField(item, ["last_touch_source", "first_touch_source"]);
  if (source) return source;

  const referrer = readField(item, ["last_touch_referrer", "first_touch_referrer", "referrer"]);
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
      if (host.includes("facebook") || host.includes("fb.")) return "facebook";
      if (host.includes("instagram")) return "instagram";
      if (host.includes("google")) return "google";
      if (host.includes("tiktok")) return "tiktok";
      if (host.includes("zalo")) return "zalo";
      if (host && !host.includes("halleybakery")) return host;
    } catch {}
  }

  return "direct";
}

function attributionCampaignOf(item = {}) {
  return readField(item, ["last_touch_campaign", "first_touch_campaign"]) || "Không campaign";
}

function attributionLabelOf(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "Direct";
  const labels = {
    direct: "Direct",
    facebook: "Facebook",
    instagram: "Instagram",
    google: "Google",
    tiktok: "TikTok",
    zalo: "Zalo",
    website: "Website",
    test: "Test",
  };
  return labels[raw.toLowerCase()] || humanizeKey(raw);
}

function buildAttributionRows(events = [], leads = [], mode = "source", limit = 8) {
  const rows = new Map();

  const ensure = (key, name) => {
    const clean = String(key || "").trim();
    if (!clean) return null;
    const current = rows.get(clean) || { key: clean, name, visits: 0, details: 0, contacts: 0, leads: 0, score: 0, leadRate: 0 };
    rows.set(clean, current);
    return current;
  };

  events.forEach((event) => {
    const key = mode === "campaign" ? attributionCampaignOf(event) : attributionSourceOf(event);
    const row = ensure(key, mode === "campaign" ? key : attributionLabelOf(key));
    if (!row) return;

    if (event.type === "page_view") {
      row.visits += 1;
      row.score += 1;
    }
    if (event.type === "search_submit") row.score += 1;
    if (event.type === "detail_open") {
      row.details += 1;
      row.score += 3;
    }
    if (event.type === "messenger_click" || event.type === "contact_entry_click") {
      row.contacts += 1;
      row.score += 6;
    }
    if (event.type === "consult_submit") row.score += 8;
  });

  leads.forEach((lead) => {
    const key = mode === "campaign" ? attributionCampaignOf(lead) : attributionSourceOf(lead);
    const row = ensure(key, mode === "campaign" ? key : attributionLabelOf(key));
    if (!row) return;
    row.leads += 1;
    row.score += 12;
  });

  return [...rows.values()]
    .map((row) => ({ ...row, leadRate: row.contacts ? row.leads / row.contacts : row.leads ? 1 : 0 }))
    .sort((a, b) => b.leads - a.leads || b.contacts - a.contacts || b.score - a.score || a.name.localeCompare(b.name, "vi"))
    .slice(0, limit);
}

function buildFunnel(summary) {
  const pageViews = Number(summary.totals.pageViews || 0);
  const impressions = Number(summary.totals.impressions || 0);
  const views = Number(summary.totals.details || 0);
  const contacts = Number(summary.totals.messenger || 0);
  const leads = Number(summary.totals.consults || 0);
  const max = Math.max(1, pageViews, impressions, views, contacts, leads);

  return [
    { label: "Vào web", value: pageViews, meta: "phiên/page view", color: COLORS.cyan, width: (pageViews / max) * 100 },
    { label: "Hiển thị mẫu", value: impressions, meta: `${rate(impressions, pageViews)} từ vào web`, color: COLORS.slate, width: (impressions / max) * 100 },
    { label: "Mở detail", value: views, meta: `${rate(views, impressions)} từ hiển thị`, color: COLORS.blue, width: (views / max) * 100 },
    { label: "Liên hệ", value: contacts, meta: `${rate(contacts, views)} từ detail`, color: COLORS.rose, width: (contacts / max) * 100 },
    { label: "Tư vấn", value: leads, meta: `${rate(leads, Math.max(contacts, 1))} từ liên hệ`, color: COLORS.emerald, width: (leads / max) * 100 },
  ];
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-2xl">
      <div className="mb-1 font-semibold text-white">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={`${item.name}-${item.color}`} className="flex items-center gap-2 text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color || item.payload?.color }} />
            <span>
              {item.name}: {format(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ title = "Chưa có dữ liệu biểu đồ" }) {
  return <Empty className="!py-10" title={title} hint="Dữ liệu sẽ rõ hơn khi khách xem mẫu, tìm kiếm, lưu yêu thích hoặc gửi tư vấn." />;
}

function PeriodSwitch({ value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/70 p-1">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          type="button"
          onClick={() => onChange(period.value)}
          className={cn(
            "h-8 rounded-lg px-3 text-xs font-medium transition",
            value === period.value
              ? "bg-blue-500 text-white shadow-[0_10px_24px_rgba(59,130,246,0.24)]"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

function DecisionBoard({ rows = [] }) {
  const tones = {
    amber: "border-amber-400/30 bg-amber-400/10",
    blue: "border-blue-400/30 bg-blue-400/10",
    rose: "border-rose-400/30 bg-rose-400/10",
    violet: "border-violet-400/30 bg-violet-400/10",
    emerald: "border-emerald-400/30 bg-emerald-400/10",
    neutral: "border-slate-700 bg-slate-950/70",
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.key} className={cn("rounded-2xl border p-4", tones[row.tone] || tones.neutral)}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{row.eyebrow}</div>
          <div className="mt-2 text-lg font-semibold leading-6 text-white">{row.title}</div>
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm font-semibold text-slate-100">
            {row.metric}
          </div>
          <div className="mt-3 text-sm leading-6 text-slate-300">{row.detail}</div>
        </div>
      ))}
    </div>
  );
}

function PlaybookGrid({ rows = [] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.key} className="rounded-2xl border border-slate-800 bg-slate-950/62 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">{row.title}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-white">{row.action}</div>
          <div className="mt-3 text-xs leading-5 text-slate-500">{row.evidence}</div>
        </div>
      ))}
    </div>
  );
}

function ContentPlan({ rows = [] }) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={`${row.type}-${row.topic}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={index === 0 ? "success" : "info"}>{row.type}</Badge>
                <div className="truncate text-sm font-semibold text-white">{row.topic}</div>
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{row.action}</div>
            </div>
            <div className="shrink-0 rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-xs text-slate-400 sm:max-w-[220px]">
              {row.evidence}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OpportunityList({ rows = [] }) {
  const variants = {
    emerald: "success",
    amber: "warning",
    rose: "danger",
    violet: "violet",
    neutral: "neutral",
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <Badge variant={variants[row.tone] || "neutral"}>{row.label}</Badge>
          <div className="mt-2 line-clamp-2 text-sm font-semibold text-white">{row.title}</div>
          <div className="mt-2 text-xs leading-5 text-slate-500">{row.detail}</div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, meta, tone = "blue" }) {
  const tones = {
    blue: "border-blue-500/35 text-blue-300",
    rose: "border-rose-500/35 text-rose-300",
    amber: "border-amber-500/35 text-amber-300",
    emerald: "border-emerald-500/35 text-emerald-300",
    violet: "border-violet-500/35 text-violet-300",
    neutral: "border-slate-700 text-slate-300",
  };

  return (
    <div className={cn("rounded-2xl border bg-slate-900/78 p-4 shadow-[0_16px_34px_rgba(2,6,23,0.24)]", tones[tone] || tones.blue)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold leading-none text-white">{format(value)}</div>
      <div className="mt-3 text-xs leading-5 text-slate-400">{meta}</div>
    </div>
  );
}

function Funnel({ rows = [] }) {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label} className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-white">{row.label}</div>
              <div className="text-xs text-slate-500">{row.meta}</div>
            </div>
            <div className="font-semibold text-white">{format(row.value)}</div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, row.width)}%`, background: row.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightList({ rows = [] }) {
  const tones = {
    amber: "border-amber-400/25 bg-amber-400/8 text-amber-200",
    blue: "border-blue-400/25 bg-blue-400/8 text-blue-200",
    rose: "border-rose-400/25 bg-rose-400/8 text-rose-200",
    violet: "border-violet-400/25 bg-violet-400/8 text-violet-200",
    emerald: "border-emerald-400/25 bg-emerald-400/8 text-emerald-200",
    neutral: "border-slate-700 bg-slate-950/60 text-slate-200",
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {rows.map((row, index) => (
        <div key={`${row.title}-${index}`} className={cn("rounded-2xl border p-4", tones[row.tone] || tones.neutral)}>
          <div className="text-sm font-semibold text-white">{row.title}</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">{row.detail}</div>
        </div>
      ))}
    </div>
  );
}

function RankList({ rows = [], empty = "Chưa có tín hiệu" }) {
  if (!rows.length) return <Empty className="!py-10" title={empty} hint="Chưa đủ dữ liệu để xếp hạng." />;
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={`${row.key}-${index}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="truncate font-medium text-slate-200">{row.name}</div>
            <div className="font-semibold text-white">{format(row.value)}</div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300"
              style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AttributionList({ rows = [], empty = "Chưa có nguồn nổi bật" }) {
  if (!rows.length) return <Empty className="!py-10" title={empty} hint="Cần thêm event và lead mới để xếp hạng." />;

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={`${row.key}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-white">{row.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {format(row.visits)} vào web • {format(row.contacts)} liên hệ • {formatPercent(row.leadRate)} lead/liên hệ
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-emerald-300">{format(row.leads)}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">lead</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryInterest({ rows = [] }) {
  if (!rows.length) return <EmptyChart title="Chưa có danh mục nổi bật" />;
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
  const top = rows[0];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/12 via-slate-950/80 to-blue-500/8 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/85">Dẫn đầu</div>
            <div className="mt-2 truncate text-xl font-semibold text-white">{top.name}</div>
            <div className="mt-1 text-sm text-slate-400">{rate(top.value, total)} tổng tín hiệu danh mục</div>
          </div>
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-right">
            <div className="text-2xl font-semibold text-cyan-100">{format(top.value)}</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">lượt</div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300" style={{ width: `${Math.max(8, (top.value / max) * 100)}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {rows.slice(0, 8).map((row, index) => {
          const value = Number(row.value || 0);
          return (
            <div key={`${row.key || row.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white">{row.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{rate(value, total)} tín hiệu</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-white">{format(value)}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">lượt</div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300"
                  style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DAY_PARTS = [
  { label: "Đêm", range: "00-05", hours: [0, 1, 2, 3, 4, 5], color: COLORS.violet },
  { label: "Sáng", range: "06-11", hours: [6, 7, 8, 9, 10, 11], color: COLORS.cyan },
  { label: "Chiều", range: "12-17", hours: [12, 13, 14, 15, 16, 17], color: COLORS.emerald },
  { label: "Tối", range: "18-23", hours: [18, 19, 20, 21, 22, 23], color: COLORS.amber },
];

function buildHourSummary(rows = []) {
  const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const peak = rows.reduce((best, item) => (Number(item.value || 0) > Number(best.value || 0) ? item : best), rows[0] || { hour: 0, label: "00h", value: 0 });
  const activeHours = rows.filter((item) => Number(item.value || 0) > 0).length;
  const maxPart = Math.max(
    1,
    ...DAY_PARTS.map((part) => part.hours.reduce((sum, hour) => sum + Number(rows[hour]?.value || 0), 0))
  );

  return {
    total,
    peak,
    activeHours,
    peakShare: total ? Math.round((Number(peak.value || 0) / total) * 100) : 0,
    parts: DAY_PARTS.map((part) => {
      const value = part.hours.reduce((sum, hour) => sum + Number(rows[hour]?.value || 0), 0);
      return { ...part, value, level: value / maxPart };
    }),
  };
}

function ActivityRhythm({ rows = [] }) {
  const summary = buildHourSummary(rows);
  if (!summary.total) {
    return <Empty className="!py-10" title="Chưa có nhịp tương tác" hint="Khi có event trong 30 ngày gần nhất, dashboard sẽ hiển thị giờ cao điểm và phân bổ theo buổi." />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 divide-x divide-slate-800 border-y border-slate-800">
        <div className="py-3 pr-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tổng event</div>
          <div className="mt-1 text-2xl font-semibold text-white">{format(summary.total)}</div>
        </div>
        <div className="px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cao điểm</div>
          <div className="mt-1 text-2xl font-semibold text-cyan-200">{summary.peak.label}</div>
        </div>
        <div className="py-3 pl-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Độ phủ</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-200">{summary.activeHours}/24</div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Nhịp theo giờ</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Đỉnh {format(summary.peak.value)} event, chiếm {summary.peakShare}% tín hiệu 30 ngày.
            </div>
          </div>
          <Badge variant="info">{summary.peak.label}</Badge>
        </div>
        <div className="flex h-36 items-end gap-px sm:gap-1.5">
          {rows.map((item) => {
            const value = Number(item.value || 0);
            const isPeak = item.hour === summary.peak.hour && value > 0;
            const height = value ? Math.max(14, item.level * 100) : 3;
            return (
              <div key={item.hour} className="group flex min-w-0 flex-1 flex-col items-center gap-2" title={`${item.label}: ${format(value)} sự kiện`}>
                <div className="flex h-28 w-full items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-lg transition",
                      isPeak
                        ? "bg-gradient-to-t from-blue-500 via-cyan-300 to-emerald-200 shadow-[0_0_22px_rgba(34,211,238,0.45)]"
                        : value
                          ? "bg-gradient-to-t from-blue-500/75 to-cyan-300/85"
                          : "bg-slate-800/70"
                    )}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <div className={cn("font-mono text-[7px] leading-none tabular-nums sm:text-[9px]", isPeak ? "text-cyan-200" : "text-slate-500")}>
                  {String(item.hour).padStart(2, "0")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {summary.parts.map((part) => (
          <div key={part.label} className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-slate-200">{part.label}</div>
                <div className="text-[11px] text-slate-500">{part.range}</div>
              </div>
              <div className="text-sm font-semibold text-white">{format(part.value)}</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(part.value ? 8 : 0, part.level * 100)}%`,
                  background: part.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductTable({ rows = [], categoryLabels = new Map() }) {
  return (
    <Section title="Mẫu đang được quan tâm" description="Ưu tiên theo impression, detail, liên hệ và lead thực tế." compact className="min-w-0">
      {!rows.length ? (
        <Empty className="!py-10" title="Chưa có tín hiệu sản phẩm" hint="Khi khách mở detail, bấm Messenger hoặc gửi tư vấn, danh sách này sẽ được cập nhật." />
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {rows.slice(0, 8).map((row) => (
            <div key={row.pid} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex items-center gap-3">
                {row.image ? (
                  <img src={cdnThumb(row.image, 72, 72, 65)} alt="" className="h-12 w-12 rounded-xl border border-slate-800 object-cover" loading="lazy" />
                ) : (
                  <div className="h-12 w-12 rounded-xl border border-slate-800 bg-slate-900" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white">{row.name}</div>
                  <div className="truncate text-xs text-slate-500">{categoryLabelOf(row.category || row.pid, categoryLabels)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-rose-300">{format(row.score)}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">điểm</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-2 py-2">
                  <div className="font-semibold text-white">{format(row.impression)}</div>
                  <div className="mt-0.5 text-slate-500">Hiển thị</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-2 py-2">
                  <div className="font-semibold text-white">{format(row.detail)}</div>
                  <div className="mt-0.5 text-slate-500">Detail</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-2 py-2">
                  <div className="font-semibold text-white">{format(row.messenger)}</div>
                  <div className="mt-0.5 text-slate-500">Liên hệ</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-2 py-2">
                  <div className="font-semibold text-white">{format(row.consult)}</div>
                  <div className="mt-0.5 text-slate-500">Tư vấn</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
                <div>{formatPercent(row.detailRate)} mở/hiển thị</div>
                <div>{formatPercent(row.contactRate)} chat/detail</div>
                <div>{formatPercent(row.leadRate)} lead/chat</div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden max-w-full overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="py-3 pr-3">Mẫu</th>
                <th className="py-3 text-right">Hiển thị</th>
                <th className="py-3 text-right">Detail</th>
                <th className="py-3 text-right">Liên hệ</th>
                <th className="py-3 text-right">Tư vấn</th>
                <th className="py-3 text-right">Mở/hiển thị</th>
                <th className="py-3 text-right">Chat/detail</th>
                <th className="py-3 text-right">Điểm</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.pid} className="border-b border-slate-800/80 last:border-b-0">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      {row.image ? (
                        <img src={cdnThumb(row.image, 72, 72, 65)} alt="" className="h-11 w-11 rounded-xl border border-slate-800 object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-[11px] text-slate-600">
                          Trống
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{row.name}</div>
                        <div className="truncate text-xs text-slate-500">{categoryLabelOf(row.category || row.pid, categoryLabels)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right text-slate-300">{format(row.impression)}</td>
                  <td className="py-3 text-right text-slate-300">{format(row.detail)}</td>
                  <td className="py-3 text-right text-slate-300">{format(row.messenger)}</td>
                  <td className="py-3 text-right text-slate-300">{format(row.consult)}</td>
                  <td className="py-3 text-right text-slate-300">{formatPercent(row.detailRate)}</td>
                  <td className="py-3 text-right text-slate-300">{formatPercent(row.contactRate)}</td>
                  <td className="py-3 text-right font-semibold text-rose-300">{format(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Section>
  );
}

function LeadsTable({ rows = [] }) {
  return (
    <Section title="Yêu cầu tư vấn gần đây" compact className="min-w-0">
      {!rows.length ? (
        <Empty className="!py-10" title="Chưa có form tư vấn" hint="Khi khách gửi thông tin tư vấn, danh sách này sẽ hiện tại đây." />
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {rows.slice(0, 10).map((row) => (
            <div key={row.id} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-white">{row.name || "Chưa có tên"}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.phone || "-"}</div>
                </div>
                <div className="shrink-0 text-xs text-slate-500">{row.ts ? dateFmt.format(new Date(row.ts)) : "-"}</div>
              </div>
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/65 px-3 py-2 text-sm text-slate-300">
                {row.product_name || row.product?.name || row.product_pid || "-"}
              </div>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Ngày cần</div>
                  <div className="mt-1 text-slate-300">{row.needed_date || "-"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Ghi chú</div>
                  <div className="mt-1 line-clamp-2 text-slate-300">{row.note || "-"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden max-w-full overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="py-3 pr-3">Thời gian</th>
                <th className="py-3 pr-3">Khách</th>
                <th className="py-3 pr-3">Sản phẩm</th>
                <th className="py-3 pr-3">Ngày cần</th>
                <th className="py-3">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.id} className="border-b border-slate-800/80 last:border-b-0 align-top">
                  <td className="whitespace-nowrap py-3 pr-3 text-slate-400">
                    {row.ts ? dateFmt.format(new Date(row.ts)) : "-"}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-white">{row.name || "Chưa có tên"}</div>
                    <div className="text-xs text-slate-500">{row.phone || "-"}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-300">{row.product_name || row.product?.name || row.product_pid || "-"}</td>
                  <td className="whitespace-nowrap py-3 pr-3 text-slate-300">{row.needed_date || "-"}</td>
                  <td className="py-3 text-slate-400">{row.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Section>
  );
}

function EventFeed({ rows = [] }) {
  if (!rows.length) return <Empty className="!py-10" title="Chưa có sự kiện gần đây" hint="Các tương tác mới nhất sẽ hiển thị tại đây." />;

  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((event) => (
        <div key={event.id || `${event.type}-${event.ts}`} className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.75)]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="truncate text-sm font-medium text-white">{EVENT_LABELS[event.type] || event.type || "Sự kiện"}</div>
              <div className="shrink-0 text-xs text-slate-500">{event.ts ? dateFmt.format(new Date(event.ts)) : "-"}</div>
            </div>
            <div className="mt-1 line-clamp-1 text-sm text-slate-400">
              {event.product?.name || event.query || event.category || event.tag || event.source || "Không có chi tiết"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPanel() {
  const [tick, setTick] = useState(0);
  const [periodDays, setPeriodDays] = useState(14);
  const [remote, setRemote] = useState({ loading: true, ok: false, events: [], leads: [], source: "loading", error: "" });

  const products = useMemo(() => {
    const list = readLS(LS.PRODUCTS, []);
    return Array.isArray(list) ? list : [];
  }, [tick]);
  const menu = useMemo(() => {
    const list = readLS(LS.MENU, []);
    return Array.isArray(list) ? list : [];
  }, [tick]);
  const categoryConfig = useMemo(() => {
    const list = readLS(LS.CATEGORIES, []);
    return Array.isArray(list) ? list : [];
  }, [tick]);
  const localEvents = useMemo(() => readCustomerEvents(), [tick]);
  const localLeads = useMemo(() => readConsultLeads(), [tick]);
  const mergedEvents = useMemo(() => mergeEvents(remote.events || [], localEvents), [remote.events, localEvents]);
  const events = useMemo(() => filterBusinessEvents(mergedEvents), [mergedEvents]);
  const leads = useMemo(() => mergeLeads(remote.leads || [], localLeads), [remote.leads, localLeads]);

  const periodEvents = useMemo(() => events.filter((event) => isInWindow(event.ts, periodDays)), [events, periodDays]);
  const periodLeads = useMemo(() => leads.filter((lead) => isInWindow(lead.ts, periodDays)), [leads, periodDays]);
  const periodSummary = useMemo(() => summarizeCustomerBehavior(products, { events: periodEvents, leads: periodLeads }), [products, periodEvents, periodLeads]);
  const trend = useMemo(() => buildTrend(events, leads, periodDays), [events, leads, periodDays]);
  const mix = useMemo(() => buildMix(periodSummary, periodEvents, periodLeads), [periodSummary, periodEvents, periodLeads]);
  const hourly = useMemo(() => buildHourly(events), [events]);
  const funnel = useMemo(() => buildFunnel(periodSummary), [periodSummary]);
  const categoryLabels = useMemo(() => buildCategoryLabelMap(menu, categoryConfig), [menu, categoryConfig]);
  const searchRows = useMemo(() => normalizeRankRows(periodSummary.topSearches), [periodSummary.topSearches]);
  const zeroSearchRows = useMemo(() => normalizeRankRows(periodSummary.topZeroSearches), [periodSummary.topZeroSearches]);
  const tagRows = useMemo(() => normalizeRankRows(periodSummary.topTags), [periodSummary.topTags]);
  const categoryRows = useMemo(() => normalizeRankRows(periodSummary.topCategories, 8, categoryLabels), [periodSummary.topCategories, categoryLabels]);
  const sourceRows = useMemo(() => buildAttributionRows(periodEvents, periodLeads, "source"), [periodEvents, periodLeads]);
  const campaignRows = useMemo(() => buildAttributionRows(periodEvents, periodLeads, "campaign"), [periodEvents, periodLeads]);
  const actionInsights = useMemo(() => buildActionInsights(periodSummary, sourceRows, campaignRows), [periodSummary, sourceRows, campaignRows]);
  const decisionCards = useMemo(
    () => buildDecisionCards(periodSummary, sourceRows, campaignRows, categoryRows, searchRows, zeroSearchRows),
    [periodSummary, sourceRows, campaignRows, categoryRows, searchRows, zeroSearchRows]
  );
  const playbookRows = useMemo(
    () => buildPlaybookRows(periodSummary, sourceRows, campaignRows, categoryRows, searchRows, zeroSearchRows),
    [periodSummary, sourceRows, campaignRows, categoryRows, searchRows, zeroSearchRows]
  );
  const contentPlanRows = useMemo(
    () => buildContentPlanRows(periodSummary, categoryRows, searchRows, zeroSearchRows, tagRows),
    [periodSummary, categoryRows, searchRows, zeroSearchRows, tagRows]
  );
  const opportunityRows = useMemo(
    () => buildOpportunityRows(periodSummary, zeroSearchRows),
    [periodSummary, zeroSearchRows]
  );

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    window.addEventListener(CUSTOMER_BEHAVIOR_EVENT, refresh);
    window.addEventListener(REMOTE_BEHAVIOR_CACHE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CUSTOMER_BEHAVIOR_EVENT, refresh);
      window.removeEventListener(REMOTE_BEHAVIOR_CACHE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const refreshRemote = (force = false) => {
    let stopped = false;
    setRemote((prev) => ({ ...prev, loading: true }));
    loadRemoteCustomerBehavior({ force })
      .then((data) => {
        if (!stopped) setRemote({ loading: false, ...data });
      })
      .catch((error) => {
        if (!stopped) {
          setRemote({
            loading: false,
            ok: false,
            events: [],
            leads: [],
            source: "remote",
            error: String(error?.message || error || "remote_failed"),
          });
        }
      });
    return () => {
      stopped = true;
    };
  };

  useEffect(() => {
    const stop = refreshRemote(false);
    const interval = window.setInterval(() => refreshRemote(false), 10 * 60 * 1000);
    return () => {
      stop();
      window.clearInterval(interval);
    };
  }, []);

  const totalInPeriod = periodEvents.length;
  const sourceLabel = remote.loading
    ? "Đang tải remote"
    : remote.ok
      ? `Remote ${remote.source || "Events"}`
      : "Local fallback";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Phân tích hành vi khách"
        description="Bảng tín hiệu từ frontend, tập trung vào lượt xem mẫu, liên hệ, tìm kiếm và lead tư vấn."
        compact
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSwitch value={periodDays} onChange={setPeriodDays} />
            <Button type="button" variant="secondary" loading={remote.loading} onClick={() => refreshRemote(true)}>
              Cập nhật tracking
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (window.confirm("Xóa toàn bộ dữ liệu hành vi cục bộ trên trình duyệt này?")) clearCustomerBehavior();
              }}
            >
              Xóa dữ liệu local
            </Button>
          </div>
        }
        chips={
          <>
            <Badge variant={remote.ok ? "success" : remote.loading ? "info" : "warning"}>{sourceLabel}</Badge>
            <Badge variant="info">{format(events.length)} business event</Badge>
            <Badge variant="success">{format(leads.length)} lead</Badge>
            {remote.error ? <Badge variant="warning">{remote.error}</Badge> : null}
          </>
        }
      />

      <Section title="Kết luận kinh doanh" description="Các quyết định ưu tiên từ dữ liệu tracking trong kỳ đang chọn." compact>
        <DecisionBoard rows={decisionCards} />
      </Section>

      <Section title="Phương hướng hành động" description="Tách rõ việc cần làm cho bài đăng, quảng cáo, sản phẩm và kênh tiếp cận." compact>
        <PlaybookGrid rows={playbookRows} />
      </Section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Section title="Kế hoạch nội dung gần nhất" description="Chủ đề nên đăng dựa trên search, danh mục, tag và mẫu có liên hệ." compact>
          <ContentPlan rows={contentPlanRows} />
        </Section>
        <Section title="Cơ hội xử lý nhanh" description="Mẫu nên đẩy, mẫu cần sửa, nhu cầu thiếu hàng hoặc thiếu tag." compact>
          <OpportunityList rows={opportunityRows} />
        </Section>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-8">
        <MetricCard label="Event trong kỳ" value={totalInPeriod} meta={`${periodDays} ngày gần nhất`} tone="blue" />
        <MetricCard label="Lượt vào web" value={periodSummary.totals.pageViews} meta={`${format(periodSummary.totals.sessions)} session trong kỳ`} tone="neutral" />
        <MetricCard label="Hiển thị mẫu" value={periodSummary.totals.impressions} meta={`${rate(periodSummary.totals.impressions, Math.max(periodSummary.totals.pageViews, 1))} từ vào web`} tone="neutral" />
        <MetricCard label="Mở detail" value={periodSummary.totals.details} meta="Lượt xem chi tiết sản phẩm" tone="violet" />
        <MetricCard label="Liên hệ" value={periodSummary.totals.messenger} meta={`${rate(periodSummary.totals.messenger, periodSummary.totals.details)} từ detail`} tone="rose" />
        <MetricCard label="Tìm kiếm" value={periodSummary.totals.searches} meta={`${format(periodSummary.totals.searchSuggestionClicks)} bấm gợi ý`} tone="amber" />
        <MetricCard label="Search 0 kết quả" value={periodSummary.totals.zeroResultSearches} meta={`${rate(periodSummary.totals.zeroResultSearches, Math.max(periodSummary.totals.searches, 1))} trên search`} tone="amber" />
        <MetricCard label="Chọn size" value={periodSummary.totals.sizeSelects} meta="Nhu cầu size khách đang cân nhắc" tone="neutral" />
        <MetricCard label="Yêu thích" value={periodSummary.totals.favoriteAdds} meta={`${format(periodSummary.totals.favoriteRemoves)} lượt bỏ yêu thích`} tone="violet" />
        <MetricCard label="Mở form tư vấn" value={periodSummary.totals.consultOpens} meta={`${rate(periodSummary.totals.consultStarts, Math.max(periodSummary.totals.consultOpens, 1))} bắt đầu nhập`} tone="violet" />
        <MetricCard label="Bỏ form" value={periodSummary.totals.consultAbandons} meta={`${rate(periodSummary.totals.consultAbandons, Math.max(periodSummary.totals.consultStarts, 1))} từ đã nhập`} tone="rose" />
        <MetricCard label="Lead tư vấn" value={periodSummary.totals.consults} meta={`${rate(periodSummary.totals.consults, Math.max(periodSummary.totals.messenger, 1))} từ liên hệ`} tone="emerald" />
        <MetricCard label="Copy link" value={periodSummary.totals.shares} meta={`${format(periodSummary.totals.favoritesPageOpens)} lượt mở yêu thích`} tone="blue" />
      </div>

      <Section title="Gợi ý hành động" description="Ưu tiên việc nên làm từ dữ liệu tracking trong kỳ đang chọn." compact>
        <InsightList rows={actionInsights} />
      </Section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)]">
        <Section title="Xu hướng hành vi" description={`Diễn biến trong ${periodDays} ngày gần nhất.`} compact>
          {periodEvents.length || periodLeads.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsDetailArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.34} />
                      <stop offset="100%" stopColor={COLORS.blue} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Vào web" stroke={COLORS.cyan} strokeWidth={2.4} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Hiển thị mẫu" stroke={COLORS.slate} strokeWidth={2} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Mở detail" stroke={COLORS.blue} strokeWidth={2.5} fill="url(#analyticsDetailArea)" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Liên hệ" stroke={COLORS.rose} strokeWidth={2.2} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Tìm kiếm" stroke={COLORS.amber} strokeWidth={2.2} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Tư vấn" stroke={COLORS.emerald} strokeWidth={2.2} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="0 kết quả" stroke={COLORS.amber} strokeWidth={1.8} fill="transparent" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </Section>

        <Section title="Cơ cấu tương tác" description="Tỷ trọng event trong kỳ đang chọn." compact>
          {mix.length ? (
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] xl:grid-cols-1">
              <div className="h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4} stroke="transparent" isAnimationActive={false}>
                      {mix.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {mix.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/62 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                      <span>{item.name}</span>
                    </div>
                    <span className="font-semibold text-white">{format(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart />
          )}
        </Section>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <Section title="Phễu chuyển đổi" description="Từ quan tâm tới hành động liên hệ và tư vấn." compact>
          <Funnel rows={funnel} />
        </Section>

        <Section title="Danh mục được quan tâm" description="Dùng label từ menu Google Sheet, không hiển thị key kỹ thuật." compact>
          <CategoryInterest rows={categoryRows} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Section title="Từ khóa được tìm nhiều" compact>
          <RankList rows={searchRows} empty="Chưa có từ khóa nổi bật" />
        </Section>
        <Section title="Từ khóa 0 kết quả" compact>
          <RankList rows={zeroSearchRows} empty="Chưa có search 0 kết quả" />
        </Section>
        <Section title="Nguồn vào web" compact>
          <AttributionList rows={sourceRows} empty="Chưa có nguồn rõ ràng" />
        </Section>
        <Section title="Campaign tạo lead" compact>
          <AttributionList rows={campaignRows} empty="Chưa có campaign nổi bật" />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Tag đang hot" compact>
          <RankList rows={tagRows} empty="Chưa có tag nổi bật" />
        </Section>
        <Section title="Nhịp tương tác theo giờ" description="Giờ cao điểm của các event business trong 30 ngày." compact>
          <ActivityRhythm rows={hourly} />
        </Section>
      </div>

      <ProductTable rows={periodSummary.topProducts} categoryLabels={categoryLabels} />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <LeadsTable rows={periodSummary.recentLeads} />
        <Section title="Sự kiện gần đây" compact>
          <EventFeed rows={periodSummary.recentEvents} />
        </Section>
      </div>
    </div>
  );
}
