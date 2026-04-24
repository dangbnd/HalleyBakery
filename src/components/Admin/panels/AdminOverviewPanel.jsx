import React, { useEffect, useMemo, useState } from "react";
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
import { LS, getAuthUser, readAudit, readLS } from "../../../utils.js";
import {
  filterReportEvents,
  readConsultLeads,
  readCustomerEvents,
  summarizeCustomerBehavior,
  timestampOf,
} from "../../../utils/customerBehavior.js";
import { loadRemoteCustomerBehavior, mergeEvents, mergeLeads } from "../../../services/remoteBehavior.js";
import { getConfig, KEYS } from "../../../utils/config.js";
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

const DATA_COLORS = [COLORS.cyan, COLORS.emerald, COLORS.blue, COLORS.violet, COLORS.amber, COLORS.rose];

function fmt(value = 0) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0));
}

function pct(value = 0) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
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

function isInWindow(ts = 0, days = 14, offsetDays = 0) {
  const time = timestampOf(ts, 0);
  const end = startOfDay(Date.now()) - offsetDays * 86_400_000 + 86_400_000;
  const start = end - days * 86_400_000;
  return time >= start && time < end;
}

function tagsOf(value) {
  if (Array.isArray(value)) return value.map((x) => String(x || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,|;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function imagesOf(product = {}) {
  if (Array.isArray(product.images)) return product.images.filter(Boolean);
  return String(product.images || product.image || product.image_url || product.thumbnail || product.cover || "")
    .split(/[\n,|;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function hasPrice(product = {}) {
  const values = [];
  const base = Number(product.price);
  if (Number.isFinite(base) && base > 0) values.push(base);

  if (product.priceBySize && typeof product.priceBySize === "object") {
    Object.values(product.priceBySize).forEach((v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) values.push(n);
    });
  }

  if (Array.isArray(product?.pricing?.table)) {
    product.pricing.table.forEach((row) => {
      const n = Number(row?.price);
      if (Number.isFinite(n) && n > 0) values.push(n);
    });
  }

  return values.length > 0;
}

function productVisibility(product = {}) {
  return String(product.visibility || product.show || "").trim().toLowerCase();
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
      "Xem mẫu": 0,
      "Liên hệ": 0,
      "Tìm kiếm": 0,
      "Lead": 0,
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
    if (event.type === "detail_open") row["Xem mẫu"] += 1;
    if (event.type === "messenger_click" || event.type === "contact_entry_click") row["Liên hệ"] += 1;
    if (event.type === "search_submit") row["Tìm kiếm"] += 1;
    if (event.type === "search_zero_result") row["0 kết quả"] += 1;
  });

  leads.forEach((lead) => {
    const ts = timestampOf(lead.ts, 0);
    if (!isInWindow(ts, periodDays)) return;
    const row = byKey.get(dayKey(ts));
    if (row) row["Lead"] += 1;
  });

  return rows;
}

function countEvents(events = [], periodDays = 14, predicate = () => true, offsetDays = 0) {
  return events.filter((event) => isInWindow(event.ts, periodDays, offsetDays) && predicate(event)).length;
}

function countLeads(leads = [], periodDays = 14, offsetDays = 0) {
  return leads.filter((lead) => isInWindow(lead.ts, periodDays, offsetDays)).length;
}

function calcDelta(current = 0, previous = 0) {
  if (!previous && !current) return { text: "không đổi", tone: "neutral" };
  if (!previous) return { text: "+100%", tone: "up" };
  const value = ((current - previous) / previous) * 100;
  return {
    text: `${value >= 0 ? "+" : ""}${Math.round(value)}%`,
    tone: value >= 0 ? "up" : "down",
  };
}

function buildCatalogHealth(products = []) {
  const stats = {
    total: products.length,
    active: 0,
    hidden: 0,
    adminOnly: 0,
    missingImages: 0,
    missingTags: 0,
    missingPrice: 0,
    missingDescription: 0,
    ready: 0,
  };

  products.forEach((product) => {
    const hidden = product.active === false || productVisibility(product) === "hidden";
    const adminOnly = productVisibility(product) === "admin";
    const hasImages = imagesOf(product).length > 0;
    const hasTags = tagsOf(product.tags).length > 0;
    const priced = hasPrice(product);
    const hasDescription = !!String(product.description || product.desc || "").trim();

    if (hidden) stats.hidden += 1;
    else stats.active += 1;
    if (adminOnly) stats.adminOnly += 1;
    if (!hasImages) stats.missingImages += 1;
    if (!hasTags) stats.missingTags += 1;
    if (!priced) stats.missingPrice += 1;
    if (!hasDescription) stats.missingDescription += 1;
    if (!hidden && hasImages && hasTags && priced) stats.ready += 1;
  });

  const review = Math.max(0, stats.total - stats.ready - stats.hidden);
  const donut = [
    { name: "Sẵn sàng", value: stats.ready, color: COLORS.emerald },
    { name: "Cần bổ sung", value: review, color: COLORS.amber },
    { name: "Đang ẩn", value: stats.hidden, color: COLORS.rose },
  ].filter((item) => item.value > 0);

  if (!donut.length) donut.push({ name: "Chưa có dữ liệu", value: 1, color: COLORS.slate });

  return {
    ...stats,
    score: stats.total ? Math.round((stats.ready / stats.total) * 100) : 0,
    donut,
  };
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

function fingerprint(value = "") {
  return String(value || "")
    .replace(/\([^)]*\)/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function productDisplayName(name = "", categoryKey = "", categoryLabel = "") {
  const raw = String(name || "").trim();
  if (!raw) return categoryLabel || "Mẫu chưa đặt tên";
  if (categoryLabel && fingerprint(raw) === fingerprint(categoryKey)) return categoryLabel;
  return raw;
}

function buildTopCategories(behavior, products = [], categoryLabels = new Map()) {
  const fromBehavior = (behavior.topCategories || []).slice(0, 8).map((row) => ({
    key: row.key || row.label,
    name: categoryLabelOf(row.key || row.label, categoryLabels),
    value: row.count,
  }));
  if (fromBehavior.length) return fromBehavior;

  const map = new Map();
  products.forEach((product) => {
    const key = String(product.category || "Chưa phân loại").trim() || "Chưa phân loại";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, value]) => ({ key, name: categoryLabelOf(key, categoryLabels), value }));
}

function buildTopProducts(behavior, products = [], categoryLabels = new Map()) {
  const fromBehavior = (behavior.topProducts || []).slice(0, 8).map((row) => ({
    pid: row.pid,
    name: productDisplayName(row.name || row.pid, row.category, categoryLabelOf(row.category, categoryLabels)),
    value: row.score || row.total || row.detail || 0,
    category: row.category ? categoryLabelOf(row.category, categoryLabels) : "Chưa phân loại",
    detail: Number(row.detail || 0),
    messenger: Number(row.messenger || 0),
    favorite: Number(row.favorite || 0),
    consult: Number(row.consult || 0),
    image: row.image || "",
  }));
  if (fromBehavior.length) return fromBehavior;

  return products.slice(0, 8).map((product, index) => ({
    pid: product.pid || product.id || product.key || `catalog-${index}`,
    name: productDisplayName(product.name || product.title || `Mẫu ${index + 1}`, product.category, categoryLabelOf(product.category, categoryLabels)),
    value: Math.max(1, Number(product.popular || 0) || 1),
    category: product.category ? categoryLabelOf(product.category, categoryLabels) : "Catalog",
    detail: 0,
    messenger: 0,
    favorite: 0,
    consult: 0,
    image: imagesOf(product)[0] || "",
  }));
}

function buildHourHeat(events = []) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
  const usefulTypes = new Set([
    "page_view",
    "search_submit",
    "search_results_view",
    "search_zero_result",
    "category_results_view",
    "detail_open",
    "messenger_click",
    "contact_entry_click",
    "consult_submit",
    "category_click",
    "tag_click",
  ]);
  events.forEach((event) => {
    const ts = timestampOf(event.ts, 0);
    if (!isInWindow(ts, 30)) return;
    if (!usefulTypes.has(event.type)) return;
    buckets[new Date(ts).getHours()].value += 1;
  });
  const max = Math.max(1, ...buckets.map((item) => item.value));
  return buckets.map((item) => ({
    ...item,
    label: `${String(item.hour).padStart(2, "0")}h`,
    level: item.value / max,
  }));
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-2xl">
      <div className="mb-1 font-semibold text-white">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={`${item.name}-${item.color}`} className="flex items-center gap-2 text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            <span>{item.name}: {fmt(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ title = "Chưa có dữ liệu biểu đồ" }) {
  return <Empty className="!py-10" title={title} hint="Dữ liệu sẽ rõ hơn khi khách bắt đầu xem mẫu, tìm kiếm hoặc gửi tư vấn." />;
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

function Sparkline({ data = [], dataKey = "value", color = COLORS.blue }) {
  return (
    <div className="h-12 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.1}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({ label, value, meta, color = COLORS.blue, sparkData, sparkKey = "total", delta }) {
  const deltaClass =
    delta?.tone === "up" ? "text-emerald-300" : delta?.tone === "down" ? "text-rose-300" : "text-slate-400";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/78 p-4 shadow-[0_16px_34px_rgba(2,6,23,0.26)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="mt-3 text-3xl font-semibold leading-none text-white">{fmt(value)}</div>
        </div>
        <Sparkline data={sparkData} dataKey={sparkKey} color={color} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="line-clamp-1 text-slate-400">{meta}</span>
        <span className={cn("shrink-0 font-semibold", deltaClass)}>{delta?.text || "mới"}</span>
      </div>
    </div>
  );
}

function HealthMetric({ label, value, tone = "neutral" }) {
  const tones = {
    neutral: "text-slate-300",
    blue: "text-blue-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    violet: "text-violet-300",
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold", tones[tone] || tones.neutral)}>{fmt(value)}</div>
    </div>
  );
}

function colorAt(index = 0) {
  return DATA_COLORS[index % DATA_COLORS.length];
}

function shareOf(value = 0, total = 0) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total || 0)) * 100);
}

function initialsOf(value = "") {
  return String(value || "H")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function signalLevel(value = 0, max = 1) {
  const ratio = Number(value || 0) / Math.max(1, Number(max || 1));
  if (ratio >= 0.72) return "Rất nóng";
  if (ratio >= 0.38) return "Đang lên";
  return "Theo dõi";
}

function TopList({ rows = [], empty = "Chưa có tín hiệu" }) {
  if (!rows.length) return <Empty className="!py-10" title={empty} hint="Chưa đủ dữ liệu để xếp hạng." />;
  const visible = rows.slice(0, 6);
  const leader = visible[0];
  const max = Math.max(1, ...visible.map((row) => Number(row.value || 0)));
  const total = visible.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const leaderContacts = Number(leader.messenger || 0) + Number(leader.consult || 0);
  const conversion = leader.detail ? shareOf(leaderContacts, leader.detail) : 0;
  const image = leader.image ? cdnThumb(leader.image, 420, 260, 70) : "";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 xl:border-r xl:border-slate-800 xl:pr-5">
        <div className="relative h-48 overflow-hidden rounded-2xl bg-slate-950">
          {image ? (
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-78" loading="lazy" />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(34,211,238,0.25),rgba(15,23,42,0.45)_44%,rgba(251,191,36,0.18))]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/42 to-slate-950/5" />
          <div className="relative flex h-full flex-col justify-end p-4">
            <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-slate-950/58 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Mẫu dẫn đầu
            </div>
            {!image ? (
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-2xl font-semibold text-white">
                {initialsOf(leader.name)}
              </div>
            ) : null}
            <div className="line-clamp-2 text-2xl font-semibold leading-tight text-white">{leader.name}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full bg-white/10 px-2.5 py-1">{leader.category || "Catalog"}</span>
              <span className="rounded-full bg-cyan-400/12 px-2.5 py-1 text-cyan-100">{fmt(leader.value)} điểm</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-slate-800 border-y border-slate-800">
          <div className="py-3 pr-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tỷ trọng</div>
            <div className="mt-1 text-xl font-semibold text-cyan-200">{pct(shareOf(leader.value, total))}</div>
          </div>
          <div className="px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Liên hệ</div>
            <div className="mt-1 text-xl font-semibold text-emerald-200">{fmt(leaderContacts)}</div>
          </div>
          <div className="py-3 pl-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tỷ lệ</div>
            <div className="mt-1 text-xl font-semibold text-amber-200">{pct(conversion)}</div>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold uppercase tracking-[0.16em] text-slate-500">Tín hiệu top mẫu</span>
            <span className="text-slate-400">{fmt(total)} điểm quan tâm</span>
          </div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800">
            {visible.map((row, index) => {
              const width = Math.max(total ? (Number(row.value || 0) / total) * 100 : 0, 4);
              return (
                <div
                  key={`${row.pid || row.name}-${index}-segment`}
                  className="h-full"
                  title={`${row.name}: ${fmt(row.value)} điểm`}
                  style={{ width: `${width}%`, background: colorAt(index) }}
                />
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-slate-800">
          {visible.map((row, index) => {
            const value = Number(row.value || 0);
            const contacts = Number(row.messenger || 0) + Number(row.consult || 0);
            const color = colorAt(index);
            return (
              <div key={`${row.pid || row.name}-${index}`} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white" style={{ boxShadow: `inset 0 -2px 0 ${color}` }}>
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm font-semibold text-white">{row.name}</div>
                    <span className="hidden shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400 sm:inline">
                      {signalLevel(value, max)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="truncate">{row.category || "Catalog"}</span>
                    <span>{fmt(row.detail || 0)} xem</span>
                    <span>{fmt(contacts)} liên hệ</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">{fmt(value)}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">điểm</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryInterest({ rows = [] }) {
  if (!rows.length) return <EmptyChart title="Chưa có danh mục nổi bật" />;
  const visible = rows.slice(0, 6);
  const total = visible.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const max = Math.max(1, ...visible.map((row) => Number(row.value || 0)));
  const top = visible[0];
  const second = visible[1];
  const topShare = shareOf(top.value, total);
  const topThreeShare = shareOf(visible.slice(0, 3).reduce((sum, row) => sum + Number(row.value || 0), 0), total);
  const gap = Math.max(0, Number(top.value || 0) - Number(second?.value || 0));
  const insight =
    topShare >= 50
      ? `${top.name} đang kéo phần lớn nhu cầu danh mục.`
      : topThreeShare >= 70
        ? `Top 3 danh mục chiếm ${pct(topThreeShare)} tín hiệu.`
        : "Nhu cầu đang phân tán, nên theo dõi thêm dữ liệu.";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
      <div className="min-w-0 xl:border-r xl:border-slate-800 xl:pr-5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="info">Leader</Badge>
          <span className="text-xs text-slate-500">{fmt(total)} tín hiệu</span>
        </div>
        <div className="mt-4 text-3xl font-semibold leading-tight text-white">{top.name}</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">{insight}</div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-slate-800 border-y border-slate-800">
          <div className="py-3 pr-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Thị phần</div>
            <div className="mt-1 text-2xl font-semibold text-cyan-200">{pct(topShare)}</div>
          </div>
          <div className="px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Top 3</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-200">{pct(topThreeShare)}</div>
          </div>
          <div className="py-3 pl-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cách biệt</div>
            <div className="mt-1 text-2xl font-semibold text-amber-200">{fmt(gap)}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-[0.16em] text-slate-500">Phân bổ</span>
            <span className="text-slate-500">{visible.length} danh mục</span>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-slate-800">
            {visible.map((row, index) => {
              const width = Math.max(total ? (Number(row.value || 0) / total) * 100 : 0, 4);
              return (
                <div
                  key={`${row.key || row.name}-${index}-segment`}
                  className="h-full"
                  title={`${row.name}: ${fmt(row.value)} tín hiệu`}
                  style={{ width: `${width}%`, background: colorAt(index) }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-w-0 divide-y divide-slate-800">
        {visible.map((row, index) => {
          const value = Number(row.value || 0);
          const share = shareOf(value, total);
          const color = colorAt(index);
          return (
            <div key={`${row.key || row.name}-${index}`} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full" style={{ background: color }} />
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="truncate text-sm font-semibold text-white">{row.name}</div>
                  <div className="shrink-0 text-xs text-slate-400">{pct(share)}</div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color }} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-white">{fmt(value)}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">lượt</div>
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
          <div className="mt-1 text-2xl font-semibold text-white">{fmt(summary.total)}</div>
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
              Đỉnh {fmt(summary.peak.value)} event, chiếm {summary.peakShare}% tín hiệu 30 ngày.
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
              <div key={item.hour} className="group flex min-w-0 flex-1 flex-col items-center gap-2" title={`${item.label}: ${fmt(value)} sự kiện`}>
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
              <div className="text-sm font-semibold text-white">{fmt(part.value)}</div>
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

function TaskList({ tasks = [] }) {
  if (!tasks.length) {
    return <Empty className="!py-10" title="Không có việc khẩn" hint="Các kết nối và dữ liệu chính đang ở trạng thái ổn." />;
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.key} className="rounded-2xl border border-slate-800 bg-slate-950/62 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={task.tone}>{task.level}</Badge>
                <div className="font-medium text-white">{task.title}</div>
              </div>
              <div className="mt-1 text-sm leading-5 text-slate-400">{task.detail}</div>
            </div>
            {task.action ? (
              <Button variant="ghost" size="sm" onClick={task.action}>
                Mở
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ rows = [] }) {
  if (!rows.length) {
    return <Empty className="!py-10" title="Chưa có hoạt động quản trị" hint="Khi admin đăng nhập, sửa dữ liệu hoặc thay đổi cấu hình, sự kiện sẽ hiện ở đây." />;
  }

  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((row) => (
        <div key={row.id || `${row.event}-${row.ts}`} className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-300 shadow-[0_0_18px_rgba(96,165,250,0.75)]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{row.event || "event"}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              {row.payload?.user || row.payload?.username || "hệ thống"} - {row.ts ? new Date(row.ts).toLocaleString("vi-VN") : "chưa rõ thời gian"}
            </div>
            <div className="mt-1 line-clamp-1 text-sm text-slate-400">
              {row.payload?.targetUser || row.payload?.name || row.payload?.id || "Không có chi tiết"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function makeTasks({ health, sheetId, gsWebAppUrl, gsToken, driveRootId, googleClientId, behavior, onNavigate }) {
  const tasks = [];

  if (!gsWebAppUrl || !gsToken) {
    tasks.push({
      key: "webapp",
      level: "Cấu hình",
      tone: "warning",
      title: "Thiếu WebApp URL hoặc Admin Token",
      detail: "Các thao tác ghi Sheet, user, sản phẩm và AI tags có thể bị chặn.",
      action: () => onNavigate?.("system", "settings"),
    });
  }
  if (!sheetId) {
    tasks.push({
      key: "sheet",
      level: "Nguồn dữ liệu",
      tone: "danger",
      title: "Chưa có Google Sheet ID",
      detail: "Dashboard và catalog sẽ chỉ dựa vào cache local.",
      action: () => onNavigate?.("system", "settings"),
    });
  }
  if (!driveRootId || !googleClientId) {
    tasks.push({
      key: "drive",
      level: "Media",
      tone: "warning",
      title: "Kho ảnh chưa đủ cấu hình",
      detail: "Upload trực tiếp lên Drive cần root folder và OAuth client ID.",
      action: () => onNavigate?.("media", "upload"),
    });
  }
  const hotProduct = (behavior.topProducts || []).find((row) => row.consult > 0 || row.messenger > 0);
  const lowOpenProduct = (behavior.topProducts || []).find((row) => row.impression >= 8 && row.detailRate < 0.08);
  const lowContactProduct = (behavior.topProducts || []).find((row) => row.detail >= 3 && row.contactRate < 0.18);
  const topZeroSearch = behavior.topZeroSearches?.[0];

  if (hotProduct) {
    tasks.push({
      key: "hot-product",
      level: "Kinh doanh",
      tone: "success",
      title: `Đẩy mẫu ${hotProduct.name}`,
      detail: `${fmt(hotProduct.messenger)} liên hệ, ${fmt(hotProduct.consult)} lead. Nên đưa lên đầu section và dùng làm bài/quảng cáo.`,
      action: () => onNavigate?.("operations", "analytics"),
    });
  }
  if (topZeroSearch) {
    tasks.push({
      key: "zero-search",
      level: "Nhu cầu thiếu",
      tone: "warning",
      title: `Khách tìm "${topZeroSearch.label}" nhưng không có kết quả`,
      detail: `${fmt(topZeroSearch.count)} lượt search 0 kết quả. Cần thêm tag, đổi tên mẫu hoặc bổ sung sản phẩm.`,
      action: () => onNavigate?.("operations", "analytics"),
    });
  }
  if (lowOpenProduct) {
    tasks.push({
      key: "low-open",
      level: "Listing",
      tone: "warning",
      title: `Sửa ảnh/tên mẫu ${lowOpenProduct.name}`,
      detail: `${fmt(lowOpenProduct.impression)} hiển thị nhưng chỉ ${pct(lowOpenProduct.detailRate * 100)} mở detail.`,
      action: () => onNavigate?.("catalog", "products"),
    });
  }
  if (lowContactProduct) {
    tasks.push({
      key: "low-contact",
      level: "Chốt liên hệ",
      tone: "danger",
      title: `Detail chưa chốt: ${lowContactProduct.name}`,
      detail: `${fmt(lowContactProduct.detail)} lượt mở detail nhưng chỉ ${pct(lowContactProduct.contactRate * 100)} liên hệ.`,
      action: () => onNavigate?.("operations", "analytics"),
    });
  }
  if (health.missingImages > 0) {
    tasks.push({
      key: "images",
      level: "Catalog",
      tone: "warning",
      title: `${fmt(health.missingImages)} sản phẩm thiếu ảnh`,
      detail: "Các mẫu thiếu ảnh làm giảm chất lượng catalog và search.",
      action: () => onNavigate?.("catalog", "products"),
    });
  }
  if (health.missingTags > 0) {
    tasks.push({
      key: "tags",
      level: "AI tags",
      tone: "info",
      title: `${fmt(health.missingTags)} sản phẩm thiếu tag`,
      detail: "Gắn tag để cải thiện tìm kiếm, bộ lọc và gợi ý mẫu liên quan.",
      action: () => onNavigate?.("media", "aitags"),
    });
  }
  if ((behavior.totals?.events || 0) === 0) {
    tasks.push({
      key: "analytics",
      level: "Theo dõi",
      tone: "neutral",
      title: "Chưa có tín hiệu hành vi",
      detail: "Chưa có business event trong nguồn tracking hiện tại. Cần khách thật vào web hoặc kiểm tra WebApp tracking.",
      action: () => onNavigate?.("operations", "analytics"),
    });
  }

  return tasks.slice(0, 8);
}

export default function AdminOverviewPanel({ onNavigate }) {
  const [periodDays, setPeriodDays] = useState(14);
  const [remote, setRemote] = useState({ loading: true, ok: false, events: [], leads: [], source: "loading", error: "" });
  const user = useMemo(() => getAuthUser(), []);
  const products = useMemo(() => {
    const list = readLS(LS.PRODUCTS, []);
    return Array.isArray(list) ? list : [];
  }, []);
  const menu = useMemo(() => {
    const list = readLS(LS.MENU, []);
    return Array.isArray(list) ? list : [];
  }, []);
  const categoryConfig = useMemo(() => {
    const list = readLS(LS.CATEGORIES, []);
    return Array.isArray(list) ? list : [];
  }, []);
  const users = useMemo(() => {
    const list = readLS(LS.USERS, []);
    return Array.isArray(list) ? list : [];
  }, []);
  const activity = useMemo(() => readAudit().slice(0, 12), []);
  const localEvents = useMemo(() => readCustomerEvents(), []);
  const localLeads = useMemo(() => readConsultLeads(), []);
  const mergedEvents = useMemo(() => mergeEvents(remote.events || [], localEvents), [remote.events, localEvents]);
  const events = useMemo(() => filterReportEvents(mergedEvents), [mergedEvents]);
  const leads = useMemo(() => mergeLeads(remote.leads || [], localLeads), [remote.leads, localLeads]);
  const behavior = useMemo(() => summarizeCustomerBehavior(products, { events, leads }), [products, events, leads]);

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
    return refreshRemote(false);
  }, []);

  const activeProducts = products.filter((item) => item?.active !== false && productVisibility(item) !== "hidden").length;
  const categories = new Set(products.map((item) => String(item?.category || "").trim()).filter(Boolean));
  const activeUsers = users.filter((item) => item?.active !== false).length;

  const sheetId = String(getConfig(KEYS.SHEET_ID, "") || "").trim();
  const gsWebAppUrl = String(getConfig(KEYS.GS_WEBAPP_URL, "") || "").trim();
  const gsToken = String(getConfig(KEYS.GS_WEBAPP_TOKEN, "") || "").trim();
  const driveRootId = String(getConfig(KEYS.DRIVE_FOLDER_ID, "") || "").trim();
  const googleClientId = String(getConfig(KEYS.GOOGLE_OAUTH_CLIENT_ID, "") || "").trim();
  const lastSyncAt = String(getConfig(KEYS.LAST_SYNC_AT, "") || "").trim();

  const trend = useMemo(() => buildTrend(events, leads, periodDays), [events, leads, periodDays]);
  const health = useMemo(() => buildCatalogHealth(products), [products]);
  const categoryLabels = useMemo(() => buildCategoryLabelMap(menu, categoryConfig), [menu, categoryConfig]);
  const topCategories = useMemo(() => buildTopCategories(behavior, products, categoryLabels), [behavior, products, categoryLabels]);
  const topProducts = useMemo(() => buildTopProducts(behavior, products, categoryLabels), [behavior, products, categoryLabels]);
  const hourHeat = useMemo(() => buildHourHeat(events), [events]);

  const currentDetails = countEvents(events, periodDays, (event) => event.type === "detail_open");
  const prevDetails = countEvents(events, periodDays, (event) => event.type === "detail_open", periodDays);
  const currentPageViews = countEvents(events, periodDays, (event) => event.type === "page_view");
  const prevPageViews = countEvents(events, periodDays, (event) => event.type === "page_view", periodDays);
  const currentContacts = countEvents(events, periodDays, (event) => event.type === "messenger_click" || event.type === "contact_entry_click");
  const prevContacts = countEvents(events, periodDays, (event) => event.type === "messenger_click" || event.type === "contact_entry_click", periodDays);
  const currentSearches = countEvents(events, periodDays, (event) => event.type === "search_submit");
  const prevSearches = countEvents(events, periodDays, (event) => event.type === "search_submit", periodDays);
  const currentLeads = countLeads(leads, periodDays);
  const prevLeads = countLeads(leads, periodDays, periodDays);
  const currentZeroSearches = countEvents(events, periodDays, (event) => event.type === "search_zero_result");
  const prevZeroSearches = countEvents(events, periodDays, (event) => event.type === "search_zero_result", periodDays);

  const tasks = makeTasks({
    health,
    sheetId,
    gsWebAppUrl,
    gsToken,
    driveRootId,
    googleClientId,
    behavior,
    onNavigate,
  });

  const sourceBadges = (
    <>
      <Badge variant="info">{user?.name || user?.username || "Admin"}</Badge>
      <Badge variant={sheetId ? "success" : "warning"}>{sheetId ? "Sheet đã nối" : "Thiếu Sheet"}</Badge>
      <Badge variant={gsWebAppUrl && gsToken ? "success" : "warning"}>{gsWebAppUrl && gsToken ? "WebApp sẵn sàng" : "WebApp thiếu cấu hình"}</Badge>
      <Badge variant={remote.ok ? "success" : remote.loading ? "info" : "warning"}>
        {remote.loading ? "Đang tải tracking" : remote.ok ? `Tracking remote` : "Tracking local"}
      </Badge>
      {remote.error ? <Badge variant="warning">{remote.error}</Badge> : null}
      <Badge variant={lastSyncAt ? "violet" : "neutral"}>{lastSyncAt ? `Sync ${new Date(lastSyncAt).toLocaleDateString("vi-VN")}` : "Chưa có mốc sync"}</Badge>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tổng quan"
        description="Dashboard vận hành catalog, media và tín hiệu khách hàng."
        compact
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSwitch value={periodDays} onChange={setPeriodDays} />
            <Button variant="ghost" size="sm" loading={remote.loading} onClick={() => refreshRemote(true)}>
              Đồng bộ
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate?.("media", "upload")}>
              Upload ảnh
            </Button>
          </div>
        }
        chips={sourceBadges}
      />

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-6">
        <KpiCard
          label="Lượt vào web"
          value={currentPageViews}
          meta={`${fmt(behavior.totals?.pageViews)} page view đã ghi`}
          color={COLORS.cyan}
          sparkData={trend}
          sparkKey="Vào web"
          delta={calcDelta(currentPageViews, prevPageViews)}
        />
        <KpiCard
          label="Lượt xem mẫu"
          value={currentDetails}
          meta={`${fmt(behavior.totals?.details)} tổng detail`}
          color={COLORS.blue}
          sparkData={trend}
          sparkKey="Xem mẫu"
          delta={calcDelta(currentDetails, prevDetails)}
        />
        <KpiCard
          label="Liên hệ nhanh"
          value={currentContacts}
          meta={`${fmt(behavior.totals?.messenger)} lượt Messenger/Zalo`}
          color={COLORS.rose}
          sparkData={trend}
          sparkKey="Liên hệ"
          delta={calcDelta(currentContacts, prevContacts)}
        />
        <KpiCard
          label="Tìm kiếm"
          value={currentSearches}
          meta={`${fmt(behavior.totals?.searches)} truy vấn đã ghi`}
          color={COLORS.amber}
          sparkData={trend}
          sparkKey="Tìm kiếm"
          delta={calcDelta(currentSearches, prevSearches)}
        />
        <KpiCard
          label="Lead tư vấn"
          value={currentLeads}
          meta={`${fmt(leads.length)} lead trong tracking`}
          color={COLORS.emerald}
          sparkData={trend}
          sparkKey="Lead"
          delta={calcDelta(currentLeads, prevLeads)}
        />
        <KpiCard
          label="Search 0 kết quả"
          value={currentZeroSearches}
          meta={`${fmt(behavior.totals?.zeroResultSearches)} lượt không có mẫu`}
          color={COLORS.slate}
          sparkData={trend}
          sparkKey="0 kết quả"
          delta={calcDelta(currentZeroSearches, prevZeroSearches)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.75fr]">
        <Section
          title="Xu hướng tương tác"
          description={`Dữ liệu tracking trong ${periodDays} ngày gần nhất.`}
          compact
        >
          {events.length || leads.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="detailArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.34} />
                      <stop offset="100%" stopColor={COLORS.blue} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="contactArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.rose} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={COLORS.rose} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Vào web" stroke={COLORS.cyan} strokeWidth={2.4} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Xem mẫu" stroke={COLORS.blue} strokeWidth={2.5} fill="url(#detailArea)" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Liên hệ" stroke={COLORS.rose} strokeWidth={2.5} fill="url(#contactArea)" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Lead" stroke={COLORS.emerald} strokeWidth={2} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Tìm kiếm" stroke={COLORS.amber} strokeWidth={2} fill="transparent" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="0 kết quả" stroke={COLORS.slate} strokeWidth={2} fill="transparent" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </Section>

        <Section title="Sức khỏe catalog" description={`${pct(health.score)} sản phẩm sẵn sàng publish.`} compact>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] xl:grid-cols-1">
            <div className="relative h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={health.donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={4}
                    stroke="transparent"
                    isAnimationActive={false}
                  >
                    {health.donut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-semibold text-white">{pct(health.score)}</div>
                <div className="text-xs text-slate-500">ready</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <HealthMetric label="Đang hiển thị" value={activeProducts} tone="blue" />
              <HealthMetric label="Danh mục" value={categories.size} tone="violet" />
              <HealthMetric label="Thiếu ảnh" value={health.missingImages} tone="amber" />
              <HealthMetric label="Thiếu tag" value={health.missingTags} tone="amber" />
              <HealthMetric label="Thiếu giá" value={health.missingPrice} tone="rose" />
              <HealthMetric label="Đang ẩn" value={health.hidden} tone="rose" />
            </div>
          </div>
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Section title="Danh mục được quan tâm" description="Tỷ trọng nhu cầu, leader và độ tập trung theo danh mục." compact>
          <CategoryInterest rows={topCategories} />
        </Section>

        <Section title="Mẫu nổi bật" description="Mẫu đang kéo lượt xem, liên hệ và điểm quan tâm." compact>
          <TopList rows={topProducts} empty="Chưa có mẫu nổi bật" />
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="Nhịp tương tác theo giờ" description="Giờ cao điểm và phân bổ tín hiệu local trong 30 ngày gần nhất." compact>
          <ActivityRhythm rows={hourHeat} />
        </Section>

        <Section title="Việc cần xử lý" compact>
          <TaskList tasks={tasks} />
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Section title="Năng lực vận hành" compact>
          <div className="grid gap-3 sm:grid-cols-2">
            <HealthMetric label="Tài khoản hoạt động" value={activeUsers} tone="emerald" />
            <HealthMetric label="Tổng tài khoản" value={users.length + 1} tone="blue" />
            <HealthMetric label="Sự kiện audit" value={activity.length} tone="violet" />
            <HealthMetric label="Ảnh cần xử lý" value={health.missingImages + health.missingTags} tone="amber" />
          </div>
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/62 p-4 text-sm leading-6 text-slate-400">
            Dashboard đang ưu tiên dữ liệu tracking từ Sheet, có cache local làm dự phòng. Các gợi ý kinh doanh sẽ rõ hơn khi lead được cập nhật trạng thái, doanh thu và lý do mất đơn.
          </div>
        </Section>

        <Section title="Hoạt động gần đây" compact>
          <ActivityFeed rows={activity} />
        </Section>
      </div>
    </div>
  );
}
