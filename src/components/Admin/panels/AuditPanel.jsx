import React, { useEffect, useMemo, useState } from "react";
import { readAudit, readLS, writeLS } from "../../../utils.js";
import { Badge, Button, Empty, Input, PageHeader, Section } from "../ui/primitives.jsx";

const PAGE_SIZE = 30;

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Vừa xong";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  return `${Math.floor(diff / 86_400_000)} ngày trước`;
}

function parseUA(ua) {
  if (!ua) return { browser: "Không rõ", os: "Không rõ", device: "Desktop" };

  let browser = "Khác";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let os = "Khác";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let device = "Desktop";
  if (/Mobile|Android|iPhone/i.test(ua)) device = "Mobile";
  else if (/iPad|Tablet/i.test(ua)) device = "Tablet";

  return { browser, os, device };
}

function groupVisitors(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = entry.ip || `fp:${(entry.ua || "").slice(0, 60)}|${entry.screen || ""}`;
    if (!map.has(key)) {
      const { browser, os, device } = parseUA(entry.ua);
      map.set(key, {
        key,
        ip: entry.ip || "",
        browser,
        os,
        device,
        screen: entry.screen || "",
        lang: entry.lang || "",
        firstSeen: entry.ts,
        lastSeen: entry.ts,
        visits: [],
      });
    }
    const item = map.get(key);
    item.visits.push(entry);
    if (entry.ts > item.lastSeen) item.lastSeen = entry.ts;
    if (entry.ts < item.firstSeen) item.firstSeen = entry.ts;
  }
  return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

const EVENT_LABELS = {
  "product.update": "Cập nhật sản phẩm",
  "product.delete": "Xóa sản phẩm",
  "settings.save": "Lưu cấu hình",
  "user.login": "Đăng nhập",
  "user.logout": "Đăng xuất",
  "user.create": "Tạo tài khoản",
  "user.update": "Sửa tài khoản",
  "user.activate": "Mở khóa tài khoản",
  "user.deactivate": "Khóa tài khoản",
  "user.delete": "Xóa tài khoản",
  "ai.tags.apply": "Áp dụng AI tags",
  "ai.tags.batch": "Chạy AI tags hàng loạt",
};

function eventLabel(event) {
  return EVENT_LABELS[event] || event || "Sự kiện";
}

function eventVariant(event) {
  if (event?.includes("delete")) return "danger";
  if (event?.includes("login") || event?.includes("create") || event?.includes("activate")) return "success";
  if (event?.includes("update") || event?.includes("save") || event?.includes("apply")) return "info";
  return "neutral";
}

function renderDetail(event, payload) {
  if (!payload) return "Không có chi tiết";
  if (event?.includes("product")) {
    return `${payload.name || "Sản phẩm"}${payload.id ? ` • #${payload.id}` : ""}`;
  }
  if (event?.includes("user")) {
    return payload.targetUser || payload.username || payload.user || "Người dùng";
  }
  if (event?.includes("ai.tags")) {
    const name = payload.name || payload.productName || "Sản phẩm";
    const tags = Array.isArray(payload.tags)
      ? payload.tags
      : String(payload.tags || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
    return `${name}${tags.length ? ` • ${tags.slice(0, 4).join(", ")}` : ""}`;
  }
  const entries = Object.entries(payload).filter(([key]) => !["ts", "user", "username"].includes(key));
  if (!entries.length) return "Không có chi tiết";
  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 36)}`)
    .join(" • ");
}

function DeviceBadge({ device }) {
  const variant = device === "Mobile" ? "warning" : device === "Tablet" ? "violet" : "neutral";
  return <Badge variant={variant}>{device}</Badge>;
}

function TabButton({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-blue-500/40 bg-blue-500/15 text-white"
          : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-white"
      }`}
    >
      <span>{label}</span>
      <Badge variant={active ? "info" : "neutral"}>{count}</Badge>
    </button>
  );
}

function Pagination({ page, totalPages, total, setPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-500">
        Trang {page}/{totalPages} • {total} bản ghi
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          Trước
        </Button>
        <Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
          Sau
        </Button>
      </div>
    </div>
  );
}

function VisitorList({ groups, page, setPage }) {
  const [expanded, setExpanded] = useState(null);
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!groups.length) {
    return <Empty icon="👥" title="Chưa có lượt truy cập" hint="Dữ liệu sẽ xuất hiện khi website có người truy cập." />;
  }

  return (
    <Section title="Khách truy cập gần đây" compact>
      <div className="space-y-3">
        {paged.map((group) => {
          const opened = expanded === group.key;
          return (
            <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 py-4 text-left"
                onClick={() => setExpanded((current) => (current === group.key ? null : group.key))}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-lg">
                  {group.device === "Mobile" ? "📱" : group.device === "Tablet" ? "💻" : "🖥️"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate font-mono text-sm font-semibold text-white">{group.ip || "Không có IP"}</div>
                    <DeviceBadge device={group.device} />
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {group.browser} • {group.os} {group.screen ? `• ${group.screen}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Lần cuối: {formatTime(group.lastSeen)} • {relativeTime(group.lastSeen)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{group.visits.length} lượt</Badge>
                  <span className={`text-slate-500 transition ${opened ? "rotate-90" : ""}`}>›</span>
                </div>
              </button>

              {opened ? (
                <div className="border-t border-slate-800 bg-slate-950/90">
                  {group.visits.map((visit, index) => (
                    <div
                      key={visit.id || `${group.key}-${index}`}
                      className="flex flex-col gap-1 border-b border-slate-800 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">{formatTime(visit.ts)}</div>
                        <a
                          href={visit.path || "/"}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="mt-1 block truncate text-sm text-blue-300 hover:text-blue-200"
                        >
                          {visit.path || "/"}
                        </a>
                      </div>
                      <div className="text-xs text-slate-500">
                        {visit.lang || "—"} {visit.screen ? `• ${visit.screen}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <Pagination page={safePage} totalPages={totalPages} total={groups.length} setPage={setPage} />
      </div>
    </Section>
  );
}

function ActivityList({ rows, page, setPage }) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!rows.length) {
    return <Empty icon="🧾" title="Chưa có nhật ký quản trị" hint="Khi admin đăng nhập, sửa dữ liệu hoặc thay đổi cấu hình, sự kiện sẽ hiện ở đây." />;
  }

  return (
    <Section title="Hoạt động quản trị" compact>
      <div className="space-y-3">
        {paged.map((item, index) => (
          <div key={item.id || `${item.event}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={eventVariant(item.event)}>{eventLabel(item.event)}</Badge>
                  <span className="text-xs text-slate-500">{formatTime(item.ts)}</span>
                </div>
                <div className="mt-2 text-sm font-medium text-white">{renderDetail(item.event, item.payload)}</div>
                <div className="mt-1 text-sm text-slate-400">
                  Bởi {item.payload?.user || item.payload?.username || "hệ thống"}
                </div>
              </div>
              <div className="shrink-0 text-xs text-slate-500">{relativeTime(item.ts)}</div>
            </div>
          </div>
        ))}

        <Pagination page={safePage} totalPages={totalPages} total={rows.length} setPage={setPage} />
      </div>
    </Section>
  );
}

export default function AuditPanel() {
  const [tab, setTab] = useState("visitors");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);

  const refresh = () => setVersion((value) => value + 1);
  const visitors = useMemo(() => readLS("visitors", []), [version]);
  const activities = useMemo(() => readAudit(), [version]);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tab, query]);

  const visitorGroups = useMemo(() => {
    const groups = groupVisitors(Array.isArray(visitors) ? visitors : []);
    if (!query) return groups;
    const needle = query.toLowerCase();
    return groups.filter((item) =>
      `${item.ip} ${item.browser} ${item.os} ${item.device} ${item.visits.map((visit) => visit.path).join(" ")}`
        .toLowerCase()
        .includes(needle)
    );
  }, [visitors, query]);

  const filteredActivities = useMemo(() => {
    if (!query) return activities;
    const needle = query.toLowerCase();
    return activities.filter((item) =>
      `${item.event} ${item.payload?.user || ""} ${item.payload?.targetUser || ""} ${JSON.stringify(item.payload || {})}`
        .toLowerCase()
        .includes(needle)
    );
  }, [activities, query]);

  const clearCurrentTab = () => {
    if (tab === "visitors") {
      writeLS("visitors", []);
    } else {
      writeLS("audit", []);
    }
    refresh();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Nhật ký & truy cập"
        description="Log khách và thao tác admin."
        compact
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm(tab === "visitors" ? "Xóa toàn bộ log khách truy cập cục bộ?" : "Xóa toàn bộ nhật ký quản trị cục bộ?")) {
                clearCurrentTab();
              }
            }}
          >
            Xóa dữ liệu hiện tại
          </Button>
        }
      />

      <Section
        title="Bộ lọc"
        compact
        actions={
          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === "visitors"} label="Khách truy cập" count={visitorGroups.length} onClick={() => setTab("visitors")} />
            <TabButton active={tab === "activity"} label="Nhật ký quản trị" count={filteredActivities.length} onClick={() => setTab("activity")} />
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="sm:max-w-md"
            placeholder={tab === "visitors" ? "Tìm IP, trình duyệt, đường dẫn..." : "Tìm sự kiện, người dùng, chi tiết..."}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Badge variant="warning">Dữ liệu cục bộ</Badge>
            <span>{tab === "visitors" ? "Theo trình duyệt đang mở admin." : "Đọc từ audit local hiện tại."}</span>
          </div>
        </div>
      </Section>

      {tab === "visitors" ? (
        <VisitorList groups={visitorGroups} page={page} setPage={setPage} />
      ) : (
        <ActivityList rows={filteredActivities} page={page} setPage={setPage} />
      )}
    </div>
  );
}
