// api/og.js Ã¢â‚¬â€ Vercel Serverless Function
// Crawler Ã¢â€ â€™ trÃ¡ÂºÂ£ OG HTML Ã„â€˜Ã¡Â»â„¢ng theo URL (pid, cat, view, q)
// User thÃ†Â°Ã¡Â»Âng Ã¢â€ â€™ serve index.html (SPA)

import { readFileSync } from "fs";
import { join } from "path";

/* ===== CONFIG (Ã„â€˜Ã¡Â»Âc tÃ¡Â»Â« env) ===== */
const SHEET_ID = process.env.OG_SHEET_ID || process.env.VITE_SHEET_ID || "";
const PRODUCT_TABS = process.env.OG_PRODUCT_TABS || process.env.VITE_PRODUCT_TABS || "";
const PRODUCTS_GID_FALLBACK = process.env.OG_PRODUCTS_GID || process.env.OG_PRODUCT_GID || process.env.VITE_SHEET_GID_PRODUCTS || "";
const MENU_GID = process.env.OG_MENU_GID || process.env.VITE_SHEET_GID_MENU || "";

const CRAWLERS = /facebookexternalhit|Facebot|Twitterbot|TelegramBot|Zalobot|LinkedInBot|Slackbot|WhatsApp|Discordbot|Pinterest|vkShare|W3C_Validator|baiduspider/i;

const SITE_URL = "https://halleybakery.io.vn";
const DEFAULT_IMAGE = `${SITE_URL}/brand/logo-desktop.png`;
const DEFAULT_TITLE = "HALLEY BAKERY - Banh sinh nhat & Banh su kien Ha Noi";
const DEFAULT_DESC = "Dat banh sinh nhat, banh su kien theo yeu cau. Thiet ke doc dao, giao hang tan noi tai Ha Noi.";
const FORCE_APP_PARAMS = ["hb_staff", "staff", "staff_mode", "tracking", "_app", "app"];
const STAFF_OPT_OUT_COOKIE = "hb_tracking_opt_out_v1";

/* ===== CACHE ===== */
let cachedProducts = null;
let cachedMenu = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 phÃƒÂºt

/* ===== GViz fetch ===== */
async function fetchGViz(gid) {
    if (!SHEET_ID || !gid) return [];
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const txt = await res.text();
    try {
        const m = txt.match(/google\.visualization\.Query\.setResponse\((.*)\);?$/s);
        const payload = m ? m[1] : txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
        const json = JSON.parse(payload);
        const cols = (json.table?.cols || []).map(c =>
            (c.label || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_]/g, "")
        );
        return (json.table?.rows || []).map(row => {
            const obj = {};
            (row.c || []).forEach((cell, i) => {
                if (cols[i]) obj[cols[i]] = cell?.v ?? cell?.f ?? "";
            });
            return obj;
        });
    } catch { return []; }
}

function parseProductTabs(raw = "", gidFallback = "") {
    const toks = String(raw || "")
        .replace(/\r\n?/g, "\n")
        .split(/[;\n,]+/)
        .map(t => t.trim())
        .filter(Boolean);

    const normalizeGid = (v = "") => String(v || "").trim().replace(/[^\d]/g, "");
    const out = [];

    for (const tok of toks) {
        const gidFirst = tok.match(/^(\d+)\s*:\s*(.+)$/);
        if (gidFirst) {
            out.push({ gid: normalizeGid(gidFirst[1]), key: String(gidFirst[2] || "product").trim() || "product" });
            continue;
        }
        const keyFirst = tok.match(/^(.+?)\s*:\s*(\d+)$/);
        if (keyFirst) {
            out.push({ gid: normalizeGid(keyFirst[2]), key: String(keyFirst[1] || "product").trim() || "product" });
            continue;
        }
        if (/^\d+$/.test(tok)) {
            out.push({ gid: normalizeGid(tok), key: "product" });
        }
    }

    const dedup = [];
    const seen = new Set();
    for (const tab of out) {
        if (!tab.gid || seen.has(tab.gid)) continue;
        seen.add(tab.gid);
        dedup.push(tab);
    }

    const fallback = normalizeGid(gidFallback);
    if (!dedup.length && fallback) dedup.push({ gid: fallback, key: "product" });
    return dedup;
}

async function loadData() {
    const now = Date.now();
    if (cachedProducts && now - cacheTime < CACHE_TTL) return;
    if (!SHEET_ID) {
        cachedProducts = [];
        cachedMenu = [];
        cacheTime = now;
        return;
    }

    // Fetch sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m tÃ¡Â»Â« tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ tab
    const tabs = parseProductTabs(PRODUCT_TABS, PRODUCTS_GID_FALLBACK);

    const results = await Promise.allSettled(
        tabs.map(async t => {
            const rows = await fetchGViz(t.gid);
            return rows.map(r => ({ ...r, category: r.category || r.type || t.key, _tab_key: t.key }));
        })
    );
    cachedProducts = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

    // Fetch menu
    if (MENU_GID) {
        try { cachedMenu = await fetchGViz(MENU_GID); } catch { cachedMenu = []; }
    }

    cacheTime = now;
}

/* ===== Helpers ===== */
function imgOf(p) {
    if (!p) return DEFAULT_IMAGE;
    const raw = p.images || p.image || p.hinh || p.hinhanh || "";
    const first = String(raw).split(/[|,\n]/)[0]?.trim();
    if (!first) return DEFAULT_IMAGE;
    const dm = first.match(/(?:file\/d\/|open\?id=|id=)([a-zA-Z0-9_-]{10,})/);
    if (dm) return `https://lh3.googleusercontent.com/d/${dm[1]}=w1200`;
    if (first.includes("lh3.googleusercontent.com") && !first.includes("=w")) return first + "=w1200";
    return first;
}

const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function pickFirst(obj, keys) {
    if (!obj) return "";
    for (const k of keys) {
        const v = obj[k];
        if (v === 0) return "0";
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (s) return s;
    }
    return "";
}

function productNameOf(p) {
    return pickFirst(p, ["name", "ten", "title", "productname", "product_name"]);
}

function productDescOf(p) {
    return pickFirst(p, ["description", "mota", "desc", "note", "ghichu"]);
}

const PID_KEYS = [
    "uid",
    "code",
    "slug",
    "id",
    "productid",
    "product_id",
    "productcode",
    "product_code",
    "masanpham",
    "masp",
    "maso",
    "ma",
    "mabanh",
];

function collectCandidate(set, value) {
    const raw = String(value ?? "").trim();
    if (!raw) return;

    set.add(raw);
    set.add(norm(raw));

    const compact = raw.replace(/[^a-zA-Z0-9]/g, "");
    if (compact && compact !== raw) {
        set.add(compact);
        set.add(norm(compact));
    }

    const digitsTail = compact.match(/(\d{2,})$/)?.[1];
    if (digitsTail) set.add(digitsTail);
}

function productPidCandidates(p) {
    if (!p || typeof p !== "object") return [];
    const set = new Set();
    for (const key of PID_KEYS) collectCandidate(set, p[key]);

    const id = pickFirst(p, ["id"]);
    const category = pickFirst(p, ["category", "_tab_key", "type"]);
    if (id && category) collectCandidate(set, `${category}:${id}`);

    // Backward compatibility: old links may encode product name.
    collectCandidate(set, productNameOf(p));

    return [...set];
}

function findProductByPid(products, pid) {
    const rawPid = String(pid || "").trim();
    if (!rawPid) return null;
    const targets = new Set();
    collectCandidate(targets, rawPid);
    return products.find(p => {
        const cands = productPidCandidates(p);
        return cands.some(c => targets.has(c));
    }) || null;
}

function pidFromProductPath(pathname = "") {
    const match = String(pathname || "").match(/^\/p\/([^/?#]+)/);
    if (!match) return "";
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1] || "";
    }
}

function ogHtml({ title, description, image, url }) {
    return `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:locale" content="vi_VN">
<meta property="og:site_name" content="Halley Bakery">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="description" content="${esc(description)}">
<title>${esc(title)}</title>
</head><body><p>${esc(description)}</p></body></html>`;
}

/* ===== index.html cache ===== */
let indexHtml = null;
function getIndexHtml() {
    if (indexHtml) return indexHtml;

    const isLocalDev =
        process.env.VERCEL_DEV === "1" ||
        process.env.NODE_ENV !== "production" ||
        process.env.VERCEL_ENV !== "production";

    const candidates = isLocalDev
        ? [
            join(process.cwd(), "index.html"),
            join(process.cwd(), "dist", "_app.html"),
            join(process.cwd(), ".output", "static", "_app.html"),
        ]
        : [
            join(process.cwd(), "dist", "_app.html"),
            join(process.cwd(), ".output", "static", "_app.html"),
            join(process.cwd(), "index.html"),
        ];

    for (const file of candidates) {
        try {
            indexHtml = readFileSync(file, "utf-8");
            break;
        } catch { }
    }

    return indexHtml;
}

function urlOf(req) {
    try {
        return new URL(req.url || "/", SITE_URL);
    } catch {
        return new URL("/", SITE_URL);
    }
}

function hasStaffOptOutCookie(req) {
    const cookie = String(req.headers.cookie || "");
    return new RegExp(`(?:^|;\\s*)${STAFF_OPT_OUT_COOKIE}=1(?:;|$)`).test(cookie);
}

function shouldForceAppShell(req) {
    const url = urlOf(req);
    return FORCE_APP_PARAMS.some(param => url.searchParams.has(param)) || hasStaffOptOutCookie(req);
}

function shouldServeCrawlerHtml(req) {
    const ua = req.headers["user-agent"] || "";
    if (shouldForceAppShell(req)) return false;
    return CRAWLERS.test(ua);
}

function setNoStoreHtmlHeaders(res) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Vary", "User-Agent");
}

/* ===== HANDLER ===== */
export default async function handler(req, res) {
    // User thÃ†Â°Ã¡Â»Âng Ã¢â€ â€™ serve index.html
    if (!shouldServeCrawlerHtml(req)) {
        const html = getIndexHtml();
        if (html) {
            setNoStoreHtmlHeaders(res);
            return res.status(200).send(html);
        }
        // Fallback: redirect vÃ¡Â»Â static
        res.writeHead(302, { Location: "/" });
        return res.end();
    }

    // === Crawler Ã¢â€ â€™ dynamic OG ===
    await loadData();
    const products = cachedProducts || [];
    const menu = cachedMenu || [];

    const url = new URL(req.url || "/", SITE_URL);
    const pid = pidFromProductPath(url.pathname) || url.searchParams.get("pid");
    const cat = url.searchParams.get("cat") || url.searchParams.get("view");
    const q = url.searchParams.get("q");
    const fullUrl = `${SITE_URL}${url.pathname}${url.search}`;

    let title = DEFAULT_TITLE, description = DEFAULT_DESC, image = DEFAULT_IMAGE;

    if (products.length) {
        if (pid) {
            const p = findProductByPid(products, pid);
            if (p) {
                const name = productNameOf(p) || pid;
                title = `${name} - Halley Bakery`;
                const desc = productDescOf(p);
                description = desc
                    ? String(desc).slice(0, 200)
                    : `Dat ${name} tai Halley Bakery. Giao hang tan noi tai Ha Noi.`;
                image = imgOf(p);
            }
        } else if (cat && cat !== "all" && cat !== "home") {
            const cn = norm(cat);
            // Find display title from menu data.
            let catTitle = cat;
            for (const m of menu) {
                const mk = norm(m.key || m.title || "");
                if (mk === cn || m.key === cat) { catTitle = m.title || m.key || cat; break; }
            }
            const cp = products.filter(p => {
                const pc = p.category || p._tab_key || "";
                return pc === cat || norm(pc) === cn;
            });
            title = `${catTitle} - Halley Bakery`;
            description = cp.length
                ? `Xem ${cp.length} mau ${catTitle} tai Halley Bakery. Dat banh online, giao tan noi.`
                : `${catTitle} tai Halley Bakery. Dat banh online, giao tan noi.`;
            const withImg = cp.filter(p => imgOf(p) !== DEFAULT_IMAGE);
            if (withImg.length) image = imgOf(withImg[Math.floor(Math.random() * withImg.length)]);
        } else if (q) {
            title = `Tim "${q}" - Halley Bakery`;
            description = `Ket qua tim kiem "${q}" tai Halley Bakery.`;
            const ql = q.toLowerCase();
            const m = products.find(p => (productNameOf(p).toLowerCase()).includes(ql));
            if (m) image = imgOf(m);
        }
    }
    setNoStoreHtmlHeaders(res);
    res.status(200).send(ogHtml({ title, description, image, url: fullUrl }));
}

