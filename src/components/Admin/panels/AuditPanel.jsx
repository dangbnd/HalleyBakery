// src/components/Admin/panels/AuditPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { readLS, writeLS, readAudit } from "../../../utils.js";

const PAGE_SIZE = 30;

/* ——— helpers ——— */
const fmtTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const relTime = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60000) return "vừa xong";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
    return `${Math.floor(diff / 86400000)} ngày trước`;
};

const parseUA = (ua) => {
    if (!ua) return { browser: "—", os: "—", device: "—" };
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

/* Build rich detail from audit payload */
const renderDetail = (event, payload) => {
    if (!payload) return "—";
    const p = payload;
    const name = p.name || p.productName || p.key || "";
    const id = p.id || p.productId || "";

    // AI tag events — show product + tags
    if (event?.includes("ai.tags")) {
        const tags = Array.isArray(p.tags) ? p.tags : (p.tags || "").split(",").map(t => t.trim()).filter(Boolean);
        return (
            <div className="flex flex-col gap-0.5">
                <span className="text-gray-700 font-medium text-xs">{name} {id && <span className="text-gray-400 font-normal">#{id}</span>}</span>
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {tags.map((t, i) => <span key={i} className="px-1.5 py-0 rounded bg-purple-100 text-purple-700 text-[9px] border border-purple-200/60">{t}</span>)}
                    </div>
                )}
            </div>
        );
    }
    // Product update/delete
    if (event?.includes("product")) {
        return (
            <span className="text-xs">
                <span className="font-medium text-gray-700">{name}</span>
                {id && <span className="text-gray-400 ml-1">#{id}</span>}
            </span>
        );
    }
    // Settings
    if (event?.includes("save") || event?.includes("settings")) {
        const changes = Object.entries(p).filter(([k]) => !['user', 'username', 'ts'].includes(k));
        if (changes.length === 0) return "—";
        return (
            <div className="flex flex-wrap gap-1">
                {changes.map(([k, v]) => <span key={k} className="px-1.5 py-0 rounded bg-gray-100 text-gray-600 text-[9px] border border-gray-200">{k}: {String(v).slice(0, 30)}</span>)}
            </div>
        );
    }
    // User events
    if (event?.includes("user")) {
        return <span className="text-xs text-gray-600">{p.targetUser || p.username || p.user || "—"}</span>;
    }
    // Fallback — show all non-user keys
    const keys = Object.entries(p).filter(([k]) => !['user', 'username', 'ts'].includes(k));
    if (!keys.length) return "—";
    return <span className="text-[10px] text-gray-500 font-mono">{keys.map(([k, v]) => `${k}=${String(v).slice(0, 20)}`).join(" · ")}</span>;
};

/* Group visitors by IP (or UA+screen fingerprint as fallback) */
function groupByVisitor(entries) {
    const map = new Map();
    for (const v of entries) {
        // Use IP if available, otherwise fingerprint from UA + screen
        const key = v.ip || `fp:${(v.ua || "").slice(0, 60)}|${v.screen || ""}`;
        if (!map.has(key)) {
            const { browser, os, device } = parseUA(v.ua);
            map.set(key, {
                key,
                ip: v.ip || "",
                browser, os, device,
                screen: v.screen || "",
                lang: v.lang || "",
                firstSeen: v.ts,
                lastSeen: v.ts,
                visits: [],
            });
        }
        const g = map.get(key);
        g.visits.push(v);
        if (v.ts > g.lastSeen) g.lastSeen = v.ts;
        if (v.ts < g.firstSeen) g.firstSeen = v.ts;
    }
    // Sort groups by most recent visit
    return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/* ====================== MAIN ====================== */
export default function AuditPanel() {
    const [activeTab, setActiveTab] = useState("visitors");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);

    const visitors = useMemo(() => readLS("visitors", []), [activeTab]);
    const activities = useMemo(() => readAudit(), [activeTab]);

    // Group visitors by IP
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

    const uniqueIPs = useMemo(() => new Set(visitors.filter(v => v.ip).map(v => v.ip)).size, [visitors]);

    const tabs = [
        { key: "visitors", label: "Khách truy cập", icon: "👥", count: `${visitorGroups.length} khách · ${visitors.length} lượt` },
        { key: "activity", label: "Hoạt động quản trị", icon: "📝", count: activities.length },
    ];

    return (
        <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
            <div className="shrink-0">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Nhật ký</h2>

                {/* Tabs */}
                <div className="flex items-center gap-1 mb-3 border-b border-gray-200">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${activeTab === t.key
                                ? "bg-white text-blue-600 border border-b-white border-gray-200 -mb-px"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                }`}
                        >
                            <span>{t.icon}</span>
                            {t.label}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === t.key ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                                }`}>{t.count}</span>
                        </button>
                    ))}
                </div>

                {/* Search + clear */}
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        <input
                            className="h-9 pl-9 pr-4 w-72 border border-gray-200 rounded-lg bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                            placeholder={activeTab === "visitors" ? "Tìm theo IP, trình duyệt, trang..." : "Tìm theo hành động, người dùng..."}
                            value={q} onChange={(e) => setQ(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => {
                            if (activeTab === "visitors") writeLS("visitors", []);
                            else writeLS("audit", []);
                            window.location.reload();
                        }}
                        className="h-9 px-4 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition"
                    >
                        Xoá nhật ký
                    </button>
                </div>
            </div>

            {/* Content */}
            {activeTab === "visitors" ? (
                <VisitorGroupTable groups={visitorGroups} page={page} setPage={setPage} />
            ) : (
                <ActivityTable data={activities} q={q} page={page} setPage={setPage} />
            )}
        </div>
    );
}

/* ====================== VISITOR GROUP TABLE ====================== */
function VisitorGroupTable({ groups, page, setPage }) {
    const [expanded, setExpanded] = useState(null); // IP key of expanded group

    const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const toggle = (key) => setExpanded(prev => prev === key ? null : key);

    return (
        <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200/80 shadow-sm">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                <colgroup>
                    <col style={{ width: "2rem" }} />
                    <col style={{ width: "8rem" }} />
                    <col style={{ width: "5rem" }} />
                    <col style={{ width: "5rem" }} />
                    <col style={{ width: "5rem" }} />
                    <col style={{ width: "5rem" }} />
                    <col style={{ width: "7rem" }} />
                    <col style={{ width: "7rem" }} />
                </colgroup>
                <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-200">
                        <th className="py-2.5 px-2 bg-gray-50" />
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">IP</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Lượt</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Trình duyệt</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Hệ điều hành</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Thiết bị</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Lần đầu</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Gần nhất</th>
                    </tr>
                </thead>
                <tbody>
                    {paged.map((g) => {
                        const isOpen = expanded === g.key;
                        return (
                            <React.Fragment key={g.key}>
                                {/* Group row */}
                                <tr
                                    onClick={() => toggle(g.key)}
                                    className={`cursor-pointer transition-colors border-b border-gray-100 ${isOpen ? "bg-blue-50/60" : "hover:bg-gray-50/60"}`}
                                >
                                    <td className="py-2.5 px-2 text-center">
                                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform inline-block ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                            <path d="M9 5l7 7-7 7" />
                                        </svg>
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <span className="font-mono text-xs text-gray-700 font-medium">{g.ip || "—"}</span>
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                                            {g.visits.length}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] border border-blue-200/60">{g.browser}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-xs text-gray-600">{g.os}</td>
                                    <td className="py-2.5 px-3">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${g.device === "Mobile" ? "bg-orange-50 text-orange-700 border-orange-200" :
                                            g.device === "Tablet" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                                "bg-gray-50 text-gray-600 border-gray-200"
                                            }`}>{g.device}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-[10px] text-gray-500 whitespace-nowrap">{fmtTime(g.firstSeen)}</td>
                                    <td className="py-2.5 px-3 text-[10px] text-gray-500 whitespace-nowrap">{relTime(g.lastSeen)}</td>
                                </tr>

                                {/* Expanded detail rows */}
                                {isOpen && g.visits.map((v, vi) => (
                                    <tr key={v.id || vi} className="bg-blue-50/30 border-b border-blue-100/50">
                                        <td className="py-1.5 px-2" />
                                        <td colSpan={2} className="py-1.5 px-3">
                                            <span className="text-[10px] text-gray-400 mr-2">{fmtTime(v.ts)}</span>
                                        </td>
                                        <td colSpan={3} className="py-1.5 px-3">
                                            <a href={v.path || "/"} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>{v.path || "/"}</a>
                                            {v.referrer && <span className="text-[10px] text-gray-400 ml-2">← {v.referrer}</span>}
                                        </td>
                                        <td colSpan={2} className="py-1.5 px-3 text-[10px] text-gray-400">
                                            {v.screen || "—"}
                                        </td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>

            {groups.length === 0 && (
                <div className="py-16 text-center">
                    <div className="text-3xl mb-2 opacity-30">👥</div>
                    <div className="text-sm text-gray-400">Chưa có lượt truy cập nào được ghi nhận</div>
                    <div className="text-xs text-gray-300 mt-1">Dữ liệu sẽ xuất hiện khi có người truy cập website</div>
                </div>
            )}

            {totalPages > 1 && <PaginationBar page={safePage} totalPages={totalPages} setPage={setPage} total={groups.length} />}
        </div>
    );
}

/* ====================== ACTIVITY TABLE ====================== */
function ActivityTable({ data, q, page, setPage }) {
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

    return (
        <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200/80 shadow-sm">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                <colgroup>
                    <col style={{ width: "8rem" }} />
                    <col style={{ width: "6rem" }} />
                    <col style={{ width: "6rem" }} />
                    <col style={{ width: "9rem" }} />
                    <col />
                </colgroup>
                <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-200">
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Thời gian</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Tương đối</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Người dùng</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Hành động</th>
                        <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Chi tiết</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {paged.map((a, i) => {
                        const who = a.payload?.user || a.payload?.username || "—";
                        const label = eventLabels[a.event] || a.event || "—";
                        return (
                            <tr key={a.id || i} className="hover:bg-blue-50/30 transition-colors align-top">
                                <td className="py-2.5 px-3 text-xs text-gray-600 whitespace-nowrap">{fmtTime(a.ts)}</td>
                                <td className="py-2.5 px-3 text-xs text-gray-400">{relTime(a.ts)}</td>
                                <td className="py-2.5 px-3">
                                    <span className="inline-flex items-center gap-1 text-xs text-gray-700 font-medium">
                                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
                                            {(who[0] || "?").toUpperCase()}
                                        </span>
                                        {who}
                                    </span>
                                </td>
                                <td className="py-2.5 px-3">
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${eventColor(a.event)}`}>
                                        <span>{eventIcon(a.event)}</span>
                                        {label}
                                    </span>
                                </td>
                                <td className="py-2.5 px-3">
                                    {renderDetail(a.event, a.payload)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {filtered.length === 0 && (
                <div className="py-16 text-center">
                    <div className="text-3xl mb-2 opacity-30">📝</div>
                    <div className="text-sm text-gray-400">Chưa có hoạt động quản trị nào</div>
                    <div className="text-xs text-gray-300 mt-1">Hành động sửa/xoá sản phẩm, lưu cấu hình sẽ xuất hiện ở đây</div>
                </div>
            )}

            {totalPages > 1 && <PaginationBar page={safePage} totalPages={totalPages} setPage={setPage} total={filtered.length} />}
        </div>
    );
}

/* ====================== PAGINATION ====================== */
function PaginationBar({ page, totalPages, setPage, total }) {
    return (
        <div className="flex items-center justify-between py-2.5 px-4 border-t border-gray-100 bg-gray-50/50">
            <span className="text-xs text-gray-400">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex items-center gap-1">
                <PgBtn onClick={() => setPage(1)} disabled={page === 1}>«</PgBtn>
                <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</PgBtn>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = start + i;
                    if (p > totalPages) return null;
                    return (
                        <button key={p} onClick={() => setPage(p)}
                            className={`px-2.5 py-1 text-xs rounded border transition ${p === page ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}
                        >{p}</button>
                    );
                })}
                <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</PgBtn>
                <PgBtn onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</PgBtn>
            </div>
        </div>
    );
}
const PgBtn = ({ children, ...p }) => <button {...p} className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition">{children}</button>;
