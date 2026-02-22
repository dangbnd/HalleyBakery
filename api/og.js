// api/og.js — Vercel Serverless Function
// Crawler → trả OG HTML động theo URL (pid, cat, view, q)
// User thường → serve index.html (SPA)

import { readFileSync } from "fs";
import { join } from "path";

/* ===== CONFIG (đọc từ .env đã commit) ===== */
const SHEET_ID = "1Z-Y_yZFeOsgxHaQG39UzaPZBATBNH08g_5CsCKW4F14";
const PRODUCT_TABS = "1320694377:100k,1704842938:Basic,1927539600:BeTrai,1855820716:BeGai,973759986:Kuromi,1095827517:ThuNoi,766424998:3D,1546645574:Doraemon,383748245:Redvelvet,1969282223:Tiramisu,551943231:Mousse,33352066:BLTM,646373821:SetHoaBanh,220270059:BanhHoa,187755764:Tulip,1629133646:HoaDacBiet,626531830:HoaQua,754409517:Nam,418952452:Nu,265132346:Noel,584148313:Love,2058100810:SetTiec,1274878583:CongTy,834006966:ThanTai,524380305:ChuaPhanLoai";
const MENU_GID = "847800272";

const CRAWLERS = /facebookexternalhit|Facebot|Twitterbot|TelegramBot|Zalobot|LinkedInBot|Slackbot|WhatsApp|Discordbot|Pinterest|vkShare|W3C_Validator|baiduspider/i;

const SITE_URL = "https://halleybakery.io.vn";
const DEFAULT_IMAGE = `${SITE_URL}/brand/logo-desktop.png`;
const DEFAULT_TITLE = "HALLEY BAKERY — Bánh sinh nhật & Bánh sự kiện Hà Nội";
const DEFAULT_DESC = "Đặt bánh sinh nhật, bánh sự kiện theo yêu cầu. Thiết kế độc đáo, giao hàng tận nơi tại Hà Nội.";

/* ===== CACHE ===== */
let cachedProducts = null;
let cachedMenu = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 phút

/* ===== GViz fetch ===== */
async function fetchGViz(gid) {
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

    // Fetch sản phẩm từ tất cả tab
    const tabs = PRODUCT_TABS.split(",").map(t => {
        const [gid, key] = t.split(":");
        return { gid, key };
    });

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

function ogHtml({ title, description, image, url }) {
    return `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
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
    try {
        indexHtml = readFileSync(join(process.cwd(), "dist", "_app.html"), "utf-8");
    } catch {
        // Nếu dist không có, thử .output hoặc public
        try { indexHtml = readFileSync(join(process.cwd(), ".output", "static", "_app.html"), "utf-8"); } catch { }
    }
    return indexHtml;
}

/* ===== HANDLER ===== */
export default async function handler(req, res) {
    const ua = req.headers["user-agent"] || "";

    // User thường → serve index.html
    if (!CRAWLERS.test(ua)) {
        const html = getIndexHtml();
        if (html) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
            return res.status(200).send(html);
        }
        // Fallback: redirect về static
        res.writeHead(302, { Location: "/" });
        return res.end();
    }

    // === Crawler → dynamic OG ===
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
            const pn = norm(pid);
            const p = products.find(x =>
                String(x.id || "") === pid ||
                norm(x.name || x.ten || "") === pn ||
                norm(String(x.id || "")) === pn
            );
            if (p) {
                const name = p.name || p.ten || pid;
                title = `${name} — Halley Bakery`;
                description = (p.description || p.mota || "")
                    ? String(p.description || p.mota || "").slice(0, 200)
                    : `Đặt ${name} tại Halley Bakery. Giao hàng tận nơi Hà Nội.`;
                image = imgOf(p);
            }
        } else if (cat && cat !== "all" && cat !== "home") {
            const cn = norm(cat);
            // Tìm tên hiển thị từ menu
            let catTitle = cat;
            for (const m of menu) {
                const mk = norm(m.key || m.title || "");
                if (mk === cn || m.key === cat) { catTitle = m.title || m.key || cat; break; }
            }
            const cp = products.filter(p => {
                const pc = p.category || p._tab_key || "";
                return pc === cat || norm(pc) === cn;
            });
            title = `${catTitle} — Halley Bakery`;
            description = cp.length
                ? `Xem ${cp.length} mẫu ${catTitle} tại Halley Bakery. Đặt bánh online, giao tận nơi.`
                : `${catTitle} tại Halley Bakery. Đặt bánh online, giao tận nơi.`;
            const w = cp.find(p => imgOf(p) !== DEFAULT_IMAGE);
            if (w) image = imgOf(w);
        } else if (q) {
            title = `Tìm "${q}" — Halley Bakery`;
            description = `Kết quả tìm kiếm "${q}" tại Halley Bakery.`;
            const ql = q.toLowerCase();
            const m = products.find(p => ((p.name || p.ten || "").toLowerCase()).includes(ql));
            if (m) image = imgOf(m);
        }
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.status(200).send(ogHtml({ title, description, image, url: fullUrl }));
}
