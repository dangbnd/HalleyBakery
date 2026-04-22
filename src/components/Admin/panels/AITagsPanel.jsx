// src/components/Admin/panels/AITagsPanel.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { LS, audit, parseBooleanLike, readLS, writeLS } from "../../../utils.js";
import { KEYS, getConfig, getGeminiKeys, setGeminiKeys, setConfig, pushConfigKeyToSheet } from "../../../utils/config.js";
import { listConfiguredProductSheet, updateConfiguredProductRow, saveAITagsConfigToSheet } from "../shared/sheets.js";
import { fetchTabAsObjects } from "../../../services/sheets.js";
import { Badge, Callout, MetricItem, MetricStrip, PageHeader, Section } from "../ui/primitives.jsx";

/* ===== Helpers ===== */
const s = (v) => (v == null ? "" : String(v));
const tagsArr = (v) => s(v).split(",").map(t => t.trim()).filter(Boolean);
const safe = (x) => (Array.isArray(x) ? x.filter(v => v && typeof v === "object") : []);
const parseMaybeJSON = (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return t;
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        try { return JSON.parse(t); } catch { return v; }
    }
    return v;
};
const normImages = (v) => Array.isArray(v) ? v : s(v).split(/[\n,|]\s*/).filter(Boolean);
const stableRowId = (row) => {
    const explicit = s(row.id ?? row.ID ?? row.key ?? row.sku ?? row.code).trim();
    if (explicit) return explicit;
    const name = s(row.name ?? row.title ?? row.ten).trim().toLowerCase();
    const category = s(row.category ?? row.danh_muc ?? row.type).trim().toLowerCase();
    const image = Array.isArray(row.images)
        ? s(row.images[0]).trim().toLowerCase()
        : s(row.images ?? row.image).split(/[\n,|]\s*/)[0]?.trim().toLowerCase();
    return [name, category, image].filter(Boolean).join("|");
};
const normProduct = (row) => ({
    id: stableRowId(row), name: s(row.name).trim(), category: s(row.category).trim(),
    active: parseBooleanLike(row.active, true),
    images: Array.isArray(row.images) ? row.images : normImages(parseMaybeJSON(row.images ?? row.image)),
    description: s(row.description || row.desc || ""), tags: s(row.tags || ""),
    createdAt: row.createdAt || "",
});
const fixThumbUrl = (url, size = 200) => {
    if (!url) return "";
    const u = String(url);
    const m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/) || u.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
    return u.replace(/sz=w\d+/, `sz=w${size}`);
};
const firstImg = (p) => Array.isArray(p?.images) && p.images.length ? p.images[0] : s(p?.image) || "";
const sameStringList = (a = [], b = []) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, idx) => String(v || "") === String(b[idx] || ""));
const parseModelOrderRaw = (raw, allowSet) => {
    const text = String(raw || "").trim();
    if (!text) return [];
    let items = [];
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) items = parsed;
        } catch { }
    }
    if (!items.length) {
        items = text.split(/[\r\n,;|]+/).map((x) => x.trim()).filter(Boolean);
    }
    const out = [];
    const seen = new Set();
    for (const id of items) {
        const clean = String(id || "").trim();
        if (!clean || seen.has(clean) || !allowSet.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
    }
    return out;
};
const stripDiacritics = (text) => s(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normCategoryKey = (text) => stripDiacritics(text).toLowerCase().replace(/\s+/g, " ").trim();
const normTag = (tag) => s(tag).trim().toLowerCase().replace(/\s+/g, " ");
const mergeTagLists = (...lists) => {
    const seen = new Set();
    const out = [];
    lists.forEach((list) => {
        (list || []).forEach((tag) => {
            const clean = normTag(tag);
            if (!clean || seen.has(clean)) return;
            seen.add(clean);
            out.push(clean);
        });
    });
    return out;
};
const parseMandatoryTagsByCategory = (promptText) => {
    const map = new Map();
    s(promptText).split(/\r?\n/).forEach((line) => {
        const cleaned = s(line).trim().replace(/^[-*•\d.)\s]+/, "");
        if (!cleaned) return;
        const idx = cleaned.indexOf(":");
        if (idx <= 0) return;
        const left = cleaned.slice(0, idx).trim();
        const right = cleaned.slice(idx + 1).trim();
        if (!right) return;

        const words = left.split(/\s+/).filter(Boolean);
        if (words.length < 3) return;
        const head = normCategoryKey(words.slice(0, 2).join(" "));
        if (head !== "danh muc") return;

        const categoryRaw = words.slice(2).join(" ").trim();
        const categoryKey = normCategoryKey(categoryRaw);
        if (!categoryKey) return;

        const existing = map.get(categoryKey) || [];
        map.set(categoryKey, mergeTagLists(existing, tagsArr(right)));
    });
    return map;
};

/* ===== MODELS AVAILABLE (free tier) ===== */
const ALL_MODELS = [
    // — Gemini 3 (Preview) —
    { id: "gemini-3.1-pro-preview", name: "3.1 Pro Preview", desc: "Mới nhất, mạnh nhất", tier: "3" },
    { id: "gemini-3-pro-preview", name: "3 Pro Preview", desc: "Reasoning mạnh, multimodal", tier: "3" },
    { id: "gemini-3-flash-preview", name: "3 Flash Preview", desc: "Hiệu suất cao, giá rẻ", tier: "3" },
    // — Gemini 2.5 Pro —
    { id: "gemini-2.5-pro", name: "2.5 Pro", desc: "Stable — reasoning sâu", tier: "2.5" },
    { id: "gemini-2.5-pro-preview-06-05", name: "2.5 Pro Preview 06-05", desc: "Preview mới nhất", tier: "2.5" },
    { id: "gemini-2.5-pro-preview-05-06", name: "2.5 Pro Preview 05-06", desc: "Preview 05-06", tier: "2.5" },
    { id: "gemini-2.5-pro-preview-03-25", name: "2.5 Pro Preview 03-25", desc: "Preview 03-25", tier: "2.5" },
    // — Gemini 2.5 Flash —
    { id: "gemini-2.5-flash", name: "2.5 Flash", desc: "Stable — nhanh, best value", tier: "2.5" },
    { id: "gemini-2.5-flash-preview-05-20", name: "2.5 Flash Preview 05-20", desc: "Preview 05-20", tier: "2.5" },
    { id: "gemini-2.5-flash-preview-09-25", name: "2.5 Flash Preview 09-25", desc: "Preview 09-25", tier: "2.5" },
    // — Gemini 2.5 Flash-Lite —
    { id: "gemini-2.5-flash-lite", name: "2.5 Flash-Lite", desc: "Stable — nhẹ nhất 2.5", tier: "2.5" },
    { id: "gemini-2.5-flash-lite-preview-06-17", name: "2.5 Flash-Lite Preview 06-17", desc: "Preview 06-17", tier: "2.5" },
    { id: "gemini-2.5-flash-lite-preview-09-25", name: "2.5 Flash-Lite Preview 09-25", desc: "Preview 09-25", tier: "2.5" },
    // — Gemini 2.0 —
    { id: "gemini-2.0-flash", name: "2.0 Flash", desc: "Gen 2 stable — shutdown 06/2026", tier: "2.0" },
    { id: "gemini-2.0-flash-001", name: "2.0 Flash 001", desc: "Gen 2 versioned", tier: "2.0" },
    { id: "gemini-2.0-flash-lite", name: "2.0 Flash-Lite", desc: "Gen 2 lite — siêu nhanh", tier: "2.0" },
    { id: "gemini-2.0-flash-lite-001", name: "2.0 Flash-Lite 001", desc: "Gen 2 lite versioned", tier: "2.0" },
    { id: "gemini-2.0-flash-lite-preview-02-05", name: "2.0 Flash-Lite Preview", desc: "Preview 02-05", tier: "2.0" },
    { id: "gemini-2.0-flash-lite-preview", name: "2.0 Flash-Lite Preview (latest)", desc: "Preview latest", tier: "2.0" },
    // — Gemini 1.5 —
    { id: "gemini-1.5-pro", name: "1.5 Pro", desc: "Gen 1.5, reasoning tốt", tier: "1.5" },
    { id: "gemini-1.5-flash", name: "1.5 Flash", desc: "Gen 1.5, ổn định", tier: "1.5" },
    { id: "gemini-1.5-flash-8b", name: "1.5 Flash 8B", desc: "Nhỏ nhất, nhanh nhất", tier: "1.5" },
];
const ALL_MODEL_IDS = ALL_MODELS.map((m) => m.id);
const ALL_MODEL_SET = new Set(ALL_MODEL_IDS);

const DEFAULT_PROMPT = `Phân tích hình ảnh chiếc BÁNH này. CHỈ mô tả chiếc bánh, BỎ QUA hoàn toàn background, bàn, phụ kiện, đồ trang trí xung quanh, nến, hộp.

Trả về danh sách tag ngắn gọn (tiếng Việt, viết thường, phân cách bằng dấu phẩy):
- Màu sắc chủ đạo của bánh (vd: hồng, trắng, xanh dương)
- Nhân vật/chủ đề (vd: unicorn, Doraemon, khủng long, hoa)
- Phong cách (vd: cute, sang trọng, vintage, 3D, minimalist)
- Đối tượng phù hợp (vd: bé trai, bé gái, người lớn, trẻ em)
- Hình dáng/kiểu (vd: tròn, vuông, nhiều tầng, cupcake)

Chỉ trả về tag phân cách bằng dấu phẩy, không giải thích, không đánh số.
Ví dụ: hồng, unicorn, cute, bé gái, tròn, kem bơ`;

const PAGE_SIZE = 20;

/* ===== Raw Gemini API call (single key + model) ===== */
async function rawGemini(apiKey, modelId, imageUrl, promptText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const thumbUrl = fixThumbUrl(imageUrl, 400);

    let parts;
    try {
        const imgResp = await fetch(thumbUrl);
        const blob = await imgResp.blob();
        const base64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(blob);
        });
        parts = [{ text: promptText }, { inlineData: { mimeType: blob.type || "image/jpeg", data: base64 } }];
    } catch {
        parts = [{ text: promptText + "\n\n(Không thể tải ảnh.)" }];
    }

    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
        }),
    });

    if (!resp.ok) {
        const status = resp.status;
        let msg = "";
        try {
            const errData = await resp.json();
            if (status === 429) msg = "Rate limit";
            else if (status === 400) msg = "API key không hợp lệ";
            else if (status === 403) msg = "API key bị chặn";
            else msg = errData?.error?.message?.slice(0, 60) || `Lỗi ${status}`;
        } catch { msg = `Lỗi ${status}`; }
        const err = new Error(msg);
        err.status = status;
        throw err;
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return text
        .replace(/[\n\r]+/g, ", ")
        .replace(/^[-•*\d.)\s]+/gm, "")
        .replace(/["']/g, "")
        .split(",")
        .map(t => t.trim().toLowerCase())
        .filter(t => t && t.length < 30)
        .join(", ");
}

/* ===== Smart rotation engine ===== */
// Tries: model[0]+key[0], model[0]+key[1],..., model[1]+key[0], model[1]+key[1],...
async function callWithRotation(keys, models, imageUrl, promptText, onStatus) {
    for (let mi = 0; mi < models.length; mi++) {
        const model = models[mi];
        for (let ki = 0; ki < keys.length; ki++) {
            const key = keys[ki];
            const label = `${model.name || model.id} · Key ${ki + 1}`;
            if (onStatus) onStatus(label);
            try {
                return await rawGemini(key, model.id, imageUrl, promptText);
            } catch (err) {
                if (err.status === 429) {
                    // Rate limited — try next key
                    continue;
                }
                // Other error (400, 403, etc.) — skip this key entirely for all models
                continue;
            }
        }
        // All keys exhausted for this model — move to next model
    }
    throw new Error("Hết quota tất cả key & model");
}

/* ====================== MAIN PANEL ====================== */
export default function AITagsPanel({ canEdit = true }) {
    const [products, setProducts] = useState(() => safe(readLS("products") || []));
    const [filter, setFilter] = useState("missing");
    const [catFilter, setCatFilter] = useState("");
    const [page, setPage] = useState(1);
    const [prompt, setPrompt] = useState(() => {
        // Ưu tiên localStorage (giá trị user vừa edit trên thiết bị này)
        const fromLS = readLS("ai_prompt_template", null);
        if (typeof fromLS === "string" && fromLS.trim()) return fromLS;
        // Fallback: remote config (cho thiết bị mới chưa có localStorage)
        const fromConfig = s(getConfig(KEYS.AI_PROMPT_TEMPLATE, ""));
        if (fromConfig) return fromConfig;
        return DEFAULT_PROMPT;
    });
    const [showPrompt, setShowPrompt] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    // Multi-key management
    const [keys, setKeys] = useState(() => getGeminiKeys());
    const [newKey, setNewKey] = useState("");
    const [syncBusy, setSyncBusy] = useState(false);
    const [syncMsg, setSyncMsg] = useState("");

    // Multi-model management (ordered)
    const [enabledModels, setEnabledModels] = useState(() => {
        // Ưu tiên localStorage (giá trị user vừa edit trên thiết bị này)
        const rawLocal = readLS("ai_models_order", null);
        if (rawLocal) {
            const fromLocal = parseModelOrderRaw(
                Array.isArray(rawLocal) ? JSON.stringify(rawLocal) : String(rawLocal || ""),
                ALL_MODEL_SET
            );
            if (fromLocal.length) return fromLocal;
        }
        // Fallback: remote config
        const fromConfig = parseModelOrderRaw(getConfig(KEYS.GEMINI_MODELS_ORDER, ""), ALL_MODEL_SET);
        if (fromConfig.length) return fromConfig;
        return ALL_MODEL_IDS;
    });

    // Fetch products
    const verP = useRef("");
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const a = await listConfiguredProductSheet().catch(() => null);
                if (a?.ok) {
                    verP.current = a.version;
                    const rows = safe(a.rows).map(normProduct).filter(p => !!s(p.name).trim());
                    if (alive) { setProducts(rows); writeLS("products", rows); }
                } else {
                    const sheetId = getConfig("sheet_id");
                    const gid = getConfig("sheet_gid_products");
                    if (sheetId) {
                        const rawRows = await fetchTabAsObjects({ sheetId, gid: (gid || "0") });
                        const rows = rawRows.map(normProduct).filter(p => !!s(p.name).trim());
                        if (alive) { setProducts(rows); writeLS("products", rows); }
                    }
                }
            } catch { }
        })();
        return () => { alive = false; };
    }, []);

        // Category labels
    const [catMap, setCatMap] = useState(new Map());
    useEffect(() => {
        const sheetId = getConfig("sheet_id");
        const gid = getConfig("sheet_gid_menu") || getConfig("sheet_gid_categories");
        if (!sheetId || !gid) return;
        let alive = true;
        (async () => {
            try {
                const rows = await fetchTabAsObjects({ sheetId, gid });
                const m = new Map();
                for (const r of rows) {
                    const slug = s(r.slug ?? r.code ?? r.value ?? r.path ?? r.key).trim();
                    const name = s(r.name ?? r.title ?? r.label ?? r.ten ?? r["t�n"]).trim();
                    if (slug && name) m.set(slug, name);
                }
                if (alive) setCatMap(m);
            } catch { }
        })();
        return () => { alive = false; };
    }, []);
    const catLabel = (slug) => catMap.get(slug) || slug;

    // ── Chặn ghi đè Sheet khi mount lần đầu (giá trị có thể stale/default) ──
    const mountedKeys = useRef(false);
    const mountedModels = useRef(false);
    const mountedPrompt = useRef(false);

    // Persist local cache + runtime config cache
    useEffect(() => {
        writeLS("ai_gemini_keys", keys);
        setConfig(KEYS.GEMINI_API_KEYS, keys.join("\n"));
        setConfig(KEYS.GEMINI_API_KEY, keys[0] || "");
        if (!mountedKeys.current) { mountedKeys.current = true; return; }
        pushConfigKeyToSheet("gemini_api_keys", keys.join(",")).catch(() => {});
    }, [keys]);
    useEffect(() => {
        writeLS("ai_models_order", enabledModels);
        const joinedStr = enabledModels.join(",");
        setConfig(KEYS.GEMINI_MODELS_ORDER, joinedStr);
        if (!mountedModels.current) { mountedModels.current = true; return; }
        pushConfigKeyToSheet("gemini_models_order", joinedStr).catch(() => {});
    }, [enabledModels]);
    useEffect(() => {
        writeLS("ai_prompt_template", prompt);
        setConfig(KEYS.AI_PROMPT_TEMPLATE, prompt);
        if (!mountedPrompt.current) { mountedPrompt.current = true; return; }
        pushConfigKeyToSheet("ai_prompt_template", prompt).catch(() => {});
    }, [prompt]);

    useEffect(() => {
        const onConfigChanged = () => {
            // Chỉ sync API keys từ remote (do config system quản lý)
            // KHÔNG sync prompt và models ở đây vì sẽ ghi đè local edits
            const latest = getGeminiKeys();
            setKeys((prev) => (sameStringList(prev, latest) ? prev : latest));
        };
        window.addEventListener("hb:config-changed", onConfigChanged);
        return () => window.removeEventListener("hb:config-changed", onConfigChanged);
    }, []);

    // AI state
    const [suggestions, setSuggestions] = useState({});
    const [loading, setLoading] = useState({});
    const [applying, setApplying] = useState({});
    const [errors, setErrors] = useState({});
    const [statusMsg, setStatusMsg] = useState({});
    const [batchRunning, setBatchRunning] = useState(false);
    const batchAbort = useRef(false);
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
    const [applyAllRunning, setApplyAllRunning] = useState(false);
    const applyAllAbort = useRef(false);
    const [applyAllProgress, setApplyAllProgress] = useState({ done: 0, total: 0 });
    const [imgModal, setImgModal] = useState(null);
    const syncTimerRef = useRef(null);
    const lastSyncFingerprintRef = useRef("");
    const hasAdminToken = !!s(getConfig(KEYS.GS_WEBAPP_TOKEN, ""));

    useEffect(() => {
        if (!canEdit) return;
        const fingerprint = JSON.stringify({ keys, models: enabledModels, prompt });
        if (fingerprint === lastSyncFingerprintRef.current) return;

        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(async () => {
            if (!s(getConfig(KEYS.GS_WEBAPP_TOKEN, ""))) {
                setSyncMsg("⚠ Chưa cấu hình GS WebApp Admin Token nên chưa lưu đồng bộ.");
                return;
            }
            setSyncBusy(true);
            try {
                const authToken = s(getConfig(KEYS.GS_WEBAPP_TOKEN, ""));
                const result = await saveAITagsConfigToSheet(
                    { keys, models: enabledModels, prompt },
                    { authToken }
                );
                lastSyncFingerprintRef.current = fingerprint;
                setSyncMsg(`✅ Đã lưu AI config lên tab ${result.sheetName}`);
            } catch (e) {
                setSyncMsg(`⚠ Chưa lưu AI config lên Sheet: ${e?.message || "lỗi không xác định"}`);
            } finally {
                setSyncBusy(false);
            }
        }, 900);

        return () => {
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        };
    }, [canEdit, keys, enabledModels, prompt]);

    const activeModels = useMemo(() =>
        enabledModels.map(id => ALL_MODELS.find(m => m.id === id)).filter(Boolean),
        [enabledModels]
    );

    const view = useMemo(() => {
        let arr = products;
        if (filter === "missing") arr = arr.filter(p => !s(p.tags).trim());
        if (catFilter) arr = arr.filter(p => p.category === catFilter);
        return arr;
    }, [products, filter, catFilter]);

    const categories = useMemo(() => {
        const set = new Set();
        products.forEach(p => { if (p.category) set.add(p.category); });
        return [...set].sort();
    }, [products]);
    const mandatoryTagsByCategory = useMemo(() => parseMandatoryTagsByCategory(prompt), [prompt]);
    const mergeWithMandatoryTags = useCallback((product, tagsText) => {
        const categoryKey = normCategoryKey(product?.category || "");
        const required = mandatoryTagsByCategory.get(categoryKey) || [];
        const merged = mergeTagLists(required, tagsArr(tagsText));
        return merged.join(", ");
    }, [mandatoryTagsByCategory]);

    const totalPages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = view.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    useEffect(() => { setPage(1); }, [filter, catFilter]);

    /* Tag single product with rotation */
    const tagOne = useCallback(async (product) => {
        if (!canEdit || !keys.length || !activeModels.length) return;
        const img = firstImg(product);
        if (!img) { setErrors(e => ({ ...e, [product.id]: "Không có ảnh" })); return; }
        setLoading(l => ({ ...l, [product.id]: true }));
        setErrors(e => { const n = { ...e }; delete n[product.id]; return n; });
        
        // Cung cấp thêm context Tên và Danh mục cho AI bên dưới prompt gốc
        const finalPrompt = `${prompt.trim()}\n\n[THÔNG TIN SẢN PHẨM HIỆN TẠI]\n- Tên sản phẩm: ${product.name}\n- Danh mục (category): ${product.category || "Không rõ"}`;
        
        try {
            const tags = await callWithRotation(keys, activeModels, img, finalPrompt,
                (label) => setStatusMsg(s => ({ ...s, [product.id]: label }))
            );
            const mergedTags = mergeWithMandatoryTags(product, tags);
            setSuggestions(s => ({ ...s, [product.id]: mergedTags }));
            setStatusMsg(s => { const n = { ...s }; delete n[product.id]; return n; });
        } catch (err) {
            setErrors(e => ({ ...e, [product.id]: err.message }));
        } finally {
            setLoading(l => { const n = { ...l }; delete n[product.id]; return n; });
        }
    }, [activeModels, canEdit, keys, prompt, mergeWithMandatoryTags]);

    const applyTags = useCallback(async (product, tags) => {
        if (!canEdit || !hasAdminToken) return;
        if (applying[product.id]) return;
        setApplying((state) => ({ ...state, [product.id]: true }));
        const finalTags = mergeTagLists(tagsArr(tags)).join(", ");
        const clean = { ...product, tags: finalTags };
        try {
            await updateConfiguredProductRow(clean);
            setProducts((prev) => {
                const next = prev.map((p) => (p.id === product.id ? clean : p));
                writeLS("products", next);
                return next;
            });
            setSuggestions(s => { const n = { ...s }; delete n[product.id]; return n; });
            audit("ai.tags.apply", { productId: product.id, name: product.name, tags: finalTags, user: (readLS(LS.AUTH) || {}).username || "?" });
        } catch (e) {
            console.error("AI apply tags failed:", e);
            setErrors(err => ({ ...err, [product.id]: e?.message || "Không lưu được tag vào Sheet" }));
        } finally {
            setApplying((state) => {
                const next = { ...state };
                delete next[product.id];
                return next;
            });
        }
    }, [canEdit, hasAdminToken, applying]);
    const openEditor = useCallback((product) => {
        if (!canEdit || !hasAdminToken) return;
        setSuggestions((state) => ({
            ...state,
            [product.id]: Object.prototype.hasOwnProperty.call(state, product.id) ? state[product.id] : s(product.tags),
        }));
        setErrors((state) => {
            const next = { ...state };
            delete next[product.id];
            return next;
        });
    }, [canEdit, hasAdminToken]);

    const runBatch = useCallback(async () => {
        if (!canEdit || !keys.length || !activeModels.length) return;
        const targets = paged.filter((p) => firstImg(p) && !Object.prototype.hasOwnProperty.call(suggestions, p.id) && !loading[p.id]);
        if (!targets.length) return;
        setBatchRunning(true);
        batchAbort.current = false;
        setBatchProgress({ done: 0, total: targets.length });
        for (let i = 0; i < targets.length; i++) {
            if (batchAbort.current) break;
            await tagOne(targets[i]);
            setBatchProgress({ done: i + 1, total: targets.length });
            if (i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
        }
        setBatchRunning(false);
    }, [activeModels, canEdit, keys, loading, paged, suggestions, tagOne]);
    const runApplyAll = useCallback(async () => {
        if (!canEdit || !hasAdminToken || applyAllRunning) return;
        const targets = paged.filter((p) => Object.prototype.hasOwnProperty.call(suggestions, p.id) && !applying[p.id]);
        if (!targets.length) return;
        setApplyAllRunning(true);
        applyAllAbort.current = false;
        setApplyAllProgress({ done: 0, total: targets.length });
        for (let i = 0; i < targets.length; i++) {
            if (applyAllAbort.current) break;
            const product = targets[i];
            const nextTags = suggestions[product.id] ?? "";
            await applyTags(product, nextTags);
            setApplyAllProgress({ done: i + 1, total: targets.length });
        }
        setApplyAllRunning(false);
    }, [applyAllRunning, applying, canEdit, hasAdminToken, paged, suggestions, applyTags]);

    const stopBatch = () => { batchAbort.current = true; };
    const stopApplyAll = () => { applyAllAbort.current = true; };

    // Key management functions
    const addKey = () => {
        if (!canEdit) return;
        const incoming = String(newKey || "")
            .split(/[\r\n,;|]+/)
            .map((x) => x.trim())
            .filter(Boolean);
        if (!incoming.length) return;
        const normalized = setGeminiKeys([...keys, ...incoming]);
        setKeys(normalized);
        setNewKey("");
    };
    const removeKey = (i) => {
        if (!canEdit) return;
        const normalized = setGeminiKeys(keys.filter((_, idx) => idx !== i));
        setKeys(normalized);
    };

    // Model order management — drag & drop
    const [dragId, setDragId] = useState(null);
    const toggleModel = (id) => {
        setEnabledModels(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };
    const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
    const onDragOver = (e, targetId) => {
        e.preventDefault();
        if (!dragId || dragId === targetId) return;
        setEnabledModels(prev => {
            const from = prev.indexOf(dragId), to = prev.indexOf(targetId);
            if (from === -1 || to === -1) return prev;
            const next = [...prev];
            next.splice(from, 1);
            next.splice(to, 0, dragId);
            return next;
        });
    };
    const onDragEnd = () => setDragId(null);

    /* ===== RENDER ===== */
    if (!keys.length) {
        return (
            <div className="space-y-4">
                <PageHeader
                    title="Gắn tag AI"
                    description="Gợi ý tag hàng loạt từ ảnh sản phẩm."
                    compact
                    chips={<Badge variant="warning">Chưa có Gemini API key</Badge>}
                />
                <Section title="Khởi tạo nguồn AI" compact>
                    <div className="space-y-3">
                        <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-sm leading-6 text-blue-300">
                            <div>1. Truy cập <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="underline font-medium">aistudio.google.com/apikey</a></div>
                            <div>2. Tạo nhiều API key để xoay vòng quota</div>
                            <div>3. Dán key vào ô dưới để bắt đầu</div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input className="h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 sm:w-80"
                                value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="AIzaSy..." onKeyDown={e => e.key === "Enter" && addKey()} />
                            <button disabled={!canEdit || syncBusy} onClick={addKey} className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50">Thêm key</button>
                        </div>
                        {syncMsg && <p className={`text-xs ${syncMsg.startsWith("⚠") ? "text-amber-300" : "text-emerald-300"}`}>{syncMsg}</p>}
                    </div>
                </Section>
            </div>
        );
    }

    const missingProducts = products.filter((p) => !s(p.tags).trim()).length;
    const suggestionCount = Object.keys(suggestions).length;
    const pendingOnPage = paged.filter((p) => firstImg(p) && !Object.prototype.hasOwnProperty.call(suggestions, p.id)).length;

    return (<>
        <div className="space-y-4">
            <PageHeader
                title="Gắn tag AI"
                description="Bảng gợi ý và áp dụng tag từ ảnh sản phẩm."
                compact
                chips={
                    <>
                        <Badge variant="info">{keys.length} key</Badge>
                        <Badge variant="violet">{activeModels.length} model</Badge>
                        <Badge variant={hasAdminToken ? "success" : "warning"}>
                            {hasAdminToken ? "Có quyền ghi Sheet" : "Chưa có token ghi Sheet"}
                        </Badge>
                    </>
                }
            />

            <MetricStrip columnsClassName="xl:grid-cols-4">
                <MetricItem label="Tổng sản phẩm" value={products.length} meta="Dữ liệu đang nạp trong panel" tone="blue" />
                <MetricItem label="Thiếu tag" value={missingProducts} meta="Đang cần AI hoặc chỉnh tay" tone="amber" />
                <MetricItem label="Đã gợi ý" value={suggestionCount} meta="Gợi ý đang chờ áp dụng" tone="violet" />
                <MetricItem label="Hàng chờ trang này" value={pendingOnPage} meta="Có ảnh và chưa có gợi ý" tone="emerald" />
            </MetricStrip>

            {!canEdit && (
                <Callout tone="warning" title="Chế độ chỉ xem">
                    Tài khoản này chỉ được xem tag hiện tại. Chạy AI và áp dụng tag đã bị khóa.
                </Callout>
            )}
            {canEdit && !hasAdminToken && (
                <Callout tone="warning" title="Chưa có token ghi Sheet">
                    Có thể chạy AI gợi ý nhưng chưa lưu được lên Sheet.
                </Callout>
            )}

            <div className="space-y-1.5">

                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Điều khiển AI</span>
                    <div className="flex items-center gap-1 ml-auto">
                        <button onClick={() => setShowConfig(!showConfig)}
                            className={`h-8 px-3 text-[11px] font-medium rounded-xl border transition ${showConfig ? "bg-blue-500/12 text-blue-300 border-blue-500/30" : "border-slate-800 text-slate-400 hover:bg-slate-900"}`}>
                            Cấu hình
                        </button>
                        <button onClick={() => setShowPrompt(!showPrompt)}
                            className={`h-8 px-3 text-[11px] font-medium rounded-xl border transition ${showPrompt ? "bg-violet-500/12 text-violet-300 border-violet-500/30" : "border-slate-800 text-slate-400 hover:bg-slate-900"}`}>
                            Prompt
                        </button>
                    </div>
                </div>

                {/* ── Config panel (collapsible) ── */}
                {showConfig && (
                    <Section title="Cấu hình AI" compact className="!shadow-none">
                    <div className="space-y-3">
                        {/* Keys - compact badges */}
                        <div>
                            <div className="mb-1.5 text-[11px] font-semibold text-slate-300">API Keys ({keys.length})</div>
                            <div className="flex flex-wrap gap-1 mb-2">
                                {keys.map((k, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[10px]">
                                        <span className="font-mono text-slate-400">{k.slice(0, 6)}…{k.slice(-3)}</span>
                                        <button onClick={() => removeKey(i)} className="text-red-400 hover:text-red-600 leading-none">✕</button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-1 items-center">
                                <input className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-300"
                                    value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Dán API key mới..." onKeyDown={e => e.key === "Enter" && addKey()} />
                                <button disabled={!canEdit || syncBusy} onClick={addKey} className="h-9 shrink-0 rounded-xl bg-blue-600 px-3 text-xs text-white transition hover:bg-blue-500 disabled:opacity-50">+ Thêm</button>
                            </div>
                            {syncMsg && <p className={`mt-1 text-[10px] ${syncMsg.startsWith("⚠") ? "text-amber-300" : "text-emerald-300"}`}>{syncMsg}</p>}
                        </div>
                        {/* Models */}
                        <div>
                            <div className="mb-1.5 text-[11px] font-semibold text-slate-300">Model <span className="font-normal text-slate-500">(tick bật · kéo thả)</span></div>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-1">
                                {enabledModels.map(id => ALL_MODELS.find(m => m.id === id)).filter(Boolean).map(m => {
                                    const idx = enabledModels.indexOf(m.id);
                                    return (
                                        <div key={m.id} draggable onDragStart={e => onDragStart(e, m.id)} onDragOver={e => onDragOver(e, m.id)} onDragEnd={onDragEnd}
                                            className={`flex items-center gap-1 rounded-xl border px-2 py-1.5 text-xs select-none ${dragId === m.id ? "opacity-40 border-violet-400 bg-violet-500/12" : "border-violet-500/25 bg-violet-500/8 cursor-grab"}`}>
                                            <span className="text-slate-500 text-[9px]">⠿</span>
                                            <input type="checkbox" checked onChange={() => toggleModel(m.id)} className="accent-purple-600 shrink-0 w-3 h-3" />
                                            <span className="flex-1 min-w-0 truncate text-[10px] font-medium text-slate-200">{m.name}</span>
                                            <span className="text-[9px] font-bold text-violet-300">#{idx + 1}</span>
                                        </div>
                                    );
                                })}
                                {ALL_MODELS.filter(m => !enabledModels.includes(m.id)).map(m => (
                                    <div key={m.id} className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs opacity-60">
                                        <input type="checkbox" checked={false} onChange={() => toggleModel(m.id)} className="accent-purple-600 shrink-0 w-3 h-3" />
                                        <span className="flex-1 min-w-0 truncate text-[10px] font-medium text-slate-400">{m.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    </Section>
                )}

                {/* Prompt editor */}
                {showPrompt && (
                    <Section title="Prompt" compact className="!shadow-none">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold text-violet-300">Prompt Template</span>
                            <button onClick={() => setPrompt(DEFAULT_PROMPT)} className="text-[10px] text-violet-400 hover:text-violet-300">Reset</button>
                        </div>
                        <textarea className="w-full rounded-xl border border-violet-500/30 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-300/20"
                            style={{ minHeight: "6rem", height: "auto", fieldSizing: "content" }}
                            value={prompt} onChange={e => setPrompt(e.target.value)} />
                    </Section>
                )}

                {/* ── Row 2: danh mục + filter chips (full width stretch) ── */}
                {(() => {
                    const base = catFilter ? products.filter(p => p.category === catFilter) : products;
                    const missingCount = base.filter(p => !s(p.tags).trim()).length;
                    return (
                        <div className="flex items-center gap-1">
                            {/* Danh mục dropdown - flex-1 */}
                            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                                className={`flex-1 min-w-0 h-7 px-2 pr-5 text-[10px] font-medium rounded-full border appearance-none bg-no-repeat cursor-pointer focus:outline-none ${catFilter ? "bg-purple-50 text-purple-700 border-purple-200" : "border-gray-200 text-gray-500 bg-white"}`}
                                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 5px center" }}>
                                <option value="">📁 Danh mục</option>
                                {categories.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
                            </select>
                            {/* Thiếu tag - flex-1 */}
                            <button onClick={() => setFilter("missing")}
                                className={`flex-1 h-7 px-1 text-[10px] font-medium rounded-full border transition text-center ${filter === "missing" ? "bg-orange-50 text-orange-700 border-orange-200" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                Thiếu&nbsp;({missingCount})
                            </button>
                            {/* Tất cả - flex-1 */}
                            <button onClick={() => setFilter("all")}
                                className={`flex-1 h-7 px-1 text-[10px] font-medium rounded-full border transition text-center ${filter === "all" ? "bg-blue-50 text-blue-700 border-blue-200" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                Tất&nbsp;cả&nbsp;({base.length})
                            </button>
                        </div>
                    );
                })()}

                {/* ── Row 3: auto-tag left · pagination right ── */}
                <div className="flex items-center justify-between">
                    {/* Auto-tag button - left */}
                    <div className="flex items-center gap-1.5">
                    {batchRunning ? (
                        <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 animate-spin text-purple-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            <span className="text-[10px] text-purple-600">{batchProgress.done}/{batchProgress.total}</span>
                            <button onClick={stopBatch} className="h-6 px-2 text-[10px] font-medium text-red-600 border border-red-200 rounded-full hover:bg-red-50 transition">Dừng</button>
                        </div>
                    ) : (
                        <button onClick={runBatch} disabled={!canEdit || applyAllRunning || !paged.some((p) => firstImg(p) && !Object.prototype.hasOwnProperty.call(suggestions, p.id))}
                            className="h-7 px-3 text-[10px] font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-full shadow-sm transition disabled:opacity-40">
                            ✨ ({paged.filter((p) => firstImg(p) && !Object.prototype.hasOwnProperty.call(suggestions, p.id)).length})
                        </button>
                    )}
                    {applyAllRunning ? (
                        <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            <span className="text-[10px] text-emerald-600">{applyAllProgress.done}/{applyAllProgress.total}</span>
                            <button onClick={stopApplyAll} className="h-6 px-2 text-[10px] font-medium text-red-600 border border-red-200 rounded-full hover:bg-red-50 transition">Dung</button>
                        </div>
                    ) : (
                        <button onClick={runApplyAll}
                            disabled={!canEdit || !hasAdminToken || batchRunning || !paged.some((p) => Object.prototype.hasOwnProperty.call(suggestions, p.id))}
                            className="h-7 px-3 text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full shadow-sm transition disabled:opacity-40">
                            Ap dung tat ca ({paged.filter((p) => Object.prototype.hasOwnProperty.call(suggestions, p.id)).length})
                        </button>
                    )}
                    </div>
                    {/* Pagination - right */}
                    {totalPages > 1 && (() => {
                        const pages = [];
                        const add = n => { if (n >= 1 && n <= totalPages && !pages.includes(n)) pages.push(n); };
                        add(1); add(safePage - 1); add(safePage); add(safePage + 1); add(totalPages);
                        pages.sort((a, b) => a - b);
                        return (
                            <div className="flex items-center gap-0.5">
                                <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
                                </PgBtn>
                                {pages.map((pg, idx) => {
                                    const prev = pages[idx - 1];
                                    return (
                                        <span key={pg} className="flex items-center gap-0.5">
                                            {prev && pg - prev > 1 && <span className="text-[10px] text-gray-300">…</span>}
                                            <button onClick={() => setPage(pg)}
                                                className={`min-w-[22px] h-6 px-0.5 text-[10px] rounded-md border transition ${pg === safePage ? "bg-purple-600 text-white border-purple-600 font-bold" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{pg}</button>
                                        </span>
                                    );
                                })}
                                <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                                </PgBtn>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Mobile Card View - tag-focused */}
            <div className="flex-1 overflow-y-auto md:hidden space-y-1.5 pt-1">
                {paged.map(p => {
                    const thumb = firstImg(p) ? fixThumbUrl(firstImg(p), 96) : null;
                    const currentTags = tagsArr(p.tags);
                    const hasSuggestion = Object.prototype.hasOwnProperty.call(suggestions, p.id);
                    const aiTags = hasSuggestion ? suggestions[p.id] : "";
                    const isLoading = loading[p.id];
                    const isApplying = !!applying[p.id];
                    const error = errors[p.id];
                    const status = statusMsg[p.id];
                    return (
                        <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-2.5 px-3 py-2.5">
                                {/* Thumb - click to zoom */}
                                <div className="h-12 w-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200/60 shrink-0 cursor-pointer hover:ring-2 hover:ring-purple-400 transition"
                                    onClick={() => { const raw = firstImg(p); raw && setImgModal(raw); }}>
                                    {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} /> : <span className="w-full h-full flex items-center justify-center text-xl">🎂</span>}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-gray-800 truncate">{p.name}</div>
                                    <div className="text-[10px] text-gray-400">{catLabel(p.category)}</div>
                                </div>
                                <div className="shrink-0 flex items-center gap-1">
                                    <button
                                        onClick={() => openEditor(p)}
                                        disabled={!canEdit || !hasAdminToken || applyAllRunning || isLoading || isApplying}
                                        className="h-8 w-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition disabled:opacity-30 flex items-center justify-center"
                                        title="Sửa tag"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                                    </button>
                                    <button
                                        onClick={() => tagOne(p)}
                                        disabled={!canEdit || applyAllRunning || isLoading || isApplying || !firstImg(p)}
                                        className="h-8 w-8 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 hover:bg-purple-100 transition disabled:opacity-30 flex items-center justify-center text-base"
                                        title="AI gợi ý tag"
                                    >
                                        {isLoading ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : "✨"}
                                    </button>
                                </div>
                            </div>
                            {/* Tags area */}
                            <div className="px-3 pb-2.5">
                                {error ? (
                                    <div className="text-[10px] text-red-500 bg-red-50 rounded-lg px-2 py-1">{error}</div>
                                ) : isLoading ? (
                                    <div className="text-[10px] text-purple-500 animate-pulse">{status || "Đang phân tích..."}</div>
                                ) : hasSuggestion ? (
                                    <div className="space-y-1.5">
                                        <div className="text-[9px] text-purple-600 font-semibold uppercase tracking-wider">✨ AI gợi ý:</div>
                                        <AITagEditor tags={aiTags} canEdit={canEdit && hasAdminToken} isApplying={isApplying || applyAllRunning}
                                            onApply={(tags) => applyTags(p, tags)}
                                            onChange={(tags) => setSuggestions((s) => ({ ...s, [p.id]: tags }))}
                                            onDismiss={() => setSuggestions(s => { const n = { ...s }; delete n[p.id]; return n; })} />
                                    </div>
                                ) : currentTags.length > 0 ? (
                                    <div className="flex flex-wrap gap-0.5">
                                        {currentTags.map((t, i) => <span key={i} className="inline-block px-1.5 py-0.5 text-[9px] rounded bg-gray-100 text-gray-600 border border-gray-200">{t}</span>)}
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-gray-300 italic">Chưa có tag — nhấn ✨ để AI gán</span>
                                )}
                            </div>
                        </div>
                    );
                })}
                {view.length === 0 && <div className="py-16 text-center"><div className="text-3xl mb-2 opacity-30">🎉</div><div className="text-sm text-gray-400">{filter === "missing" ? "Tất cả sản phẩm đã có tag!" : "Không có sản phẩm nào"}</div></div>}
            </div>

            {/* Desktop Table - hidden on mobile */}
            <div className="hidden md:block flex-1 overflow-auto bg-white rounded-xl border border-gray-200/80 shadow-sm">
                <table className="w-full text-sm min-w-[500px]" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                        <col style={{ width: "4rem" }} />
                        <col style={{ width: "10rem" }} />
                        <col />
                        <col />
                        <col style={{ width: "4rem" }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-gray-200">
                            <th className="py-2.5 px-3 bg-gray-50"></th>
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Sản phẩm</th>
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Tag hiện tại</th>
                            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">AI gợi ý</th>
                            <th className="py-2.5 px-3 bg-gray-50"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {paged.map(p => {
                            const thumb = fixThumbUrl(firstImg(p), 96);
                            const currentTags = tagsArr(p.tags);
                            const hasSuggestion = Object.prototype.hasOwnProperty.call(suggestions, p.id);
                            const aiTags = hasSuggestion ? suggestions[p.id] : "";
                            const isLoading = loading[p.id];
                            const isApplying = !!applying[p.id];
                            const error = errors[p.id];
                            const status = statusMsg[p.id];
                            return (
                                <tr key={p.id} className="group hover:bg-blue-50/20 transition-colors">
                                    <td className="py-2 px-3">
                                        <div className="cursor-pointer hover:ring-2 hover:ring-purple-400 rounded-lg transition inline-block"
                                          onClick={() => { const raw = firstImg(p); raw && setImgModal(raw); }}>
                                          {thumb ? (
                                            <img src={thumb} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" loading="lazy" onError={e => { e.target.style.display = "none"; }} />
                                          ) : (
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg">🎂</div>
                                          )}
                                        </div>
                                    </td>
                                    <td className="py-2 px-3">
                                        <div className="text-xs font-medium text-gray-800 truncate">{p.name}</div>
                                        <div className="text-[10px] text-gray-400">{p.id} · {catLabel(p.category)}</div>
                                    </td>
                                    <td className="py-2 px-3">
                                        {currentTags.length > 0 ? (
                                            <div className="flex flex-wrap gap-0.5">
                                                {currentTags.map((t, i) => (
                                                    <span key={i} className="inline-block px-1.5 py-0.5 text-[9px] rounded bg-gray-100 text-gray-600 border border-gray-200">{t}</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-gray-300 italic">Chưa có tag</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-3">
                                        {isLoading ? (
                                            <div className="flex items-center gap-2 text-xs text-purple-500">
                                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                <span className="truncate">{status || "Đang phân tích..."}</span>
                                            </div>
                                        ) : error ? (
                                            <span className="text-[10px] text-red-500 font-medium">{error}</span>
                                        ) : hasSuggestion ? (
                                            <AITagEditor tags={aiTags} canEdit={canEdit && hasAdminToken} isApplying={isApplying || applyAllRunning} onApply={(tags) => applyTags(p, tags)}
                                                onChange={(tags) => setSuggestions((s) => ({ ...s, [p.id]: tags }))}
                                                onDismiss={() => setSuggestions(s => { const n = { ...s }; delete n[p.id]; return n; })} />
                                        ) : (
                                            <span className="text-[10px] text-gray-300">—</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-3">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => openEditor(p)}
                                                disabled={!canEdit || !hasAdminToken || applyAllRunning || isLoading || isApplying}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-30"
                                                title="Sửa tag"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                                            </button>
                                            <button
                                                onClick={() => tagOne(p)}
                                                disabled={!canEdit || applyAllRunning || isLoading || isApplying || !firstImg(p)}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition disabled:opacity-30"
                                                title="AI gợi ý tag"
                                            >
                                                {isLoading ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : "✨"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {view.length === 0 && (
                    <div className="py-16 text-center">
                        <div className="text-3xl mb-2 opacity-30">🎉</div>
                        <div className="text-sm text-gray-400">{filter === "missing" ? "Tất cả sản phẩm đã có tag!" : "Không có sản phẩm nào"}</div>
                    </div>
                )}
            </div>
        </div>

      {/* Image Lightbox Modal */}
      {imgModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={() => setImgModal(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={imgModal} alt=""
              className="block rounded-2xl shadow-2xl object-contain"
              style={{ width: 320, height: 320 }}
              onError={e => {
                // Fallback: try with lh3 thumbnail at 400px
                const m = imgModal.match(/[?&]id=([a-zA-Z0-9_-]+)/) || imgModal.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (m && !e.currentTarget.src.includes('lh3')) {
                  e.currentTarget.src = `https://lh3.googleusercontent.com/d/${m[1]}=w400`;
                }
              }}
            />
            <button onClick={() => setImgModal(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-900 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
    );
}

function AITagEditor({ tags, canEdit = true, isApplying = false, onApply, onDismiss, onChange }) {
    const [editing, setEditing] = useState(tags);
    const disabled = !canEdit || isApplying;
    useEffect(() => {
        setEditing(tags);
    }, [tags]);
    const handleChange = (value) => {
        setEditing(value);
        if (typeof onChange === "function") onChange(value);
    };
    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap gap-0.5">
                {editing.split(",").map(t => t.trim()).filter(Boolean).map((t, i) => (
                    <span key={i} className="inline-block px-1.5 py-0.5 text-[9px] rounded bg-purple-50 text-purple-700 border border-purple-200">{t}</span>
                ))}
            </div>
            <input className="w-full border border-purple-200 rounded px-2 py-1 text-[10px] bg-purple-50/30 focus:outline-none focus:ring-1 focus:ring-purple-300 disabled:opacity-60"
                value={editing} onChange={e => handleChange(e.target.value)} disabled={disabled} />
            <div className="flex gap-1">
                <button
                    disabled={disabled}
                    onClick={() => onApply(editing)}
                    className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500 text-white rounded hover:bg-emerald-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isApplying ? (
                        <span className="inline-flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Đang áp dụng...
                        </span>
                    ) : "Áp dụng"}
                </button>
                <button
                    onClick={onDismiss}
                    disabled={isApplying}
                    className="px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Bỏ
                </button>
            </div>
        </div>
    );
}
const PgBtn = ({ children, ...p }) => <button {...p} className="w-6 h-6 flex items-center justify-center text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition">{children}</button>;
