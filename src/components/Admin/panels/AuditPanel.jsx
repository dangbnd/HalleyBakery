// src/components/Admin/panels/AuditPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { readLS, writeLS, readAudit } from "../../../utils.js";

const PAGE_SIZE = 30;

/* ——— helpers ——— */
const fmtTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const relTime = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60000) return "vừa xong";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}ph`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}ngày`;
};

const parseUA = (ua) => {
    if (!ua) return { browser: "—", os: "—", device: "—" };
    let browser = "Khác";
    if (/Edg\//i.test(ua)) browser = "Edge";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

    let os = "Khác";
    if (/Windows/i.test(ua)) os = "Win";
    else if (/Mac OS/i.test(ua)) os = "macOS";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad/i.test(ua)) os = "iOS";
    else if (/Linux/i.test(ua)) os = "Linux";

    let device = "Desktop";
    if (/Mobile|Android|iPhone/i.test(ua)) device = "Mobile";
    else if (/iPad|Tablet/i.test(ua)) device = "Tablet";

    return { browser, os, device };
};

const eventLabels = {
    "product.update": "Cập nhật SP",
    "product.delete": "Xoá SP",
    "settings.save": "Lưu cấu hình",
    "user.login": "Đăng nhập",
    "user.logout": "Đăng xuất",
    "user.create": "Tạo tài khoản",
    "user.update": "Sửa tài khoản",
    "ai.tags.apply": "Gán tag AI",
    "ai.tags.batch": "Batch tag AI",
};
const eventIcon = (ev) => {
    if (ev?.includes("delete")) return "🗑️";
    if (ev?.includes("ai.tags")) return "✨";
    if (ev?.includes("update") || ev?.includes("apply")) return "✏️";
    if (ev?.includes("save")) return "💾";
    if (ev?.includes("login")) return "🔑";
    if (ev?.includes("logout")) return "🚪";
    if (ev?.includes("create")) return "➕";
    return "📝";
};
const eventColor = (ev) => {
    if (ev?.includes("delete")) return "bg-red-50 text-red-700 border-red-200";
    if (ev?.includes("ai.tags")) return "bg-purple-50 text-purple-700 border-purple-200";
    if (ev?.includes("update") || ev?.includes("save")) return "bg-blue-50 text-blue-700 border-blue-200";
    if (ev?.includes("login") || ev?.includes("create")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-gray-50 text-gray-600 border-gray-200";
};

const renderDetail = (event, payload) => {
    if (!payload) return "—";
    const p = payload;
    const name = p.name || p.productName || p.key || "";
    const id = p.id || p.productId || "";
    if (event?.includes("ai.tags")) {
        const tags = Array.isArray(p.tags) ? p.tags : (p.tags || "").split(",").map(t => t.trim()).filter(Boolean);
        return (
            <div className="flex flex-col gap-0.5">
                <span className="text-gray-700 font-medium text-xs">{name} {id && <span className="text-gray-400 font-normal">#{id}</span>}</span>
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                        {tags.slice(0, 5).map((t, i) => <span key={i} className="px-1.5 py-0 rounded bg-purple-100 text-purple-700 text-[9px] border border-purple-200/60">{t}</span>)}
                        {tags.length > 5 && <span className="text-[9px] text-gray-400">+{tags.length - 5}</span>}
                    </div>
                )}
            </div>
        );
    }
    if (event?.includes("product")) {
        return <span className="text-xs"><span className="font-medium text-gray-700">{name}</span>{id && <span className="text-gray-400 ml-1">#{id}</span>}</span>;
    }
    if (event?.includes("user")) {
        return <span className="text-xs text-gray-600">{p.targetUser || p.username || p.user || "—"}</span>;
    }
    const keys = Object.entries(p).filter(([k]) => !['user', 'username', 'ts'].includes(k));
    if (!keys.length) return "—";
    return <span className="text-[10px] text-gray-500 font-mono">{keys.map(([k, v]) => `${k}=${String(v).slice(0, 20)}`).join(" · ")}</span>;
};

function groupByVisitor(entries) {
    const map = new Map();
    for (const v of entries) {
        const key = v.ip || `fp:${(v.ua || "").slice(0, 60)}|${v.screen || ""}`;
        if (!map.has(key)) {
            const { browser, os, device } = parseUA(v.ua);
            map.set(key, { key, ip: v.ip || "", browser, os, device, screen: v.screen || "", lang: v.lang || "", firstSeen: v.ts, lastSeen: v.ts, visits: [] });
        }
        const g = map.get(key);
        g.visits.push(v);
        if (v.ts > g.lastSeen) g.lastSeen = v.ts;
        if (v.ts < g.firstSeen) g.firstSeen = v.ts;
    }
    return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

const deviceBadge = (device) => {
    if (device === "Mobile") return "bg-orange-50 text-orange-700 border-orange-200";
    if (device === "Tablet") return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-gray-50 text-gray-500 border-gray-200";
};
const deviceIcon = (device) => device === "Mobile" ? "📱" : device === "Tablet" ? "💻" : "🖥️";

/* ====================== MAIN ====================== */
export default function AuditPanel() {
    const [activeTab, setActiveTab] = useState("visitors");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);

    const visitors = useMemo(() => readLS("visitors", []), [activeTab]);
    const activities = useMemo(() => readAudit(), [activeTab]);

    const visitorGroups = useMemo(() => {
        const groups = groupByVisitor(visitors);
        if (!q) return groups;
        const lq = q.toLowerCase();
        return groups.filter(g =>
            (g.ip + " " + g.browser + " " + g.os + " " + g.device + " " + g.visits.map(v => v.path).join(" ")).toLowerCase().includes(lq)
        );
    }, [visitors, q]);

    useEffect(() => { setPage(1); setQ(""); }, [activeTab]);
    useEffect(() => { setPage(1); }, [q]);

    return (
        <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
            <div className="shrink-0 space-y-2">
                {/* ── Row 1: Tabs ── */}
                <div className="flex items-center gap-1">
                    {[
                        { key: "visitors", label: "Khách", fullLabel: "Khách truy cập", icon: "👥", count: visitorGroups.length },
                        { key: "activity", label: "Hoạt động", fullLabel: "Quản trị", icon: "📋", count: activities.length },
                    ].map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)}
                            className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-medium rounded-xl border transition ${activeTab === t.key
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"}`}>
                            <span>{t.icon}</span>
                            <span className="hidden xs:inline">{t.fullLabel}</span>
                            <span className="inline xs:hidden">{t.label}</span>
                            <span className={`text-[9px] px-1 py-0 rounded-full font-bold ${activeTab === t.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}>{t.count}</span>
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            if (activeTab === "visitors") writeLS("visitors", []);
                            else writeLS("audit", []);
                            window.location.reload();
                        }}
                        className="h-8 px-2 text-[10px] font-medium text-red-500 hover:bg-red-50 border border-red-200 rounded-xl transition shrink-0">
                        🗑️
                    </button>
                </div>

                {/* ── Row 2: Search ── */}
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                    <input
                        className="h-8 pl-8 pr-3 w-full border border-gray-200 rounded-xl bg-white text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                        placeholder={activeTab === "visitors" ? "Tìm IP, trình duyệt, trang..." : "Tìm hành động, người dùng..."}
                        value={q} onChange={(e) => setQ(e.target.value)}
                    />
                    {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto mt-2">
                {activeTab === "visitors"
                    ? <VisitorCards groups={visitorGroups} page={page} setPage={setPage} />
                    : <ActivityCards data={activities} q={q} page={page} setPage={setPage} />
                }
            </div>
        </div>
    );
}

/* ====================== VISITOR CARDS ====================== */
function VisitorCards({ groups, page, setPage }) {
    const [expanded, setExpanded] = useState(null);
    const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    if (groups.length === 0) return (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
            <div className="text-4xl opacity-20">👥</div>
            <div className="text-sm text-gray-400">Chưa có lượt truy cập</div>
            <div className="text-xs text-gray-300">Dữ liệu xuất hiện khi có người truy cập web</div>
        </div>
    );

    return (
        <div className="space-y-2">
            {paged.map(g => {
                const isOpen = expanded === g.key;
                return (
                    <div key={g.key} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isOpen ? "border-blue-200 shadow-blue-50" : "border-gray-100"}`}>
                        {/* Main row */}
                        <button className="w-full text-left px-3 py-2.5 flex items-center gap-2.5" onClick={() => setExpanded(prev => prev === g.key ? null : g.key)}>
                            {/* Device icon */}
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border ${deviceBadge(g.device)}`}>
                                {deviceIcon(g.device)}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs font-semibold text-gray-800 truncate">{g.ip || "—"}</span>
                                    <span className={`shrink-0 text-[9px] px-1.5 py-0 rounded-full border ${deviceBadge(g.device)}`}>{g.device}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-gray-400">{g.browser} · {g.os}</span>
                                    <span className="text-[10px] text-gray-300">{relTime(g.lastSeen)}</span>
                                </div>
                            </div>
                            {/* Visit count + chevron */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="min-w-[1.5rem] h-5 px-1.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                                    {g.visits.length}
                                </span>
                                <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>

                        {/* Expanded visits */}
                        {isOpen && (
                            <div className="border-t border-gray-100 bg-blue-50/30 divide-y divide-blue-100/50 max-h-48 overflow-y-auto">
                                {g.visits.map((v, vi) => (
                                    <div key={v.id || vi} className="px-3 py-1.5 flex items-center gap-2">
                                        <span className="text-[9px] text-gray-400 shrink-0 w-20">{fmtTime(v.ts)}</span>
                                        <a href={v.path || "/"} target="_blank" rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            className="text-[10px] text-blue-600 hover:underline truncate flex-1 min-w-0">
                                            {v.path || "/"}
                                        </a>
                                        {v.screen && <span className="text-[9px] text-gray-300 shrink-0">{v.screen}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            {totalPages > 1 && <MiniPagination page={safePage} totalPages={totalPages} setPage={setPage} total={groups.length} />}
        </div>
    );
}

/* ====================== ACTIVITY CARDS ====================== */
function ActivityCards({ data, q, page, setPage }) {
    const filtered = useMemo(() => {
        if (!q) return data;
        const lq = q.toLowerCase();
        return data.filter((a) => {
            const label = eventLabels[a.event] || a.event || "";
            const who = a.payload?.user || a.payload?.username || "";
            const detail = JSON.stringify(a.payload || {});
            return (label + " " + who + " " + detail + " " + (a.event || "")).toLowerCase().includes(lq);
        });
    }, [data, q]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    if (filtered.length === 0) return (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
            <div className="text-4xl opacity-20">📋</div>
            <div className="text-sm text-gray-400">Chưa có hoạt động quản trị</div>
            <div className="text-xs text-gray-300">Sửa/xoá SP, lưu cài đặt sẽ hiện ở đây</div>
        </div>
    );

    return (
        <div className="space-y-1.5">
            {paged.map((a, i) => {
                const who = a.payload?.user || a.payload?.username || "—";
                const label = eventLabels[a.event] || a.event || "—";
                return (
                    <div key={a.id || i} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2.5 flex items-start gap-2.5">
                        {/* Avatar */}
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white text-[10px] flex items-center justify-center font-bold shrink-0 mt-0.5">
                            {(who[0] || "?").toUpperCase()}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-gray-800">{who}</span>
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0 rounded-full border ${eventColor(a.event)}`}>
                                    {eventIcon(a.event)} {label}
                                </span>
                            </div>
                            <div className="mt-0.5">
                                {renderDetail(a.event, a.payload)}
                            </div>
                        </div>
                        {/* Time */}
                        <div className="text-right shrink-0">
                            <div className="text-[9px] text-gray-400 leading-tight">{fmtTime(a.ts)}</div>
                            <div className="text-[9px] text-gray-300 leading-tight">{relTime(a.ts)}</div>
                        </div>
                    </div>
                );
            })}
            {totalPages > 1 && <MiniPagination page={safePage} totalPages={totalPages} setPage={setPage} total={filtered.length} />}
        </div>
    );
}

/* ====================== MINI PAGINATION ====================== */
function MiniPagination({ page, totalPages, setPage, total }) {
    const pages = [];
    const add = n => { if (n >= 1 && n <= totalPages && !pages.includes(n)) pages.push(n); };
    add(1); add(page - 1); add(page); add(page + 1); add(totalPages);
    pages.sort((a, b) => a - b);
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-[10px] text-gray-400">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}</span>
            <div className="flex items-center gap-0.5">
                <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
                </PgBtn>
                {pages.map((pg, idx) => {
                    const prev = pages[idx - 1];
                    return (
                        <span key={pg} className="flex items-center gap-0.5">
                            {prev && pg - prev > 1 && <span className="text-[10px] text-gray-300">…</span>}
                            <button onClick={() => setPage(pg)}
                                className={`min-w-[22px] h-6 px-0.5 text-[10px] rounded-md border transition ${pg === page ? "bg-blue-600 text-white border-blue-600 font-bold" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                                {pg}
                            </button>
                        </span>
                    );
                })}
                <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                </PgBtn>
            </div>
        </div>
    );
}
const PgBtn = ({ children, ...p }) => <button {...p} className="w-6 h-6 flex items-center justify-center text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition">{children}</button>;
