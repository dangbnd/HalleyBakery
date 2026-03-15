// src/components/Admin/panels/AITagsPanel.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { readLS, writeLS, audit } from "../../../utils.js";
import { getConfig } from "../../../utils/config.js";
import { listSheet, updateToSheet } from "../shared/sheets.js";
import { fetchTabAsObjects } from "../../../services/sheets.js";

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
    active: !!(row.active ?? true),
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
export default function AITagsPanel() {
    const [products, setProducts] = useState(() => safe(readLS("products") || []));
    const [filter, setFilter] = useState("missing");
    const [catFilter, setCatFilter] = useState("");
    const [page, setPage] = useState(1);
    const [prompt, setPrompt] = useState(() => readLS("ai_prompt_template", DEFAULT_PROMPT));
    const [showPrompt, setShowPrompt] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    // Multi-key management
    const [keys, setKeys] = useState(() => {
        const saved = readLS("ai_gemini_keys", null);
        if (saved && Array.isArray(saved) && saved.length) return saved;
        // Migrate from single key
        const single = getConfig("gemini_api_key");
        return single ? [single] : [];
    });
    const [newKey, setNewKey] = useState("");

    // Multi-model management (ordered)
    const [enabledModels, setEnabledModels] = useState(() =>
        readLS("ai_models_order", ALL_MODELS.map(m => m.id))
    );

    // Fetch products
    const verP = useRef("");
    useEffect(() => {
        let t, alive = true;
        const loop = async () => {
            try {
                const a = await listSheet("Products");
                if (a?.ok && a.version !== verP.current) {
                    verP.current = a.version;
                    const rows = safe(a.rows).map(normProduct).filter(p => !!s(p.name).trim());
                    setProducts(rows); writeLS("products", rows);
                }
            } catch { }
            if (alive) t = setTimeout(loop, 15000);
        };
        loop();
        return () => { alive = false; clearTimeout(t); };
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

    // Persist keys & models
    useEffect(() => { writeLS("ai_gemini_keys", keys); }, [keys]);
    useEffect(() => { writeLS("ai_models_order", enabledModels); }, [enabledModels]);
    useEffect(() => { writeLS("ai_prompt_template", prompt); }, [prompt]);

    // AI state
    const [suggestions, setSuggestions] = useState({});
    const [loading, setLoading] = useState({});
    const [errors, setErrors] = useState({});
    const [statusMsg, setStatusMsg] = useState({});
    const [batchRunning, setBatchRunning] = useState(false);
    const batchAbort = useRef(false);
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

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

    const totalPages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = view.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    useEffect(() => { setPage(1); }, [filter, catFilter]);

    /* Tag single product with rotation */
    const tagOne = useCallback(async (product) => {
        if (!keys.length || !activeModels.length) return;
        const img = firstImg(product);
        if (!img) { setErrors(e => ({ ...e, [product.id]: "Không có ảnh" })); return; }
        setLoading(l => ({ ...l, [product.id]: true }));
        setErrors(e => { const n = { ...e }; delete n[product.id]; return n; });
        try {
            const tags = await callWithRotation(keys, activeModels, img, prompt,
                (label) => setStatusMsg(s => ({ ...s, [product.id]: label }))
            );
            setSuggestions(s => ({ ...s, [product.id]: tags }));
            setStatusMsg(s => { const n = { ...s }; delete n[product.id]; return n; });
        } catch (err) {
            setErrors(e => ({ ...e, [product.id]: err.message }));
        } finally {
            setLoading(l => { const n = { ...l }; delete n[product.id]; return n; });
        }
    }, [keys, activeModels, prompt]);

    const applyTags = useCallback(async (product, tags) => {
        const clean = { ...product, tags };
        try {
            await updateToSheet("Products", clean);
            const next = products.map(p => p.id === product.id ? clean : p);
            setProducts(next);
            writeLS("products", next);
            setSuggestions(s => { const n = { ...s }; delete n[product.id]; return n; });
            audit("ai.tags.apply", { productId: product.id, name: product.name, tags, user: (readLS("auth") || {}).username || "?" });
        } catch (e) {
            console.error("AI apply tags failed:", e);
            setErrors(err => ({ ...err, [product.id]: "Không lưu được tag vào Sheet" }));
        }
    }, [products]);

    const runBatch = useCallback(async () => {
        if (!keys.length || !activeModels.length) return;
        const targets = paged.filter(p => firstImg(p) && !suggestions[p.id] && !loading[p.id]);
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
    }, [keys, activeModels, paged, suggestions, loading, tagOne]);

    const stopBatch = () => { batchAbort.current = true; };

    // Key management functions
    const addKey = () => {
        const k = newKey.trim();
        if (k && !keys.includes(k)) { setKeys([...keys, k]); setNewKey(""); }
    };
    const removeKey = (i) => setKeys(keys.filter((_, idx) => idx !== i));

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
            <div className="flex flex-col items-center justify-center py-24">
                <span className="text-5xl mb-4">✨</span>
                <h2 className="text-lg font-semibold text-gray-800 mb-2">AI Magic Tags</h2>
                <p className="text-sm text-gray-500 mb-4">Thêm ít nhất 1 Gemini API Key để bắt đầu</p>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-md text-sm text-blue-700 space-y-2">
                    <p>1. Truy cập <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="underline font-medium">aistudio.google.com/apikey</a></p>
                    <p>2. Tạo nhiều API key (mỗi key = 15 req/phút riêng)</p>
                    <p>3. Thêm key vào đây:</p>
                </div>
                <div className="flex gap-2 mt-4">
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-80 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="AIzaSy..." onKeyDown={e => e.key === "Enter" && addKey()} />
                    <button onClick={addKey} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">Thêm</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
            <div className="shrink-0">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm shadow">✨</span>
                            AI Magic Tags
                        </h2>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{keys.length} key · {activeModels.length} model</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowConfig(!showConfig)}
                            className={`h-8 px-3 text-xs font-medium rounded-lg border transition ${showConfig ? "bg-blue-50 text-blue-700 border-blue-200" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                            ⚙️ Key & Model
                        </button>
                        <button onClick={() => setShowPrompt(!showPrompt)}
                            className={`h-8 px-3 text-xs font-medium rounded-lg border transition ${showPrompt ? "bg-purple-50 text-purple-700 border-purple-200" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                            📝 Prompt
                        </button>
                    </div>
                </div>

                {showConfig && (
                    <div className="mb-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                        {/* Keys row */}
                        <div className="mb-4">
                            <div className="text-xs font-semibold text-gray-700 mb-2">🔑 API Keys ({keys.length})</div>
                            <div className="flex flex-wrap gap-1 mb-2">
                                {keys.map((k, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                                        <span className="font-mono text-gray-500">{k.slice(0, 8)}...{k.slice(-4)}</span>
                                        <span className="text-[10px] text-gray-400">#{i + 1}</span>
                                        <button onClick={() => removeKey(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                <input className="flex-1 max-w-md border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                                    value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Dán API key mới..." onKeyDown={e => e.key === "Enter" && addKey()} />
                                <button onClick={addKey} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition">+ Thêm</button>
                                <span className="self-center text-[10px] text-gray-400 ml-2">Tạo tại <a href="https://aistudio.google.com/apikey" target="_blank" className="underline">aistudio.google.com/apikey</a></span>
                            </div>
                        </div>
                        {/* Models — full width, drag to reorder */}
                        <div>
                            <div className="text-xs font-semibold text-gray-700 mb-2">🤖 Model — tick bật, kéo thả sắp thứ tự</div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {/* Enabled models (draggable, in order) */}
                                {enabledModels.map(id => ALL_MODELS.find(m => m.id === id)).filter(Boolean).map(m => {
                                    const idx = enabledModels.indexOf(m.id);
                                    return (
                                        <div key={m.id}
                                            draggable onDragStart={e => onDragStart(e, m.id)} onDragOver={e => onDragOver(e, m.id)} onDragEnd={onDragEnd}
                                            className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-2 border transition select-none ${dragId === m.id ? "opacity-40 border-purple-400 bg-purple-100" : "bg-purple-50/60 border-purple-200 cursor-grab active:cursor-grabbing"}`}>
                                            <span className="text-gray-300 shrink-0 text-[10px] cursor-grab">⠿</span>
                                            <input type="checkbox" checked onChange={() => toggleModel(m.id)} className="accent-purple-600 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-gray-700 truncate text-[11px]">{m.name}</div>
                                                <div className="text-[9px] text-gray-400 truncate">{m.desc}</div>
                                            </div>
                                            <span className="text-[10px] text-purple-500 font-bold shrink-0">#{idx + 1}</span>
                                        </div>
                                    );
                                })}
                                {/* Disabled models */}
                                {ALL_MODELS.filter(m => !enabledModels.includes(m.id)).map(m => (
                                    <div key={m.id} className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-2 border border-gray-100 bg-gray-50 opacity-50">
                                        <input type="checkbox" checked={false} onChange={() => toggleModel(m.id)} className="accent-purple-600 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-gray-700 truncate text-[11px]">{m.name}</div>
                                            <div className="text-[9px] text-gray-400 truncate">{m.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2">Kéo thả để sắp thứ tự ưu tiên. Thử hết key ở model #1 → hết quota → chuyển #2 → ...</p>
                        </div>
                    </div>
                )}

                {/* Prompt editor */}
                {showPrompt && (
                    <div className="mb-3 p-4 bg-purple-50/50 border border-purple-200 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-purple-700">Prompt Template</span>
                            <button onClick={() => setPrompt(DEFAULT_PROMPT)} className="text-[10px] text-purple-500 hover:text-purple-700">Reset</button>
                        </div>
                        <textarea className="w-full border border-purple-200 rounded-lg px-3 py-2 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                            style={{ minHeight: "8rem", height: "auto", fieldSizing: "content" }}
                            value={prompt} onChange={e => setPrompt(e.target.value)} />
                    </div>
                )}

                {/* Filters + pagination */}
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Filter buttons — counts reflect category */}
                        {(() => {
                            const base = catFilter ? products.filter(p => p.category === catFilter) : products;
                            const missingCount = base.filter(p => !s(p.tags).trim()).length;
                            return (<>
                                <button onClick={() => setFilter("missing")} className={`h-7 px-2.5 text-[11px] font-medium rounded-full border transition ${filter === "missing" ? "bg-orange-50 text-orange-700 border-orange-200" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                    Thiếu Tag ({missingCount})
                                </button>
                                <button onClick={() => setFilter("all")} className={`h-7 px-2.5 text-[11px] font-medium rounded-full border transition ${filter === "all" ? "bg-blue-50 text-blue-700 border-blue-200" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                    Tất cả ({base.length})
                                </button>
                            </>);
                        })()}
                        {/* Category dropdown — styled */}
                        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                            className={`h-7 px-2 pr-6 text-[11px] font-medium rounded-full border appearance-none bg-no-repeat transition cursor-pointer focus:outline-none ${catFilter ? "bg-purple-50 text-purple-700 border-purple-200" : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"}`}
                            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 6px center" }}>
                            <option value="">📁 Tất cả danh mục</option>
                            {categories.map(c => {
                                const cnt = products.filter(p => p.category === c).length;
                                return <option key={c} value={c}>{catLabel(c)} ({cnt})</option>;
                            })}
                        </select>
                        <span className="text-xs text-gray-400">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, view.length)} / {view.length}</span>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-0.5">
                                <PgBtn onClick={() => setPage(1)} disabled={safePage === 1}>«</PgBtn>
                                <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹</PgBtn>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                                    const pg = start + i;
                                    if (pg > totalPages) return null;
                                    return <button key={pg} onClick={() => setPage(pg)}
                                        className={`px-2 py-0.5 text-xs rounded border transition ${pg === safePage ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 hover:bg-gray-50"}`}>{pg}</button>;
                                })}
                                <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</PgBtn>
                                <PgBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</PgBtn>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {batchRunning ? (
                            <>
                                <div className="flex items-center gap-2 text-xs text-purple-600">
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                    {batchProgress.done}/{batchProgress.total}
                                </div>
                                <button onClick={stopBatch} className="h-8 px-3 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">Dừng</button>
                            </>
                        ) : (
                            <button onClick={runBatch} disabled={!paged.some(p => firstImg(p) && !suggestions[p.id])}
                                className="h-8 px-4 text-xs font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-lg shadow-sm transition disabled:opacity-40">
                                ✨ Auto-tag trang này ({paged.filter(p => firstImg(p) && !suggestions[p.id]).length})
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200/80 shadow-sm">
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
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
                            const aiTags = suggestions[p.id] || "";
                            const isLoading = loading[p.id];
                            const error = errors[p.id];
                            const status = statusMsg[p.id];
                            return (
                                <tr key={p.id} className="group hover:bg-blue-50/20 transition-colors">
                                    <td className="py-2 px-3">
                                        {thumb ? (
                                            <img src={thumb} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" loading="lazy" onError={e => { e.target.style.display = "none"; }} />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg">🎂</div>
                                        )}
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
                                        ) : aiTags ? (
                                            <AITagEditor tags={aiTags} onApply={(tags) => applyTags(p, tags)}
                                                onDismiss={() => setSuggestions(s => { const n = { ...s }; delete n[p.id]; return n; })} />
                                        ) : (
                                            <span className="text-[10px] text-gray-300">—</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <button onClick={() => tagOne(p)} disabled={isLoading || !firstImg(p)}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition disabled:opacity-30"
                                            title="AI gợi ý tag">✨</button>
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
    );
}

function AITagEditor({ tags, onApply, onDismiss }) {
    const [editing, setEditing] = useState(tags);
    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap gap-0.5">
                {editing.split(",").map(t => t.trim()).filter(Boolean).map((t, i) => (
                    <span key={i} className="inline-block px-1.5 py-0.5 text-[9px] rounded bg-purple-50 text-purple-700 border border-purple-200">{t}</span>
                ))}
            </div>
            <input className="w-full border border-purple-200 rounded px-2 py-1 text-[10px] bg-purple-50/30 focus:outline-none focus:ring-1 focus:ring-purple-300"
                value={editing} onChange={e => setEditing(e.target.value)} />
            <div className="flex gap-1">
                <button onClick={() => onApply(editing)} className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500 text-white rounded hover:bg-emerald-600 transition">✅ Áp dụng</button>
                <button onClick={onDismiss} className="px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 rounded transition">❌ Bỏ</button>
            </div>
        </div>
    );
}

const PgBtn = ({ children, ...p }) => <button {...p} className="px-2 py-0.5 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition">{children}</button>;


