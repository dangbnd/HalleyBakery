import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audit, readLS } from "../../../utils.js";
import { KEYS, getConfig } from "../../../utils/config.js";
import { fetchTabAsObjects } from "../../../services/sheets.js";
import { listDriveFolders, uploadDriveFile } from "../shared/sheets.js";

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
    : `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const fmtBytes = (bytes = 0) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

function readConfigSnapshot() {
  return {
    sheetId: s(getConfig(KEYS.SHEET_ID, "")),
    menuGid: s(getConfig(KEYS.SHEET_GID_MENU, "")),
    categoryGid: s(getConfig(KEYS.SHEET_GID_CATEGORIES, "")),
    driveRootId: s(getConfig(KEYS.DRIVE_FOLDER_ID, "")),
    gsWebappUrl: s(getConfig(KEYS.GS_WEBAPP_URL, "")),
    geminiKey: s(getConfig(KEYS.GEMINI_API_KEY, "")),
  };
}

function parseCategoryRows(rows = []) {
  const out = [];
  for (const r of rows) {
    const keyRaw = s(r.slug || r.key || r.code || r.value || r.id);
    const labelRaw = s(r.name || r.title || r.label || r.ten || r.category);
    if (!keyRaw && !labelRaw) continue;
    const key = slugify(keyRaw || labelRaw);
    if (!key) continue;
    const label = labelRaw || keyRaw || key;
    out.push({ key, label });
  }

  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.key)) return false;
    seen.add(x.key);
    return true;
  });
}

function matchCategoryFromText(raw = "", categories = []) {
  const n = normalizeText(raw);
  if (!n) return null;

  for (const c of categories) {
    if (n === normalizeText(c.key) || n === normalizeText(c.label)) return c;
  }
  for (const c of categories) {
    const ck = normalizeText(c.key);
    const cl = normalizeText(c.label);
    if (n.includes(ck) || n.includes(cl) || ck.includes(n) || cl.includes(n)) return c;
  }
  return null;
}

function matchFolderForCategory(categoryKey = "", categories = [], folders = []) {
  if (!categoryKey || !folders.length) return null;
  const cat = categories.find((x) => x.key === categoryKey);
  const tokens = [categoryKey, cat?.label].map(normalizeText).filter(Boolean);
  if (!tokens.length) return null;

  let hit = folders.find((f) => tokens.some((t) => normalizeText(f.name) === t));
  if (hit) return hit;

  hit = folders.find((f) => {
    const fn = normalizeText(f.name);
    return tokens.some((t) => fn.startsWith(t) || t.startsWith(fn));
  });
  if (hit) return hit;

  hit = folders.find((f) => {
    const fn = normalizeText(f.name);
    return tokens.some((t) => fn.includes(t) || t.includes(fn));
  });
  return hit || null;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Khong doc duoc file"));
    fr.readAsDataURL(file);
  });
}

async function fileToInlineData(file, maxSide = 1280, quality = 0.84) {
  const type = s(file?.type) || "image/jpeg";
  if (!/^image\//i.test(type)) throw new Error("File khong phai anh");

  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Khong tai duoc anh"));
      el.src = srcUrl;
    });

    const w = Number(img.width || 0);
    const h = Number(img.height || 0);
    if (!w || !h) throw new Error("Anh khong hop le");

    const ratio = Math.min(1, maxSide / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * ratio));
    const th = Math.max(1, Math.round(h * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Khong khoi tao duoc canvas");
    ctx.drawImage(img, 0, 0, tw, th);

    const mimeType = /^image\/(png|webp)$/i.test(type) ? type : "image/jpeg";
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const base64 = String(dataUrl).split(",")[1] || "";
    if (!base64) throw new Error("Khong nen duoc anh");

    return { mimeType, data: base64 };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

async function suggestCategoryWithGemini({ apiKey, file, categories }) {
  if (!apiKey) throw new Error("Chua co Gemini API key");
  if (!categories.length) throw new Error("Chua co danh muc de goi y");

  const inline = await fileToInlineData(file);
  const model = "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const optionsText = categories.map((c) => `- ${c.key}: ${c.label}`).join("\n");
  const prompt =
    "Phan loai category cho anh banh. " +
    "Chi tra ve DUY NHAT 1 category key dung trong danh sach ben duoi, khong giai thich them.\n" +
    "Danh sach category:\n" + optionsText;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: inline }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 24 },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = s(body?.error?.message || body?.error || `Gemini error ${res.status}`);
    throw new Error(msg || "Gemini request fail");
  }

  const text = s(body?.candidates?.[0]?.content?.parts?.[0]?.text)
    .replace(/[\n\r`"']/g, " ")
    .trim();

  const matched = matchCategoryFromText(text, categories);
  if (!matched) throw new Error(`AI khong map duoc category: ${text || "empty"}`);

  return { categoryKey: matched.key, raw: text };
}

function uploadStateBadge(item) {
  if (item.uploading) return { cls: "bg-amber-50 text-amber-700 border-amber-200", text: "Dang upload" };
  if (item.done) return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Da upload" };
  if (item.error) return { cls: "bg-red-50 text-red-700 border-red-200", text: "Loi" };
  return { cls: "bg-gray-50 text-gray-600 border-gray-200", text: "San sang" };
}

export default function UploadPanel() {
  const [cfg, setCfg] = useState(() => readConfigSnapshot());
  const [categories, setCategories] = useState([]);
  const [folders, setFolders] = useState([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState("");

  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkAiRunning, setBulkAiRunning] = useState(false);

  const validReadyCount = useMemo(
    () => items.filter((x) => !x.done && !x.uploading && x.categoryKey && x.folderId).length,
    [items]
  );

  const refreshMeta = useCallback(async () => {
    const nextCfg = readConfigSnapshot();
    setCfg(nextCfg);
    setMetaLoading(true);
    setMetaError("");

    try {
      if (!nextCfg.sheetId) throw new Error("Thieu Sheet ID trong Cau hinh");
      if (!nextCfg.driveRootId) throw new Error("Thieu Google Drive Folder ID trong Cau hinh");
      if (!nextCfg.gsWebappUrl) throw new Error("Thieu GS WebApp URL trong Cau hinh");

      const catsRows = [];
      if (nextCfg.menuGid) {
        const menu = await fetchTabAsObjects({ sheetId: nextCfg.sheetId, gid: nextCfg.menuGid });
        catsRows.push(...menu);
      }
      if (nextCfg.categoryGid && nextCfg.categoryGid !== nextCfg.menuGid) {
        const cat = await fetchTabAsObjects({ sheetId: nextCfg.sheetId, gid: nextCfg.categoryGid });
        catsRows.push(...cat);
      }

      let nextCategories = parseCategoryRows(catsRows);
      if (!nextCategories.length) {
        const fromProducts = (readLS("products", []) || [])
          .map((p) => s(p.category))
          .filter(Boolean)
          .map((key) => ({ key: slugify(key), label: key }));
        nextCategories = parseCategoryRows(fromProducts);
      }

      const nextFolders = await listDriveFolders({ rootFolderId: nextCfg.driveRootId });
      if (!nextFolders.length) throw new Error("Khong lay duoc danh sach folder tu Drive");

      setCategories(nextCategories);
      setFolders(nextFolders);
    } catch (e) {
      setMetaError(s(e?.message || "Khong tai duoc categories/folders"));
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const it of itemsRef.current || []) {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      }
    };
  }, []);

  const applyCategoryAutoFolder = useCallback(
    (item, categoryKey) => {
      const best = matchFolderForCategory(categoryKey, categories, folders);
      return {
        ...item,
        categoryKey,
        folderId: best ? best.id : item.folderManual ? item.folderId : "",
        folderManual: item.folderManual && !!item.folderId,
        folderHint: best
          ? `Tu dong map -> ${best.name}${best.path ? ` (${best.path})` : ""}`
          : "Chua tim thay folder phu hop. Vui long chon tay.",
      };
    },
    [categories, folders]
  );
  useEffect(() => {
    if (!categories.length || !folders.length) return;
    setItems((prev) =>
      prev.map((it) => {
        if (!it.categoryKey || it.folderManual) return it;
        const next = applyCategoryAutoFolder(it, it.categoryKey);
        if (next.folderId === it.folderId && next.folderHint === it.folderHint) return it;
        return next;
      })
    );
  }, [categories, folders, applyCategoryAutoFolder]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => /^image\//i.test(s(f.type) || "image/"));
    if (!incoming.length) return;

    const nextItems = incoming.map((file) => ({
      id: makeUid(),
      file,
      name: file.name,
      size: file.size,
      type: file.type || "image/jpeg",
      previewUrl: URL.createObjectURL(file),
      categoryKey: "",
      aiText: "",
      aiLoading: false,
      folderId: "",
      folderManual: false,
      folderHint: "Chua chon category.",
      uploading: false,
      done: false,
      error: "",
      uploadUrl: "",
    }));

    setItems((prev) => [...prev, ...nextItems]);
  }, []);

  const onInputFiles = (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer?.files);
  };

  const removeItem = (id) => {
    setItems((prev) => {
      const hit = prev.find((x) => x.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const clearDone = () => {
    setItems((prev) => {
      const keep = [];
      for (const it of prev) {
        if (it.done) {
          if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        } else {
          keep.push(it);
        }
      }
      return keep;
    });
  };

  const setCategory = (id, categoryKey) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = applyCategoryAutoFolder({ ...it, error: "" }, categoryKey);
        return next;
      })
    );
  };

  const setFolder = (id, folderId) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const folder = folders.find((f) => f.id === folderId);
        return {
          ...it,
          folderId,
          folderManual: true,
          folderHint: folder ? `Chon tay -> ${folder.name}${folder.path ? ` (${folder.path})` : ""}` : "Chua chon folder.",
          error: "",
        };
      })
    );
  };

  const runAiOne = useCallback(
    async (id) => {
      const item = items.find((x) => x.id === id);
      if (!item) return;

      if (!cfg.geminiKey) {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, error: "Chua co Gemini API Key trong Cau hinh" } : x)));
        return;
      }
      if (!categories.length) {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, error: "Chua tai duoc danh muc" } : x)));
        return;
      }

      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, aiLoading: true, error: "" } : x)));
      try {
        const ai = await suggestCategoryWithGemini({
          apiKey: cfg.geminiKey,
          file: item.file,
          categories,
        });
        setItems((prev) =>
          prev.map((x) => {
            if (x.id !== id) return x;
            const merged = applyCategoryAutoFolder({ ...x, aiLoading: false, aiText: ai.raw, error: "" }, ai.categoryKey);
            return merged;
          })
        );
      } catch (e) {
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, aiLoading: false, error: s(e?.message || "AI goi y that bai") } : x))
        );
      }
    },
    [items, cfg.geminiKey, categories, applyCategoryAutoFolder]
  );

  const runAiAll = async () => {
    if (bulkAiRunning) return;
    const targets = items.filter((x) => !x.done && !x.aiLoading && !x.categoryKey);
    if (!targets.length) return;

    setBulkAiRunning(true);
    try {
      for (const item of targets) {
        await runAiOne(item.id);
      }
    } finally {
      setBulkAiRunning(false);
    }
  };

  const uploadOne = useCallback(
    async (id) => {
      const item = items.find((x) => x.id === id);
      if (!item) return;

      if (!cfg.driveRootId) {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, error: "Thieu Drive Folder ID goc" } : x)));
        return;
      }
      if (!item.folderId) {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, error: "Chua chon folder upload" } : x)));
        return;
      }
      if (!folders.some((f) => f.id === item.folderId)) {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, error: "Folder da chon khong nam trong danh sach co san" } : x)));
        return;
      }

      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, uploading: true, error: "" } : x)));
      try {
        const dataUrl = await fileToDataUrl(item.file);
        const base64 = s(dataUrl.split(",")[1]);
        const out = await uploadDriveFile({
          folderId: item.folderId,
          rootFolderId: cfg.driveRootId,
          fileName: item.name,
          mimeType: item.type || "image/jpeg",
          base64,
          category: item.categoryKey,
        });

        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? { ...x, uploading: false, done: true, uploadUrl: out.url || "", error: "" }
              : x
          )
        );

        audit("upload.image", {
          name: item.name,
          category: item.categoryKey,
          folderId: item.folderId,
          user: (readLS("auth", {}) || {}).username || "?",
        });
      } catch (e) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? { ...x, uploading: false, done: false, error: s(e?.message || "Upload that bai") }
              : x
          )
        );
      }
    },
    [items, cfg.driveRootId, folders]
  );

  const uploadAll = async () => {
    if (bulkUploading) return;
    const targets = items.filter((x) => !x.done && !x.uploading && x.categoryKey && x.folderId);
    if (!targets.length) return;

    setBulkUploading(true);
    try {
      for (const item of targets) {
        await uploadOne(item.id);
      }
    } finally {
      setBulkUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Upload</h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload anh len Google Drive theo folder co san. He thong KHONG tao folder moi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshMeta}
              disabled={metaLoading}
              className="h-9 px-4 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            >
              {metaLoading ? "Dang tai..." : "Tai lai category + folder"}
            </button>
            <button
              onClick={runAiAll}
              disabled={bulkAiRunning || !items.length}
              className="h-9 px-4 text-sm rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
            >
              {bulkAiRunning ? "AI dang xu ly..." : "AI goi y tat ca"}
            </button>
            <button
              onClick={uploadAll}
              disabled={bulkUploading || !validReadyCount}
              className="h-9 px-4 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {bulkUploading ? "Dang upload..." : `Upload tat ca (${validReadyCount})`}
            </button>
          </div>
        </div>

        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-gray-500">Sheet ID</div>
            <div className="font-mono text-gray-800 truncate">{cfg.sheetId || "(chua cau hinh)"}</div>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-gray-500">Drive root folder</div>
            <div className="font-mono text-gray-800 truncate">{cfg.driveRootId || "(chua cau hinh)"}</div>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-gray-500">Danh muc</div>
            <div className="text-gray-800">{categories.length} muc</div>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-gray-500">Folder co san</div>
            <div className="text-gray-800">{folders.length} folder</div>
          </div>
        </div>

        {metaError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
            {metaError}
            <div className="text-xs mt-1">
              GS WebApp can ho tro action list folder + upload file (khong tao folder moi).
            </div>
          </div>
        ) : null}
      </div>

      <label
        className="block rounded-2xl border-2 border-dashed border-gray-300 bg-white p-6 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input type="file" accept="image/*" multiple className="hidden" onChange={onInputFiles} />
        <div className="text-base font-medium text-gray-800">Chon anh hoac keo-tha vao day</div>
        <div className="text-sm text-gray-500 mt-1">Preview ngay, AI goi y category, sau do ban check lai va upload.</div>
      </label>

      {!items.length ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-500">
          Chua co anh nao.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {items.length} anh · {items.filter((x) => x.done).length} da upload
            </div>
            <button
              onClick={clearDone}
              className="h-8 px-3 text-xs rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Don cac anh da upload
            </button>
          </div>

          {items.map((item) => {
            const badge = uploadStateBadge(item);
            const selectedCategory = categories.find((c) => c.key === item.categoryKey);
            const selectedFolder = folders.find((f) => f.id === item.folderId);
            return (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-[112px_minmax(0,1fr)] gap-3">
                  <div className="h-28 w-full md:w-28 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{item.name}</div>
                        <div className="text-xs text-gray-500">{fmtBytes(item.size)} · {item.type || "image"}</div>
                      </div>
                      <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${badge.cls}`}>
                        {badge.text}
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Category</label>
                        <select
                          value={item.categoryKey}
                          onChange={(e) => setCategory(item.id, e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white"
                        >
                          <option value="">-- chon category --</option>
                          {categories.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        {item.aiText ? (
                          <div className="mt-1 text-[11px] text-indigo-700 truncate" title={item.aiText}>
                            AI: {item.aiText}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Folder upload</label>
                        <select
                          value={item.folderId}
                          onChange={(e) => setFolder(item.id, e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white"
                        >
                          <option value="">-- chon folder --</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}{f.path ? ` (${f.path})` : ""}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-gray-500 truncate" title={item.folderHint || ""}>
                          {item.folderHint || ""}
                        </div>
                      </div>

                      <div className="flex items-end gap-2">
                        <button
                          onClick={() => runAiOne(item.id)}
                          disabled={item.aiLoading || !cfg.geminiKey}
                          className="h-9 px-3 text-sm rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                        >
                          {item.aiLoading ? "AI..." : "AI goi y"}
                        </button>
                        <button
                          onClick={() => uploadOne(item.id)}
                          disabled={item.uploading || item.done || !item.categoryKey || !item.folderId}
                          className="h-9 px-3 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {item.uploading ? "Dang upload..." : item.done ? "Da upload" : "Upload"}
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="h-9 px-3 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          Xoa
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-gray-600">
                      Category: <b>{selectedCategory?.label || "(chua chon)"}</b>
                      {" · "}
                      Folder: <b>{selectedFolder ? `${selectedFolder.name}${selectedFolder.path ? ` (${selectedFolder.path})` : ""}` : "(chua chon)"}</b>
                    </div>

                    {item.uploadUrl ? (
                      <a
                        href={item.uploadUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex text-xs text-blue-600 hover:underline"
                      >
                        Mo file da upload
                      </a>
                    ) : null}

                    {item.error ? (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                        {item.error}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

