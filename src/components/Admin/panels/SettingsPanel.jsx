import React, { useEffect, useRef, useState } from "react";
import { getAllConfig, setAllConfig, setConfig, resetAllConfig, KEYS } from "../../../utils/config.js";
import { audit, readLS } from "../../../utils.js";
import { buildUnifiedApiUrl } from "../../../services/sheets.multi.js";

const MANUAL_FIELDS = [
  {
    key: KEYS.SHEET_ID,
    label: "Google Sheet ID",
    placeholder: "1Z-Y_yZFe...",
    desc: "Dan ID hoac full link Google Sheet.",
    icon: "📊",
    span: "sm:col-span-2 lg:col-span-3",
  },
  {
    key: KEYS.DRIVE_FOLDER_ID,
    label: "Google Drive Folder ID",
    placeholder: "1kc6cjMe...",
    desc: "Dan ID hoac full link folder Drive.",
    icon: "📁",
    span: "sm:col-span-2 lg:col-span-3",
  },
  {
    key: KEYS.MESSENGER_LINK,
    label: "Messenger Link",
    placeholder: "https://m.me/...",
    desc: "Link lien he Messenger cho nut nhan tin.",
    icon: "💬",
  },
  {
    key: KEYS.ZALO_LINK,
    label: "Zalo Link",
    placeholder: "https://zalo.me/...",
    desc: "Link lien he Zalo cho nut nhan tin.",
    icon: "📱",
  },
  {
    key: KEYS.GEMINI_API_KEY,
    label: "Gemini API Key",
    placeholder: "AIzaSy...",
    desc: "Nhap key neu su dung AI Tags.",
    icon: "✨",
  },
  {
    key: KEYS.ENABLE_VISITOR_TRACKING,
    label: "Visitor Tracking",
    placeholder: "false",
    desc: "true/false de bat tat ghi log local.",
    icon: "👀",
  },
];

const AUTO_FIELDS = [
  { key: KEYS.SHEET_GID_PRODUCTS, label: "Products GID", placeholder: "541884820", icon: "🧁" },
  { key: KEYS.SHEET_GID_FB, label: "Facebook Posts", placeholder: "1250492303", icon: "📘" },
  { key: KEYS.SHEET_GID_MENU, label: "Menu", placeholder: "0", icon: "📜" },
  { key: KEYS.SHEET_GID_PAGES, label: "Trang noi dung", placeholder: "993105126", icon: "📄" },
  { key: KEYS.SHEET_GID_ANNOUNCEMENTS, label: "Thong bao", placeholder: "1621494911", icon: "📢" },
  { key: KEYS.SHEET_GID_CATEGORIES, label: "Danh muc", placeholder: "", icon: "🏷️" },
  { key: KEYS.SHEET_GID_TAGS, label: "Tags", placeholder: "", icon: "🔖" },
  { key: KEYS.SHEET_GID_TYPES, label: "Loai banh", placeholder: "", icon: "🎂" },
  { key: KEYS.SHEET_GID_SIZES, label: "Size", placeholder: "", icon: "📐" },
  { key: KEYS.SHEET_GID_LEVELS, label: "Levels", placeholder: "", icon: "⭐" },
  {
    key: KEYS.API_ALL_URL,
    label: "API All URL (Apps Script)",
    placeholder: "https://script.google.com/.../exec",
    icon: "⚡",
  },
  {
    key: KEYS.GS_WEBAPP_URL,
    label: "GS WebApp URL",
    placeholder: "https://script.google.com/.../exec",
    icon: "🔧",
  },
];

const AUTO_VISIBLE_KEYS = AUTO_FIELDS.map((f) => f.key);
const AUTO_KEYS = [...AUTO_VISIBLE_KEYS, KEYS.PRODUCT_TABS];

const SYSTEM_TAB_MATCHERS = {
  menu: [/^menu$/i, /^navigation$/i, /^nav$/i],
  fb: [/^link\s*fb$/i, /^facebook(\s*posts?)?$/i, /^fb(\s*posts?)?$/i],
  pages: [/^page$/i, /^pages$/i, /^trang(\s*noi\s*dung)?$/i, /^noi\s*dung$/i, /^content$/i],
  announcements: [/^announcements?$/i, /^thong\s*bao$/i, /^notice(s)?$/i],
  config: [/^url$/i, /^config$/i, /^settings?$/i, /^cau\s*hinh$/i, /^configuration$/i],
  categories: [/^danh\s*muc$/i, /^categories?$/i, /^category$/i],
  tags: [/^tags?$/i],
  types: [/^loai\s*banh$/i, /^types?$/i, /^cake\s*types?$/i],
  sizes: [/^sizes?$/i, /^kich\s*thuoc$/i],
  levels: [/^levels?$/i],
};

const PRODUCT_HINT = [/^product(s)?$/i, /^san\s*pham$/i, /^s[aả]n\s*ph[aẩ]m$/i];

function normalizeText(s = "") {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeGidInput(v = "") {
  const raw = String(v || "").trim();
  if (!raw) return "";
  return raw.split(":")[0].trim();
}

function decodeEscapedText(raw = "") {
  return String(raw || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function parseCSV(text = "") {
  const out = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nx = text[i + 1];
    if (inQ) {
      if (ch === "\"" && nx === "\"") {
        cur += "\"";
        i++;
      } else if (ch === "\"") {
        inQ = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === "\"") inQ = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") {
      cur += ch;
    }
  }
  row.push(cur);
  out.push(row);
  return out;
}

function normalizeCfgKey(k = "") {
  return normalizeText(k).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseKeyValueTable(text = "") {
  const rows = parseCSV(String(text || "").replace(/^\uFEFF/, ""));
  if (!rows.length) return {};

  const first = rows[0] || [];
  const f0 = normalizeCfgKey(first[0] || "");
  const f1 = normalizeCfgKey(first[1] || "");
  const hasHeader =
    (f0 === "key" || f0 === "name" || f0 === "config_key") &&
    (f1 === "value" || f1 === "url" || f1 === "link" || f1 === "config_value");

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const out = {};
  for (const r of dataRows) {
    const key = normalizeCfgKey(r[0] || "");
    const value = String(r[1] || "").trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function pickCfgValue(obj = {}, aliases = []) {
  for (const key of aliases) {
    const nk = normalizeCfgKey(key);
    if (obj[nk]) return obj[nk];
  }
  return "";
}

async function fetchConfigFromTab(sheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Khong doc duoc tab config (HTTP ${res.status})`);
  const text = await res.text();
  return parseKeyValueTable(text);
}

function parseTabsFromEditHtml(html = "") {
  const out = [];
  const seen = new Set();
  const re = /\[(\d+),0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)\\"/g;
  let m;
  while ((m = re.exec(html))) {
    const idx = Number(m[1]);
    const gid = String(m[2] || "").trim();
    const title = decodeEscapedText(m[3] || "").trim();
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    out.push({ idx: Number.isFinite(idx) ? idx : out.length, gid, title: title || `Sheet ${gid}` });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

function pickGidByMatcher(tabs = [], matchers = []) {
  for (const t of tabs) {
    const n = normalizeText(t.title);
    if (matchers.some((rx) => rx.test(n))) return t.gid;
  }
  return "";
}

async function inferConfigFromSheet(sheetId = "") {
  const id = String(sheetId || "").trim();
  if (!id) throw new Error("Thieu Sheet ID");

  const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Khong doc duoc sheet (HTTP ${res.status})`);

  const html = await res.text();
  const tabs = parseTabsFromEditHtml(html);
  if (!tabs.length) throw new Error("Khong phan tich duoc danh sach tab tu sheet");

  const inferred = {
    [KEYS.SHEET_GID_MENU]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.menu),
    [KEYS.SHEET_GID_FB]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.fb),
    [KEYS.SHEET_GID_PAGES]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.pages),
    [KEYS.SHEET_GID_ANNOUNCEMENTS]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.announcements),
    [KEYS.SHEET_GID_CATEGORIES]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.categories),
    [KEYS.SHEET_GID_TAGS]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.tags),
    [KEYS.SHEET_GID_TYPES]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.types),
    [KEYS.SHEET_GID_SIZES]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.sizes),
    [KEYS.SHEET_GID_LEVELS]: pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.levels),
  };

  const systemGids = new Set(Object.values(inferred).filter(Boolean));
  let productTabs = tabs.filter((t) => PRODUCT_HINT.some((rx) => rx.test(normalizeText(t.title))));
  if (!productTabs.length) productTabs = tabs.filter((t) => !systemGids.has(t.gid));
  if (!productTabs.length && tabs.length) productTabs = [tabs[0]];

  const primaryProduct = productTabs[0];
  inferred[KEYS.SHEET_GID_PRODUCTS] = primaryProduct?.gid || "";
  inferred[KEYS.PRODUCT_TABS] = primaryProduct?.gid ? `${primaryProduct.gid}:product` : "";

  const configGid = pickGidByMatcher(tabs, SYSTEM_TAB_MATCHERS.config);
  if (configGid) {
    try {
      const cfg = await fetchConfigFromTab(id, configGid);
      inferred[KEYS.API_ALL_URL] = pickCfgValue(cfg, [
        "api_all_url",
        "api_all",
        "api_url",
        "all_url",
        "apps_script_all_url",
      ]);
      inferred[KEYS.GS_WEBAPP_URL] = pickCfgValue(cfg, [
        "gs_webapp_url",
        "webapp_url",
        "gs_webapp",
        "admin_webapp_url",
        "webapp",
      ]);
      inferred[KEYS.MESSENGER_LINK] = pickCfgValue(cfg, [
        "messenger_link",
        "messenger",
        "facebook_messenger",
        "fb_messenger_link",
      ]);
      inferred[KEYS.ZALO_LINK] = pickCfgValue(cfg, ["zalo_link", "zalo", "zalo_chat_link", "zalo_url"]);
    } catch {
      // Keep silent if config tab exists but cannot parse.
    }
  }

  return { inferred, tabsCount: tabs.length, productTabCount: productTabs.length };
}

function mergeAutoValues(baseValues, inferredValues, lastAutoMap, onlyMissing = false) {
  const next = { ...(baseValues || {}) };
  let changed = false;

  for (const key of AUTO_KEYS) {
    const incoming = String(inferredValues?.[key] || "").trim();
    if (!incoming) continue;

    const current = String(next[key] || "").trim();
    if (onlyMissing && current) continue;

    if (current !== incoming) {
      next[key] = incoming;
      changed = true;
    }
    lastAutoMap[key] = incoming;
  }
  return { next, changed };
}

function formatSyncTime(ts = "") {
  const v = String(ts || "").trim();
  if (!v) return "Chua co";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("vi-VN");
}

function unifiedParamsFromValues(values = {}) {
  return {
    apiAllUrl: String(values?.[KEYS.API_ALL_URL] || "").trim(),
    sheetId: String(values?.[KEYS.SHEET_ID] || "").trim(),
    productTabs: String(values?.[KEYS.PRODUCT_TABS] || "").trim(),
    gids: {
      products: String(values?.[KEYS.SHEET_GID_PRODUCTS] || "").trim(),
      menu: String(values?.[KEYS.SHEET_GID_MENU] || "").trim(),
      pages: String(values?.[KEYS.SHEET_GID_PAGES] || "").trim(),
      announcements: String(values?.[KEYS.SHEET_GID_ANNOUNCEMENTS] || "").trim(),
      categories: String(values?.[KEYS.SHEET_GID_CATEGORIES] || "").trim(),
      tags: String(values?.[KEYS.SHEET_GID_TAGS] || "").trim(),
      types: String(values?.[KEYS.SHEET_GID_TYPES] || "").trim(),
      levels: String(values?.[KEYS.SHEET_GID_LEVELS] || "").trim(),
      sizes: String(values?.[KEYS.SHEET_GID_SIZES] || "").trim(),
      fb: String(values?.[KEYS.SHEET_GID_FB] || "").trim(),
    },
  };
}

function ConfigCard({ icon, title, desc, right, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className="font-semibold text-gray-800">{title}</h3>
            {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ field, value, onChange }) {
  const id = `cfg-${field.key}`;
  return (
    <div className={field.span || ""}>
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
        <span className="text-base">{field.icon}</span>
        {field.label}
      </label>
      {field.desc && <p className="text-xs text-gray-400 mb-1.5 ml-7 leading-4">{field.desc}</p>}
      <input
        id={id}
        type="text"
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono
                   bg-gray-50/50 focus:bg-white
                   focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400
                   outline-none transition-all duration-200"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
      />
    </div>
  );
}

export default function SettingsPanel() {
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const autoReqRef = useRef(0);
  const autoLastSignatureRef = useRef("");
  const autoFilledRef = useRef({});

  useEffect(() => {
    setValues(getAllConfig());
  }, []);

  const update = (key, val) => {
    if (key === KEYS.SHEET_ID || key === KEYS.DRIVE_FOLDER_ID) {
      autoLastSignatureRef.current = "";
      if (key === KEYS.SHEET_ID && !String(val || "").trim()) {
        autoFilledRef.current = {};
      }
      setAutoMsg("");
      setValues((prev) => ({ ...prev, [key]: val }));
      setHasChanges(true);
      setSaved(false);
      return;
    }
    if (key === KEYS.SHEET_GID_PRODUCTS) {
      const gid = normalizeGidInput(val);
      setValues((prev) => ({
        ...prev,
        [KEYS.SHEET_GID_PRODUCTS]: gid,
        [KEYS.PRODUCT_TABS]: gid ? `${gid}:product` : "",
      }));
      setHasChanges(true);
      setSaved(false);
      return;
    }
    setValues((prev) => ({ ...prev, [key]: val }));
    setHasChanges(true);
    setSaved(false);
  };

  const sheetValue = String(values[KEYS.SHEET_ID] || "").trim();
  const driveValue = String(values[KEYS.DRIVE_FOLDER_ID] || "").trim();
  const lastSyncAt = String(values[KEYS.LAST_SYNC_AT] || "").trim();
  const unifiedApiUrl = buildUnifiedApiUrl({ ...unifiedParamsFromValues(values), forceLocal: true });
  const canSyncNow = !!unifiedApiUrl;

  useEffect(() => {
    if (!sheetValue) {
      setAutoBusy(false);
      setAutoMsg("");
      return;
    }

    const signature = `${sheetValue}::${driveValue}`;
    if (signature === autoLastSignatureRef.current) return;

    const timer = setTimeout(async () => {
      const reqId = ++autoReqRef.current;
      setAutoBusy(true);
      try {
        const { inferred, tabsCount, productTabCount } = await inferConfigFromSheet(sheetValue);
        if (reqId !== autoReqRef.current) return;

        setValues((prev) => {
          const { next, changed } = mergeAutoValues(prev, inferred, autoFilledRef.current, false);
          if (changed) {
            setHasChanges(true);
            setSaved(false);
          }
          return next;
        });

        autoLastSignatureRef.current = signature;
        setAutoMsg(`Tu dong nhan: ${tabsCount} tab, ${productTabCount} product tab.`);
      } catch (e) {
        if (reqId !== autoReqRef.current) return;
        setAutoMsg(e?.message || "Khong the tu dong nhan du lieu tu sheet.");
      } finally {
        if (reqId === autoReqRef.current) setAutoBusy(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [sheetValue, driveValue]);

  const clearDataCache = () => {
    const dataCacheKeys = [
      "products",
      "categories",
      "menu",
      "pages",
      "tags",
      "schemes",
      "types",
      "levels",
      "sizes",
      "fb_urls",
      "halley_announcements",
    ];
    dataCacheKeys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("cache:")) localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
  };

  const withAutoInferredMissing = async (baseValues) => {
    const current = { ...(baseValues || {}) };
    const sheetId = String(current[KEYS.SHEET_ID] || "").trim();
    if (!sheetId) return current;

    const hasMissingAuto = AUTO_KEYS.some((k) => !String(current[k] || "").trim());
    if (!hasMissingAuto) return current;

    try {
      const { inferred } = await inferConfigFromSheet(sheetId);
      const { next, changed } = mergeAutoValues(current, inferred, autoFilledRef.current, true);
      if (changed) {
        setValues(next);
        setHasChanges(true);
      }
      return next;
    } catch {
      return current;
    }
  };

  const syncNow = async () => {
    if (!canSyncNow) {
      setSyncMsg("Thieu API all URL hoac Sheet ID de sync.");
      return;
    }
    setSyncBusy(true);
    setSyncMsg("");
    try {
      const url = buildUnifiedApiUrl({
        ...unifiedParamsFromValues(values),
        forceLocal: true,
        force: true,
        meta: true,
      });
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Sync that bai (HTTP ${res.status})`);
      }
      const syncedAt = data?._meta?.refreshedAt || new Date().toISOString();
      setConfig(KEYS.LAST_SYNC_AT, syncedAt);
      setValues((prev) => ({ ...prev, [KEYS.LAST_SYNC_AT]: syncedAt }));
      clearDataCache();
      window.dispatchEvent(new Event("hb:config-changed"));
      setSyncMsg("Sync xong. Du lieu moi da san sang.");
      setTimeout(() => setSyncMsg(""), 4000);
    } catch (e) {
      setSyncMsg(e?.message || "Khong the sync ngay.");
    } finally {
      setSyncBusy(false);
    }
  };

  const save = async () => {
    const finalValues = await withAutoInferredMissing(values);
    const host = String(window.location?.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    if (!isLocal && !String(finalValues[KEYS.API_ALL_URL] || "").trim()) {
      finalValues[KEYS.API_ALL_URL] = "/api/all";
    }
    setAllConfig(finalValues);
    clearDataCache();
    window.dispatchEvent(new Event("hb:config-changed"));
    setSaved(true);
    setHasChanges(false);
    setTimeout(() => setSaved(false), 3000);
    audit("settings.save", { user: (readLS("auth") || {}).username || "?" });
  };

  const reset = () => {
    if (!confirm("Xoa toan bo config da luu local?\nGia tri se fallback ve .env (neu co).")) return;
    resetAllConfig();
    clearDataCache();
    window.dispatchEvent(new Event("hb:config-changed"));
    setValues(getAllConfig());
    setHasChanges(false);
    setSaved(false);
    setAutoMsg("");
    autoFilledRef.current = {};
    autoLastSignatureRef.current = "";
  };

  const reload = async () => {
    await save();
    window.location.reload();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-md">
              ⚙
            </span>
            Cau hinh he thong
          </h2>
          <p className="text-sm text-gray-500 mt-2 ml-12">
            Nhom tren: thong tin can nhap tay. Nhom duoi: cac gia tri he thong tu nhan tu Sheet.
          </p>
        </div>
      </div>

      <ConfigCard icon="📝" title="Thong Tin Nhap Tay" desc="Nhap thong tin nguon du lieu va lien ket quan tri.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MANUAL_FIELDS.map((f) => (
            <Field key={f.key} field={f} value={values[f.key] || ""} onChange={update} />
          ))}
        </div>
      </ConfigCard>

      <ConfigCard
        icon="🤖"
        title="Thong Tin Tu Dong Nhan"
        desc="Khi Sheet ID thay doi, he thong quet tabs va dien gia tri co the nhan duoc."
        right={
          <div className="text-right space-y-1.5">
            <div className={`text-xs font-medium ${autoBusy ? "text-indigo-600" : "text-gray-500"}`}>
              {autoBusy ? "Dang tu dong nhan..." : "Tu dong nhan khi doi Sheet ID"}
            </div>
            <div className="text-[11px] text-gray-400">Last synced: {formatSyncTime(lastSyncAt)}</div>
            <button
              onClick={syncNow}
              disabled={!canSyncNow || syncBusy}
              className="inline-flex items-center justify-center rounded-lg border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {syncBusy ? "Dang sync..." : "Sync ngay"}
            </button>
            {autoMsg && <div className="text-[11px] text-gray-400 mt-1 max-w-[280px]">{autoMsg}</div>}
            {syncMsg && <div className="text-[11px] text-indigo-500 max-w-[280px]">{syncMsg}</div>}
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {AUTO_FIELDS.map((f) => (
            <Field key={f.key} field={f} value={values[f.key] || ""} onChange={update} />
          ))}
        </div>
      </ConfigCard>

      <div className="sticky bottom-4 z-20">
        <div className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-xl shadow-lg px-6 py-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={reload}
            disabled={!hasChanges}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold
                       hover:from-indigo-700 hover:to-purple-700 active:scale-[0.98]
                       disabled:opacity-40 disabled:cursor-not-allowed
                       shadow-md hover:shadow-lg transition-all duration-200"
          >
            Luu & Tai lai
          </button>
          <button
            onClick={save}
            disabled={!hasChanges}
            className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700
                       hover:bg-gray-50 active:scale-[0.98]
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200"
          >
            Luu (khong tai lai)
          </button>
          <button
            onClick={reset}
            className="px-5 py-2.5 text-red-600 border border-red-100 rounded-xl text-sm font-medium
                       hover:bg-red-50 active:scale-[0.98]
                       transition-all duration-200 ml-auto"
          >
            Reset mac dinh
          </button>

          <div className={`text-sm font-medium transition-all duration-500 ${saved ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}>
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full">Da luu</span>
          </div>
        </div>
      </div>
    </div>
  );
}
