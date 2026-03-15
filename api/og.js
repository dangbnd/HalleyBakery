// api/og.js Ã¢â‚¬â€ Vercel Serverless Function
// Crawler Ã¢â€ â€™ trÃ¡ÂºÂ£ OG HTML Ã„â€˜Ã¡Â»â„¢ng theo URL (pid, cat, view, q)
// User thÃ†Â°Ã¡Â»Âng Ã¢â€ â€™ serve index.html (SPA)

import { readFileSync } from "fs";
import { join } from "path";

/* ===== CONFIG (Ã„â€˜Ã¡Â»Âc tÃ¡Â»Â« env) ===== */
const SHEET_ID = process.env.OG_SHEET_ID || process.env.VITE_SHEET_ID || "";
const PRODUCT_TABS = process.env.OG_PRODUCT_TABS || process.env.VITE_PRODUCT_TABS || "";
const MENU_GID = process.env.OG_MENU_GID || process.env.VITE_SHEET_GID_MENU || "";

const CRAWLERS = /facebookexternalhit|Facebot|Twitterbot|TelegramBot|Zalobot|LinkedInBot|Slackbot|WhatsApp|Discordbot|Pinterest|vkShare|W3C_Validator|baiduspider/i;

const SITE_URL = "https://halleybakery.io.vn";
const DEFAULT_IMAGE = `${SITE_URL}/brand/logo-desktop.png`;
const DEFAULT_TITLE = "HALLEY BAKERY - Banh sinh nhat & Banh su kien Ha Noi";
const DEFAULT_DESC = "Dat banh sinh nhat, banh su kien theo yeu cau. Thiet ke doc dao, giao hang tan noi tai Ha Noi.";

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

async function loadData() {
    const now = Date.now();
    if (cachedProducts && now - cacheTime < CACHE_TTL) return;
    if (!SHEET_ID || !PRODUCT_TABS) {
        cachedProducts = [];
        cachedMenu = [];
        cacheTime = now;
        return;
    }

    // Fetch sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m tÃ¡Â»Â« tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ tab
    const tabs = PRODUCT_TABS
        .split(/[\n,;]+/)
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => {
            const [gid, key] = t.split(":");
            return { gid: (gid || "").trim(), key: (key || "").trim() };
        })
        .filter(t => t.gid && t.key);

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

/* ===== HANDLER ===== */
export default async function handler(req, res) {
    const ua = req.headers["user-agent"] || "";

    // User thÃ†Â°Ã¡Â»Âng Ã¢â€ â€™ serve index.html
    if (!CRAWLERS.test(ua)) {
        const html = getIndexHtml();
        if (html) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
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
    const pid = url.searchParams.get("pid");
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
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.status(200).send(ogHtml({ title, description, image, url: fullUrl }));
}


