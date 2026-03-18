import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LS, audit, readLS } from "../../../utils.js";
import { KEYS, getConfig, getGeminiKeys } from "../../../utils/config.js";
import { fetchTabAsObjects } from "../../../services/sheets.js";
import { listDriveFileHashes, listDriveLeafFolders, uploadDriveFile } from "../shared/sheets.js";
import { isTokenExpired, requestGoogleDriveToken, uploadFileDirectToDrive, saveHashesToSheet, loadHashesFromSheet } from "../shared/driveDirect.js";

const AI_MODEL = "gemini-2.0-flash";
const OAUTH_CACHE_KEY = "admin.upload.oauth.v1";

const s = (v) => (v == null ? "" : String(v).trim());

const normalizeText = (v) =>
  s(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const slugify = (v) =>
  normalizeText(v)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const makeUid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const fmtBytes = (bytes = 0) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const META_CACHE_KEY = "admin.upload.meta.v1";
const HASH_ALGO_BY_LENGTH = { 64: "sha256", 40: "sha1", 32: "md5" };

function normalizeHashAlgo(hash = "", algo = "") {
  const normalized = s(algo).toLowerCase();
  if (normalized) return normalized;
  return HASH_ALGO_BY_LENGTH[String(hash || "").length] || "";
}

function hashKey(hash = "", algo = "") {
  const normalizedHash = s(hash).toLowerCase().replace(/[^a-f0-9]/g, "");
  const normalizedAlgo = normalizeHashAlgo(normalizedHash, algo);
  if (!normalizedHash || !normalizedAlgo) return "";
  return `${normalizedAlgo}:${normalizedHash}`;
}
const META_CACHE_VER = 4; // tăng số này khi cần xóa cache cũ

function readConfigSnapshot() {
  return {
    sheetId: s(getConfig(KEYS.SHEET_ID, "")),
    menuGid: s(getConfig(KEYS.SHEET_GID_MENU, "")),
    categoryGid: s(getConfig(KEYS.SHEET_GID_CATEGORIES, "")),
    productsGid: s(getConfig(KEYS.SHEET_GID_PRODUCTS, "")),
    tagGid: s(getConfig(KEYS.SHEET_GID_TAGS, "")),
    driveRootId: s(getConfig(KEYS.DRIVE_FOLDER_ID, "")),
    gsWebappUrl: s(getConfig(KEYS.GS_WEBAPP_URL, "")),
    googleOAuthClientId: s(getConfig(KEYS.GOOGLE_OAUTH_CLIENT_ID, "")),
  };
}

// Đọc keys từ ai_gemini_keys localStorage (do AITagsPanel quản lý)
function readAllGeminiKeys() {
  const multi = getGeminiKeys();
  if (Array.isArray(multi) && multi.length) return multi;
  const single = s(getConfig(KEYS.GEMINI_API_KEY, ""));
  return single ? [single] : [];
}

// Đọc models từ ai_models_order localStorage - chỉ lấy models stable (skip 3.x preview chưa tồn tại)
function readActiveModels() {
  // Models được biết là hỗ trợ vision + stable
  const STABLE_VISION_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash-8b",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
  ];
  try {
    const saved = JSON.parse(localStorage.getItem("ai_models_order") || "null");
    if (Array.isArray(saved) && saved.length) {
      // Lọc bỏ 3.x preview (chưa tồn tại), chỉ giữ stable
      const filtered = saved.filter(id => !id.startsWith("gemini-3") && !id.includes("-preview"));
      if (filtered.length) return filtered;
    }
  } catch {}
  return ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
}

function readMetaCache() {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if ((parsed.ver || 0) < META_CACHE_VER) return null; // version cũ -> bõ cache
    const hashStatus = parsed.hashStatus || {};
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      tagOptions: Array.isArray(parsed.tagOptions) ? parsed.tagOptions : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      driveHashes: Array.isArray(parsed.driveHashes) ? parsed.driveHashes : [],
      hashStatus: {
        status: s(hashStatus.status) || "idle",
        message: s(hashStatus.message),
        total: Number(hashStatus.total || 0),
        sha256Count: Number(hashStatus.sha256Count || 0),
        blockUpload: !!hashStatus.blockUpload,
      },
      cachedAt: Number(parsed.cachedAt || 0),
      cfgSnapshot: parsed.cfgSnapshot || {},
      folderSource: s(parsed.folderSource || "cache"),
    };
  } catch { return null; }
}

function writeMetaCache(payload) {
  try { localStorage.setItem(META_CACHE_KEY, JSON.stringify({ ...payload, ver: META_CACHE_VER, cachedAt: Date.now() })); } catch {}
}

const parseTextList = (value) => s(value).split(/[,|/\n]/g).map((x) => s(x)).filter(Boolean);

function parseCategoryRows(rows = []) {
  const out = [];
  for (const r of rows) {
    const keyRaw = s(r.slug || r.key || r.code || r.value || r.id || r.path);
    const labelRaw = s(r.name || r.title || r.label || r.ten || r.category);
    const folderRaw = s(r.folder_id || r.folder || r.folder_url || r.url);
    if (!keyRaw && !labelRaw) continue;
    if (!folderRaw) continue; // Chỉ quét các dòng khai báo folder_id theo yêu cầu
    const key = slugify(keyRaw || labelRaw);
    if (!key) continue;
    out.push({ key, label: labelRaw || keyRaw || key });
  }
  const seen = new Set();
  return out.filter((x) => !seen.has(x.key) && seen.add(x.key));
}

function parseCategoryFolderMapRows(rows = []) {
  const out = [];
  for (const r of rows) {
    const catRaw = s(r.category || r.category_key || r.slug || r.key || r.name);
    const categoryKey = slugify(catRaw);
    let folderId = s(r.folder_id || r.folder || r.folder_url || r.url);
    const m1 = folderId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m1) folderId = m1[1];
    const m2 = folderId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) folderId = m2[1];
    if (!categoryKey || !folderId) continue;
    out.push({
      id: folderId,
      name: s(r.folder_name || r.target_folder || catRaw || categoryKey),
      path: s(r.folder_path || r.path),
      mapCategoryKey: categoryKey,
      mapCategoryLabel: catRaw || categoryKey,
    });
  }
  const seen = new Set();
  return out.filter((x) => {
    const key = `${x.id}__${x.mapCategoryKey}`;
    return !seen.has(key) && seen.add(key);
  });
}

function findBestFolderForCategory(categoryKey = "", categories = [], folders = []) {
  if (!categoryKey || !folders.length) return null;
  const cat = categories.find((x) => x.key === categoryKey);
  const catN = normalizeText(categoryKey);
  const lblN = normalizeText(cat?.label || "");
  const direct = folders.find((f) => normalizeText(f.mapCategoryKey) === catN || (lblN && normalizeText(f.mapCategoryLabel) === lblN));
  if (direct) return direct;
  
  const needles = [catN, lblN].filter(Boolean);
  let best = null, bestScore = 0;
  for (const folder of folders) {
    const nameN = normalizeText(folder.name);
    let score = 0;
    for (const needle of needles) {
      if (nameN === needle) score = Math.max(score, 100);
      else if (nameN.startsWith(`${needle}_`)) score = Math.max(score, 90);
      else if (nameN.startsWith(needle)) score = Math.max(score, 85);
      else if (nameN.includes(needle)) score = Math.max(score, 70);
    }
    if (score > bestScore) { bestScore = score; best = folder; }
  }
  return bestScore > 0 ? best : null;
}

function extractJsonObject(text = "") {
  const raw = s(text);
  if (!raw) return null;
  const clean = raw.replace(/```json|```/gi, "").trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(clean.slice(first, last + 1)); } catch { return null; }
}

// Sửa JSON bị cắt (truncated) do maxOutputTokens
function repairJson(text = "") {
  const raw = s(text).replace(/```json|```/gi, "").trim();
  const first = raw.indexOf("{");
  if (first < 0) return null;
  let partial = raw.slice(first);
  // Điếm nhẫp: chứa category thì extract nó
  const catMatch = partial.match(/"category"\s*:\s*"([^"]+)"/);
  if (!catMatch) return null;
  // Tags có thể bị cắt → lấy được bao nhiêu
  const tags = [];
  const tagMatches = partial.matchAll(/"([^"]{1,40})"/g);
  for (const m of tagMatches) {
    const val = m[1];
    if (val !== catMatch[1] && val !== "category" && val !== "tags") tags.push(val);
  }
  return { category: catMatch[1], tags: tags.slice(0, 12) };
}

function mapTagsToKnownList(tags = [], tagOptions = []) {
  if (!tagOptions.length) return [...new Set(tags.filter(Boolean))];
  const optionMap = new Map(tagOptions.map((t) => [normalizeText(t), t]));
  const result = [];
  for (const tag of tags) {
    const n = normalizeText(tag);
    if (!n) continue;
    if (optionMap.has(n)) result.push(optionMap.get(n)); // match chính xác -&gt; dùng từ gốc trong list
    else {
      const fuzzy = tagOptions.find((opt) => normalizeText(opt).includes(n) || n.includes(normalizeText(opt)));
      result.push(fuzzy || tag); // giữ nguyên nếu không match
    }
  }
  const seen = new Set();
  return result.filter((tag) => {
    const k = normalizeText(tag);
    return k && !seen.has(k) && seen.add(k);
  });
}

function normalizeTagsInput(raw = "") {
  return [...new Set(parseTextList(raw).map((x) => x.replace(/^#+/, "").trim().toLowerCase()).filter(Boolean))].join(", ");
}

/* ====== AI Engine - giống AITagsPanel ====== */
// Gọi Gemini với 1 key + 1 model, nhận File object trực tiếp (resize trước)
async function rawGeminiFile(apiKey, modelId, file, promptText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  
  // Resize ảnh xuống 400px trước khi gửi (giống AITagsPanel)
  const srcUrl = URL.createObjectURL(file);
  let base64, mimeType;
  try {
    const img = await new Promise((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = srcUrl; });
    const maxSide = 400;
    const ratio = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    canvas.getContext("2d", { alpha: false }).drawImage(img, 0, 0, canvas.width, canvas.height);
    mimeType = "image/jpeg";
    base64 = canvas.toDataURL(mimeType, 0.82).split(",")[1];
  } finally { URL.revokeObjectURL(srcUrl); }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }, { inlineData: { mimeType, data: base64 } }] }],
      // Không dùng responseMimeType vì nhiều model không hỗ trợ (giống AITagsPanel)
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    const err = new Error(s(errData?.error?.message || `Lỗi ${resp.status}`));
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  return s(data?.candidates?.[0]?.content?.parts?.[0]?.text);
}

// Rotate qua tất cả keys và models, giống AITagsPanel.callWithRotation
async function callAiWithRotation(keys, modelIds, file, promptText, onStatus) {
  for (const modelId of modelIds) {
    for (let ki = 0; ki < keys.length; ki++) {
      if (onStatus) onStatus(`${modelId} · Key ${ki + 1}`);
      try {
        const text = await rawGeminiFile(keys[ki], modelId, file, promptText);
        return { text, modelId, keyIndex: ki };
      } catch (err) {
        // 429 hoặc quota -> thử key tiếp
        if (err.status === 429 || s(err.message).toLowerCase().includes("quota")) continue;
        // Lỗi khác -> thử key tiếp nhưng ghi nhớ
        continue;
      }
    }
  }
  throw new Error("Hết quota tất cả key & model. Vui lòng thêm key mới trong tab AI Tags.");
}

function buildUploadPrompt(categories, tagOptions, customCatPrompt, customTagsPrompt) {
  // Map key -> label để AI hiểu ý nghĩa từng category
  const catMapping = categories.map(c => `  "${c.key}": "${c.label}"`).join(",\n");
  const tagHint = tagOptions.length > 0 
    ? `Ưu tiên các tags sau (có thể thêm tags phù hợp khác): ${tagOptions.slice(0, 50).join(", ")}`
    : "tags ngắn gọn tiếng Việt về màu sắc, phong cách, chủ đề, nhân vật, hình dáng";

  const catInstruction = customCatPrompt 
    ? customCatPrompt 
    : `Chọn category dựa vào nội dung chữ cái bánh. Phải trả về đúng key (chuỗi bên trái dấu hai chấm), không được trả về label hay giá trị khác.`;
  
  const tagInstruction = customTagsPrompt
    ? customTagsPrompt
    : `Liệt kê 3-8 tags mô tả chiếc bánh (màu sắc, phong cách, nhân vật...). ${tagHint}`;

  return `Phân tích hình ảnh chiếc bánh. Trả về JSON thuần túy (không markdown, không giải thích):
{"category":"<key>","tags":["tag1","tag2","tag3"]}

DANH MU\u1ee4C HO\u1ee2P L\u1ec6 (dùng đúng key bên trái):
${catMapping}

QUY T\u1eaec CATEGORY: ${catInstruction}

QUY T\u1eaec TAGS: ${tagInstruction}

TUYỆT ĐỐI PHẢI có tags, mảng tags KHÔNG được rỗng, cần ít nhất 3 giá trị.

Chỉ trả về 1 dòng JSON. Không có gì khác.`;
}

// Gọi AI chỉ để lấy tags khi JSON chính không có tags
async function fetchTagsOnly(keys, modelIds, file, tagOptions) {
  const tagHint = tagOptions.length > 0 
    ? `ưu tiên từ: ${tagOptions.slice(0, 30).join(", ")}` 
    : "màu sắc, phong cách, nhân vật, hình dáng";
  const prompt = `Nhìn ảnh chiếc bánh. Liệt kê 4-6 từ mô tả bánh (${tagHint}).
Chỉ trả về các từ phân cách bằng dấu phẩy, tiếng Việt, ngắn gọn. Không giải thích.
Ví dụ: đỏ, mèo, cute, bé gái, kem bơ`;
  try {
    const { text } = await callAiWithRotation(keys, modelIds, file, prompt, null);
    return String(text).split(/[,;\n]/).map(t => t.trim().replace(/[."'()]/g,'').replace(/^[-*]+/,'')).filter(t => t.length > 0 && t.length < 30).slice(0, 8);
  } catch { return []; }
}

function applyCategoryAutoFolder(item, categoryKey, categories, folders) {
  const folder = findBestFolderForCategory(categoryKey, categories, folders);
  return {
    ...item, categoryKey,
    folderId: item.folderManual && item.folderId ? item.folderId : folder?.id || "",
    folderHint: folder ? `Đề xuất thư mục: ${folder.name}` : "Hãy chọn thư mục.",
  };
}

export default function UploadPanel({ canEdit = true }) {
  const [bootMeta] = useState(() => readMetaCache());
  const [cfg, setCfg] = useState(() => readConfigSnapshot());
  const [categories, setCategories] = useState(() => bootMeta?.categories || []);
  const [tagOptions, setTagOptions] = useState(() => bootMeta?.tagOptions || []);
  const [folders, setFolders] = useState(() => bootMeta?.folders || []);
  const [driveHashIndex, setDriveHashIndex] = useState(() => {
    const map = new Map();
    (bootMeta?.driveHashes || []).forEach(row => {
      const key = hashKey(row.hash, row.algo);
      if (key) (map.get(key) || map.set(key, []).get(key)).push(row);
    });
    return map;
  });
  const [hashStatus, setHashStatus] = useState(() => bootMeta?.hashStatus || { status: "idle", total: 0 });

  const [metaLoading, setMetaLoading] = useState(false);
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  const [bulkAiRunning, setBulkAiRunning] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  
  // Settings & OAuth state
  const [showSettings, setShowSettings] = useState(false);
  const [aiCategoryPrompt, setAiCategoryPrompt] = useState(() => localStorage.getItem("upload_ai_cat_prompt") || "");
  const [aiTagsPrompt, setAiTagsPrompt] = useState(() => localStorage.getItem("upload_ai_tags_prompt") || "");
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthToken, setOauthToken] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(OAUTH_CACHE_KEY) || '{}'); return isTokenExpired(c.expiresAt) ? '' : (c.accessToken || ''); } catch { return ''; }
  });
  const [oauthExpiresAt, setOauthExpiresAt] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(OAUTH_CACHE_KEY) || '{}'); return Number(c.expiresAt || 0); } catch { return 0; }
  });
  const oauthTaskRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach(it => URL.revokeObjectURL(it.previewUrl)), []);

  const hasDirectConfig = !!cfg.googleOAuthClientId;
  const directReady = hasDirectConfig && !!oauthToken && !isTokenExpired(oauthExpiresAt);

  const validationMap = useMemo(() => {
    const foldersSet = new Set(folders.map((f) => f.id));
    const byHash = new Map();
    items.forEach(it => {
      const key = hashKey(it.hash, it.hashAlgo);
      if (key) (byHash.get(key) || byHash.set(key, []).get(key)).push(it);
    });
    const out = {};
    items.forEach(item => {
      const issues = [];
      let localDup = [], driveDup = [];
      const itemKey = hashKey(item.hash, item.hashAlgo);
      if (itemKey) {
        localDup = (byHash.get(itemKey) || []).filter(x => x.id !== item.id);
        if (localDup.length) issues.push(`Trùng ảnh đang chọn (${localDup[0].name}).`);
        driveDup = driveHashIndex.get(itemKey) || [];
        if (driveDup.length) issues.push(`Trùng ảnh trên Drive (${driveDup[0].name}).`);
      }
      if (!item.categoryKey) issues.push("Chưa chọn danh mục.");
      if (!item.folderId || !foldersSet.has(item.folderId)) issues.push("Chưa có thư mục.");
      out[item.id] = { canUpload: canEdit && !item.done && !item.uploading && !issues.length, issues, isDuplicate: localDup.length > 0 || driveDup.length > 0 };
    });
    return out;
  }, [canEdit, items, folders, driveHashIndex]);

  const updateItem = useCallback((id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it)), []);

  const ensureDirectAccessToken = useCallback(async ({ interactive = false } = {}) => {
    if (oauthToken && !isTokenExpired(oauthExpiresAt)) return oauthToken;
    if (oauthTaskRef.current) return oauthTaskRef.current;
    oauthTaskRef.current = (async () => {
      const tokenResult = await requestGoogleDriveToken({ clientId: cfg.googleOAuthClientId, prompt: interactive ? 'consent' : '' });
      setOauthToken(tokenResult.accessToken);
      setOauthExpiresAt(tokenResult.expiresAt);
      try { localStorage.setItem(OAUTH_CACHE_KEY, JSON.stringify({ accessToken: tokenResult.accessToken, expiresAt: tokenResult.expiresAt })); } catch {}
      return tokenResult.accessToken;
    })();
    try { const t = await oauthTaskRef.current; oauthTaskRef.current = null; return t; }
    catch (e) { oauthTaskRef.current = null; throw e; }
  }, [cfg.googleOAuthClientId, oauthToken, oauthExpiresAt]);

  const connectDriveAuth = async () => {
    if (!canEdit) return;
    setOauthBusy(true);
    try {
      await ensureDirectAccessToken({ interactive: true });
    } catch (e) { alert("Lỗi kết nối Google Drive: " + e.message); }
    finally { setOauthBusy(false); }
  };

  const clearDriveAuth = () => {
    if (!canEdit) return;
    setOauthToken("");
    setOauthExpiresAt(0);
    oauthTaskRef.current = null;
    try { localStorage.removeItem(OAUTH_CACHE_KEY); } catch {}
  };

  const refreshDriveHashes = async () => {
    if (!canEdit) return;
    if (!directReady) return alert("Cần kết nối Google Drive Direct trước!");
    setHashStatus({ status: "loading", message: "Đang tải danh mục...", total: 0 });
    try {
      const token = await ensureDirectAccessToken();
      // Tải folder/danh mục trước (thất bại thì vẫn cho qua để tải hash)
      let metaErr = "";
      try {
        await refreshMeta();
      } catch (err) {
        metaErr = err.message;
      }

      // Tải hash từ Drive
      setHashStatus({ status: "loading", message: "Đang quét hash ảnh trên Drive...", total: 0 });
      const hashes = await listDriveFileHashes({ rootFolderId: cfg.driveRootId });
      
      const map = new Map();
      hashes.forEach(row => {
        const key = hashKey(row.hash, row.algo);
        if (key) (map.get(key) || map.set(key, []).get(key)).push(row);
      });
      setDriveHashIndex(map);
      
      // Lưu hash lên Google Sheet tab "drive_hashes" để đồng bộ thiết bị khác
      let sheetSaveMsg = "";
      try {
        setHashStatus({ status: "loading", message: `Đang lưu ${hashes.length} hash lên Sheet...`, total: hashes.length });
        await saveHashesToSheet({ accessToken: token, sheetId: cfg.sheetId, hashes });
        sheetSaveMsg = ` • Đã lưu lên Sheet`;
      } catch (saveErr) {
        console.warn("Lỗi lưu hash lên Sheet:", saveErr);
        sheetSaveMsg = ` • Lỗi lưu Sheet: ${saveErr.message}`;
      }

      const newStat = {
        status: "success",
        message: `Tải thành công${sheetSaveMsg}${metaErr ? ` • Danh mục: ${metaErr}` : ""}`,
        total: hashes.length,
        sha256Count: hashes.filter((row) => normalizeHashAlgo(row.hash, row.algo) === "sha256").length,
      };
      setHashStatus(newStat);
      
      // Lưu cache local — dùng state hiện tại (sau refreshMeta đã set)
      writeMetaCache({ 
        categories, 
        folders, 
        tagOptions, 
        hashStatus: newStat, 
        driveHashes: hashes 
      });
    } catch (e) {
      setHashStatus({ status: "error", message: e.message, total: 0 });
    }
  };

  const computeHash = useCallback(async (id, file) => {
    updateItem(id, { hashLoading: true });
    const buffer = await file.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))).map(b => b.toString(16).padStart(2, "0")).join("");
    updateItem(id, { hash, hashAlgo: "sha256", hashLoading: false });
  }, [updateItem]);

  const refreshMeta = useCallback(async () => {
    if (!canEdit) return;
    setMetaLoading(true);
    try {
      const nextCfg = readConfigSnapshot(); setCfg(nextCfg);
      // Thử categoryGid trước, fallback menuGid nếu tab categories không tồn tại
      const gidsToTry = [nextCfg.categoryGid, nextCfg.menuGid, "0"].filter(Boolean);
      let rows = [];
      for (const gid of gidsToTry) {
        try {
          rows = await fetchTabAsObjects({ sheetId: nextCfg.sheetId, gid });
          if (rows.length > 0) break;
        } catch (err) {
          console.warn(`Tab gid=${gid} lỗi:`, err?.message);
        }
      }
      const nCats = parseCategoryRows(rows);
      const mapped = parseCategoryFolderMapRows(rows);
      let nFol = mapped;
      if (!nFol.length && nextCfg.driveRootId) {
        nFol = await listDriveLeafFolders({ rootFolderId: nextCfg.driveRootId });
      }
      setCategories(nCats); setFolders(nFol);
      setItems(prev => prev.map(it => it.categoryKey && !it.folderManual ? applyCategoryAutoFolder(it, it.categoryKey, nCats, nFol) : it));
      writeMetaCache({ categories: nCats, folders: nFol, tagOptions, hashStatus });
    } catch (e) {
      console.warn("Lỗi tải Danh mục/Folder:", e);
      throw e;
    } finally { setMetaLoading(false); }
  }, [canEdit, tagOptions, hashStatus]);

  const addFiles = useCallback((fileList) => {
    if (!canEdit) return;
    const nextItems = Array.from(fileList || []).filter(f => /^image\//i.test(f.type)).map(file => ({
      id: makeUid(), file, name: file.name, size: file.size, type: file.type, previewUrl: URL.createObjectURL(file),
      selected: true, categoryKey: "", folderId: "", tagsText: "", aiLoading: false, hash: "", hashAlgo: "", hashLoading: true, done: false
    }));
    setItems(prev => [...prev, ...nextItems]);
    nextItems.forEach(it => computeHash(it.id, it.file));
  }, [canEdit, computeHash]);

  const runAiOne = async (id) => {
    if (!canEdit) return;
    const item = itemsRef.current.find(x => x.id === id);
    const keys = readAllGeminiKeys();
    const modelIds = readActiveModels();
    if (!item) return;
    if (!keys.length) { updateItem(id, { error: "Không có Gemini key. Vui lòng thêm trong tab AI Tags." }); return; }
    if (!categories.length) { updateItem(id, { error: "Chưa tải danh mục. Bấm 'Tải dữ liệu Sheet'." }); return; }
    
    updateItem(id, { aiLoading: true, error: "" });
    try {
      const prompt = buildUploadPrompt(categories, tagOptions, aiCategoryPrompt, aiTagsPrompt);
      const { text } = await callAiWithRotation(keys, modelIds, item.file, prompt,
        (label) => updateItem(id, { aiStatus: label })
      );
      
      // Parse JSON từ AI response - có thể bị truncate
      let parsed = extractJsonObject(text);
      if (!parsed) {
        // Thử repair JSON bị cắt: thêm [] và {} bị thiếu
        const repaired = repairJson(text);
        if (repaired) parsed = repaired;
      }
      if (!parsed) {
        // Last resort: try raw JSON.parse
        try { parsed = JSON.parse(s(text)); } catch {}
      }
      if (!parsed) throw new Error("AI trả sai JSON: " + s(text).slice(0, 80));

      // Match category
      const catRaw = normalizeText(s(parsed.category));
      const matched = categories.find(c => normalizeText(c.key) === catRaw || normalizeText(c.label) === catRaw);
      if (!matched) throw new Error(`AI trả category không hợp lệ: "${parsed.category}". Hợp lệ: ${categories.map(c=>c.key).join(", ")}`);
      
      // Map tags - giữ nguyên dấu tiếng Việt, không normalize
      const rawTags = Array.isArray(parsed.tags) 
        ? parsed.tags 
        : parseTextList(s(parsed.tags));
      
      // Fallback 1: extract từ raw text nếu tags rỗng
      let finalTags = rawTags.map(x => s(x).replace(/^#+/,"").trim()).filter(t => t.length > 0 && t.length < 40);
      if (!finalTags.length) {
        const commaMatch = s(text).match(/(?:tags?|tag|nhãn)[\s:"]*([a-zà-ỹA-ZÀ-ỹ][^\n\[\]{}"]{3,})/i);
        if (commaMatch) {
          finalTags = commaMatch[1].split(/[,;|]/).map(t => t.trim()).filter(t => t.length > 0 && t.length < 40);
        }
      }
      
      // Fallback 2: nếu vẫn rỗng -> gọi AI request riêng chỉ để lấy tags
      if (!finalTags.length) {
        updateItem(id, { aiStatus: "Lấy tags..." });
        finalTags = await fetchTagsOnly(keys, modelIds, item.file, tagOptions);
      }
      
      const cleanTags = mapTagsToKnownList(finalTags, tagOptions);

      setItems(prev => prev.map(x => x.id === id
        ? { ...applyCategoryAutoFolder({ ...x, aiLoading: false, aiStatus: "", tagsText: cleanTags.join(", ") }, matched.key, categories, folders), error: "" }
        : x
      ));
    } catch (e) { 
      updateItem(id, { aiLoading: false, aiStatus: "", error: s(e.message) }); 
    }
  };

  const uploadOne = async (id) => {
    if (!canEdit) return;
    const item = itemsRef.current.find(x => x.id === id);
    if (!item || !validationMap[id]?.canUpload) return;
    updateItem(id, { uploading: true, error: "" });
    try {
      let out;
      if (hasDirectConfig) {
        const token = await ensureDirectAccessToken();
        out = await uploadFileDirectToDrive({ accessToken: token, folderId: item.folderId, file: item.file, fileName: item.name, mimeType: item.type });
      } else {
        const dUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(item.file); });
        out = await uploadDriveFile({ folderId: item.folderId, rootFolderId: cfg.driveRootId, fileName: item.name, mimeType: item.type, base64: dUrl.split(",")[1], category: item.categoryKey, tags: normalizeTagsInput(item.tagsText) });
      }
      updateItem(id, { uploading: false, done: true, uploadUrl: out.url });
      
      audit("upload.image", {
        name: item.name,
        category: item.categoryKey,
        folderId: item.folderId,
        user: (readLS(LS.AUTH, {}) || {}).username || "?",
      });
    } catch (e) { updateItem(id, { uploading: false, error: e.message }); }
  };

  const uploadSelected = async () => {
    if (!canEdit) return;
    setBulkUploading(true);
    try {
      const targets = itemsRef.current.filter(x => x.selected && validationMap[x.id]?.canUpload);
      for (const item of targets) await uploadOne(item.id);
    } finally {
      setBulkUploading(false);
    }
  };
  
  const runAiSelected = async () => {
    if (!canEdit || bulkAiRunning) return;
    const targets = itemsRef.current.filter(x => x.selected && !x.done);
    if (!targets.length) return;
    setBulkAiRunning(true);
    try {
      for (const item of targets) await runAiOne(item.id);
    } finally {
      setBulkAiRunning(false);
    }
  };
  
  const totalSelected = items.filter(x => x.selected).length;
  const duplicateCount = items.filter(x => validationMap[x.id]?.isDuplicate).length;

  return (
    <div className="space-y-4">
      {/* Header Area */}
      <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Upload Ảnh</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 font-medium">
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${cfg.sheetId ? "bg-emerald-400" : "bg-red-400"}`}></span>
                <span className="hidden sm:inline">{cfg.sheetId ? "Đã kết nối Sheet" : "Chưa kết nối Sheet"}</span>
                <span className="sm:hidden">{cfg.sheetId ? "Sheet ✓" : "Sheet ✗"}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${directReady ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                <span className="hidden sm:inline">{directReady ? "Direct Upload (Nhanh)" : "Proxy Upload (Chậm)"}</span>
                <span className="sm:hidden">{directReady ? "Drive ✓" : "Proxy"}</span>
              </span>
            </div>
          </div>
          {/* Right-side primary actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasDirectConfig && !directReady && (
              <button onClick={connectDriveAuth} disabled={oauthBusy || !canEdit}
                className="h-9 px-2.5 sm:px-3.5 rounded-xl border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 font-semibold transition shadow-sm text-xs sm:text-sm flex items-center gap-1.5">
                {oauthBusy ? "Đang kết nối..." : <><span>🔌</span><span className="hidden sm:inline">Kết nối Drive</span></>}
              </button>
            )}
            {hasDirectConfig && directReady && (
              <button onClick={clearDriveAuth} disabled={!canEdit}
                className="h-9 px-2.5 sm:px-3.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-red-500 transition shadow-sm text-xs sm:text-sm flex items-center gap-1.5">
                <span className="hidden sm:inline">Ngắt kết nối</span><span className="sm:hidden">⏻</span>
              </button>
            )}
            <button onClick={() => setShowSettings(!showSettings)}
              className="h-9 px-2.5 sm:px-3.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition shadow-sm text-xs sm:text-sm flex items-center gap-1.5" title="Cài đặt hệ thống">
              ⚙️<span className="hidden lg:inline"> Cấu hình / Thông số</span>
            </button>
            <button onClick={refreshMeta} disabled={!canEdit || metaLoading}
              className="h-9 px-2.5 sm:px-3.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition shadow-sm text-xs sm:text-sm flex items-center gap-1.5 disabled:opacity-50" title="Tải lại danh mục">
              <span className={metaLoading ? "animate-spin" : ""}>&#8635;</span><span className="hidden lg:inline"> Tải Sheet</span>
            </button>
          </div>
        </div>
        {!canEdit && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tài khoản này chỉ có quyền xem. Mọi thao tác thêm ảnh, AI, upload và cập nhật cấu hình đã bị khóa.
          </div>
        )}
        {/* Secondary action row: Chọn ảnh + AI + Upload */}
        <div className="flex gap-2">
          {/* File input (hidden) - reused by both button and dropzone */}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          {/* Chọn ảnh button - chỉ hiện trên mobile */}
          <button onClick={() => canEdit && fileInputRef.current?.click()} disabled={!canEdit}
            className="sm:hidden flex-1 h-9 px-3 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-semibold transition text-xs flex items-center justify-center gap-1.5">
            📷 Chọn ảnh
          </button>
          <button onClick={runAiSelected}
            disabled={!canEdit || bulkAiRunning || items.length === 0}
            className="flex-1 sm:flex-none h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 font-semibold transition text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40">
            ✨ <span className="hidden sm:inline">AI Gợi ý Tất cả</span><span className="sm:hidden">AI full</span>
          </button>
          <button onClick={uploadSelected} disabled={!canEdit || bulkUploading || items.length === 0}
            className="flex-1 sm:flex-none h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-md shadow-emerald-500/20 text-xs sm:text-sm transition disabled:opacity-40">
            {bulkUploading ? "Đang đẩy..." : <><span className="hidden sm:inline">Upload Hợp Lệ</span><span className="sm:hidden">Upload</span></>}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-md p-4 animate-fade-in my-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {hasDirectConfig ? (
              <>
                <button onClick={connectDriveAuth} disabled={oauthBusy || !canEdit} className={`h-9 px-4 text-xs font-semibold rounded-xl border disabled:opacity-60 transition shadow-sm ${directReady ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"}`}>
                  {oauthBusy ? "Đang kết nối..." : directReady ? "✔️ Đã kết nối Google Drive" : "Kết nối Google Drive"}
                </button>
                {directReady && (
                  <button onClick={clearDriveAuth} disabled={!canEdit} className="h-9 px-4 text-xs font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 shadow-sm transition disabled:opacity-50">Xóa kết nối</button>
                )}
              </>
            ) : (
              <div className="h-9 px-3 text-xs rounded-xl border border-gray-200 bg-gray-50 text-gray-500 inline-flex items-center">
                Thiếu Google OAuth Client ID
              </div>
            )}
            <button onClick={() => refreshDriveHashes()} disabled={!canEdit || hashStatus.status === "loading" || !directReady} className="h-9 px-4 text-xs font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 shadow-sm transition">
              {hashStatus.status === "loading" ? "Đang xử lý..." : "Nạp Danh mục & Hash Drive"}
            </button>
          </div>
          
          {/* Thống kê nhanh */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="rounded-xl bg-gray-50/50 hover:bg-gray-50 border border-gray-100 px-3 py-2 transition"><div className="text-gray-500 font-medium mb-0.5">Sheet ID</div><div className="font-mono text-gray-800 truncate">{cfg.sheetId || "(chưa cấu hình)"}</div></div>
            <div className="rounded-xl bg-gray-50/50 hover:bg-gray-50 border border-gray-100 px-3 py-2 transition"><div className="text-gray-500 font-medium mb-0.5">Thư mục gốc Drive</div><div className="font-mono text-gray-800 truncate">{cfg.driveRootId || "(chưa cấu hình)"}</div></div>
            <div className="rounded-xl bg-gray-50/50 hover:bg-gray-50 border border-gray-100 px-3 py-2 transition"><div className="text-gray-500 font-medium mb-0.5">Danh mục</div><div className="text-gray-800 font-semibold">{categories.length} mục</div></div>
            <div className="rounded-xl bg-gray-50/50 hover:bg-gray-50 border border-gray-100 px-3 py-2 transition"><div className="text-gray-500 font-medium mb-0.5">Thư mục cấp cuối</div><div className="text-gray-800 font-semibold">{folders.length} thư mục</div></div>
            <div className="rounded-xl bg-gray-50/50 hover:bg-gray-50 border border-gray-100 px-3 py-2 transition"><div className="text-gray-500 font-medium mb-0.5">Tag mẫu</div><div className="text-gray-800 font-semibold">{tagOptions?.length || 0} tag</div></div>
            <div className={`rounded-xl border px-3 py-2 transition ${hashStatus.total > 0 ? "bg-emerald-50/50 border-emerald-100" : "bg-gray-50/50 border-gray-100"}`}>
              <div className="text-gray-500 font-medium mb-0.5">Ảnh đã hash</div>
              <div className={`font-semibold ${hashStatus.total > 0 ? "text-emerald-700" : "text-gray-800"}`}>
                {hashStatus.status === "loading" ? "Đang tải..." : `${hashStatus.total || 0} ảnh`}
                {hashStatus.sha256Count > 0 && <span className="text-[10px] text-gray-400 ml-1">(SHA-256)</span>}
              </div>
            </div>
          </div>

          {/* Hash status message */}
          {hashStatus.message && hashStatus.status === "success" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs px-3 py-2 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
              {hashStatus.message} — {hashStatus.total} ảnh đã được hash trên Drive
            </div>
          )}

          {/* Custom AI Prompts */}
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-indigo-500">
                <path d="M7.557 2.066A.75.75 0 0 1 8 2.75v10.5a.75.75 0 0 1-1.28.53l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 .837-.164ZM13.28 6.22a.75.75 0 0 1 0 1.06l-3.5 3.5A.75.75 0 0 1 8.5 10.25V5.75a.75.75 0 0 1 1.28-.53l3.5 3.5Z"/>
              </svg>
              Tuỳ chỉnh Prompt AI (nâng cao)
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Prompt chọn Danh mục <span className="text-gray-400">(để trống = dùng mặc định)</span></label>
                <textarea
                  value={aiCategoryPrompt}
                  onChange={e => { setAiCategoryPrompt(e.target.value); localStorage.setItem("upload_ai_cat_prompt", e.target.value); }}
                  disabled={!canEdit}
                  placeholder="VD: Chú ý các hình vẽ nhân vật hoạt hình phải chọn danh mục ve-nhan-vat..."
                  rows={Math.max(2, (aiCategoryPrompt || '').split('\n').length)}
                  style={{overflow:'hidden'}}
                  className="w-full text-[11px] px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-400 outline-none resize-none text-gray-700 placeholder-gray-300 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Prompt gán Tags <span className="text-gray-400">(để trống = dùng mặc định)</span></label>
                <textarea
                  value={aiTagsPrompt}
                  onChange={e => { setAiTagsPrompt(e.target.value); localStorage.setItem("upload_ai_tags_prompt", e.target.value); }}
                  disabled={!canEdit}
                  placeholder="VD: Tập trung vào màu sắc và nhân vật chính. Tags nên ngắn gọn 1-3 từ..."
                  rows={Math.max(2, (aiTagsPrompt || '').split('\n').length)}
                  style={{overflow:'hidden'}}
                  className="w-full text-[11px] px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-400 outline-none resize-none text-gray-700 placeholder-gray-300 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {hashStatus.message && hashStatus.status === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2">{hashStatus.message}</div>
          )}
        </div>
      )}

      {/* Dropzone - ẩn trên mobile (sm), hiện trên desktop */}
      <div className={`hidden sm:block relative group rounded-3xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 transition-all duration-300 p-8 text-center shadow-sm ${canEdit ? "cursor-pointer hover:bg-indigo-50 hover:border-indigo-400" : "cursor-not-allowed opacity-70"}`}
           onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); e.currentTarget.classList.add('bg-indigo-100', 'border-indigo-500'); }}
           onDragLeave={(e) => { if (!canEdit) return; e.currentTarget.classList.remove('bg-indigo-100', 'border-indigo-500'); }}
           onDrop={(e) => { if (!canEdit) return; e.preventDefault(); e.currentTarget.classList.remove('bg-indigo-100', 'border-indigo-500'); addFiles(e.dataTransfer.files); }}
           onClick={() => { if (!canEdit) return; fileInputRef.current?.click(); }}>
        <div className="w-16 h-16 mx-auto bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800">Kéo thả ảnh hoặc Bấm để chọn</h3>
        <p className="text-sm text-gray-500 mt-2">Hệ thống sẽ tự nhận diện danh mục và gán Tag thư mục cho bạn.</p>
      </div>

      {/* Image Grid - vertical card layout */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-sm font-semibold text-gray-700 shrink-0">{items.length} ảnh</span>
            <div className="flex items-center gap-0.5 ml-auto">
              <button onClick={() => setItems(items.map(x => ({ ...x, selected: true })))} disabled={!canEdit} className="text-xs text-gray-500 px-1.5 py-1 rounded hover:bg-gray-100 transition whitespace-nowrap disabled:opacity-40">Chọn tất</button>
              <span className="text-gray-200">|</span>
              <button onClick={() => setItems(items.map(x => ({ ...x, selected: false })))} disabled={!canEdit} className="text-xs text-gray-500 px-1.5 py-1 rounded hover:bg-gray-100 transition whitespace-nowrap disabled:opacity-40">Bỏ chọn</button>
              <span className="text-gray-200">|</span>
              <button onClick={() => setItems(items.filter(x => !x.done))} disabled={!canEdit} className="text-xs text-gray-500 px-1.5 py-1 rounded hover:bg-gray-100 transition whitespace-nowrap disabled:opacity-40">Dọn</button>
              <span className="text-gray-200">|</span>
              <button onClick={() => setItems([])} disabled={!canEdit} className="text-xs text-red-400 px-1.5 py-1 rounded hover:bg-red-50 transition whitespace-nowrap disabled:opacity-40">Xóa hết</button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {items.map(item => {
              const check = validationMap[item.id] || { issues: [] };
              const isError = !!item.error;
              return (
                <div key={item.id} className={`group flex flex-col rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all bg-white ${item.done ? 'border-emerald-200' : isError ? 'border-red-200' : 'border-gray-100'}`}>
                  
                  {/* Image Area */}
                  <div className="relative aspect-square w-full bg-gray-100 overflow-hidden">
                    <img src={item.previewUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    
                    {/* Gradient overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Checkbox top-left */}
                    <input type="checkbox" checked={item.selected} onChange={() => updateItem(item.id, { selected: !item.selected })} disabled={!canEdit}
                      className="absolute top-2 left-2 w-4 h-4 cursor-pointer accent-indigo-500 z-10" />
                    
                    {/* Delete btn top-right */}
                    <button onClick={() => canEdit && setItems(prev => prev.filter(x => x.id !== item.id))} disabled={!canEdit}
                      className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-black/30 hover:bg-red-500 text-white transition opacity-0 group-hover:opacity-100">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/>
                      </svg>
                    </button>

                    {/* Done overlay */}
                    {item.done && (
                      <a href={item.uploadUrl} target="_blank" rel="noopener"
                        className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/75 hover:bg-emerald-600/80 transition z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd"/></svg>
                        <span className="text-white text-[11px] mt-1 font-semibold">Đã upload</span>
                      </a>
                    )}

                    {/* AI loading badge */}
                    {item.aiLoading && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                        <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse whitespace-nowrap shadow">AI đang phân tích...</span>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                    
                    {/* Filename row: truncated name + AI + Upload buttons */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-gray-800 truncate">{item.name}</div>
                        <div className="text-[10px] text-gray-400">{fmtBytes(item.size)}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {/* AI button */}
                        <button onClick={() => runAiOne(item.id)} disabled={!canEdit || item.aiLoading}
                          className="w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-500 disabled:opacity-40 transition"
                          title="AI gợi ý category + tag">
                          {item.aiLoading
                            ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.239a1 1 0 0 0 0 1.962l1.192.24a1 1 0 0 1 .784.784l.24 1.192a1 1 0 0 0 1.962 0l.24-1.192a1 1 0 0 1 .784-.784l1.192-.24a1 1 0 0 0 0-1.962l-1.192-.24a1 1 0 0 1-.784-.784l-.24-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.633.633l-.551.184a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.634l.184.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .633-.634l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.633l-.184-.551Z"/></svg>
                          }
                        </button>
                        {/* Upload button */}
                        <button onClick={() => uploadOne(item.id)} disabled={!check.canUpload}
                          className="w-6 h-6 flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 disabled:opacity-30 transition"
                          title="Upload ảnh này lên Drive">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z" clipRule="evenodd"/></svg>
                        </button>
                      </div>
                    </div>

                    {/* Category + Folder */}
                    <select value={item.categoryKey} onChange={e => {
                      const it = applyCategoryAutoFolder(item, e.target.value, categories, folders);
                      updateItem(item.id, { categoryKey: it.categoryKey, folderId: it.folderId, folderHint: it.folderHint });
                    }} disabled={!canEdit} className="w-full h-7 px-2 text-[11px] bg-gray-50 border border-gray-200 rounded-lg focus:border-indigo-400 outline-none cursor-pointer text-gray-700 disabled:opacity-60">
                      <option value="">📁 Chọn danh mục...</option>
                      {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>

                    <select value={item.folderId} onChange={e => updateItem(item.id, { folderId: e.target.value, folderManual: true })} disabled={!canEdit}
                      className="w-full h-7 px-2 text-[11px] bg-gray-50 border border-gray-200 rounded-lg focus:border-indigo-400 outline-none cursor-pointer text-gray-700 disabled:opacity-60">
                      <option value="">📂 Thư mục...</option>
                      {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>

                    <input value={item.tagsText} onChange={e => updateItem(item.id, { tagsText: e.target.value })} disabled={!canEdit}
                      placeholder="🏷 Tags..."
                      className="w-full h-7 px-2 text-[11px] bg-gray-50 border border-gray-200 rounded-lg focus:border-indigo-400 outline-none text-gray-700 disabled:opacity-60" />

                    {/* Errors */}
                    {(check.issues[0] || item.error) && (
                      <div className="text-[10px] leading-snug">
                        {check.issues[0] && <div className="text-rose-500">⚠ {check.issues[0]}</div>}
                        {item.error && <div className="text-red-500 truncate" title={item.error}>❌ {item.error}</div>}
                      </div>
                    )}
                  </div>
                </div>

              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
