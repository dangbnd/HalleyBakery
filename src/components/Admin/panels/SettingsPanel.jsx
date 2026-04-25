import React, { useEffect, useRef, useState } from "react";
import { getAllConfig, setAllConfig, setConfig, resetAllConfig, getGeminiKeys, KEYS } from "../../../utils/config.js";
import { LS, audit, readLS } from "../../../utils.js";
import { buildUnifiedApiUrl } from "../../../services/sheets.multi.js";
import { DEFAULT_SUPER_ADMIN_EMAIL } from "../shared/superAdmin.js";
import { saveRuntimeConfigToSheet } from "../shared/sheets.js";
import { Badge, Button, Callout, MetricItem, MetricStrip, PageHeader, Section } from "../ui/primitives.jsx";

const MANUAL_FIELDS = [
  {
    key: KEYS.SHEET_ID,
    label: "Google Sheet ID",
    placeholder: "1Z-Y_yZFe...",
    desc: "Dán ID hoặc full link Google Sheet.",
    icon: "📊",
    span: "sm:col-span-2 lg:col-span-3",
  },
  {
    key: KEYS.DRIVE_FOLDER_ID,
    label: "Google Drive Folder ID",
    placeholder: "1kc6cjMe...",
    desc: "Dán ID hoặc full link thư mục Drive.",
    icon: "📁",
    span: "sm:col-span-2 lg:col-span-3",
  },
  {
    key: KEYS.FEEDBACK_DRIVE_FOLDER_ID,
    label: "Feedback Drive Folder ID",
    placeholder: "1abcFeedbackFolder...",
    desc: "Thư mục riêng để lưu ảnh feedback khách gửi.",
    icon: "🖼️",
    span: "sm:col-span-2 lg:col-span-3",
  },
  {
    key: KEYS.MESSENGER_LINK,
    label: "Messenger Link",
    placeholder: "https://m.me/...",
    desc: "Link liên hệ Messenger cho nút nhắn tin.",
    icon: "💬",
  },
  {
    key: KEYS.ZALO_LINK,
    label: "Zalo Link",
    placeholder: "https://zalo.me/...",
    desc: "Link liên hệ Zalo cho nút nhắn tin.",
    icon: "📱",
  },
  {
    key: KEYS.GOOGLE_OAUTH_CLIENT_ID,
    label: "Google OAuth Client ID",
    placeholder: "1234567890-xxxx.apps.googleusercontent.com",
    desc: "Dùng cho direct upload Drive (giữ chất lượng 100%).",
    icon: "🔐",
  },
  {
    key: KEYS.SUPER_ADMIN_EMAIL,
    label: "Super Admin Email (Google)",
    placeholder: "dangbnd@gmail.com",
    desc: "Email đăng nhập Google sẽ tự thành super admin.",
    icon: "👑",
    span: "sm:col-span-2",
  },
  {
    key: KEYS.ADMIN_ALLOWED_EMAILS,
    label: "Admin Allowed Emails",
    placeholder: "owner@halleybakery.io.vn\nmanager@halleybakery.io.vn\n@halleybakery.io.vn",
    desc: "Mỗi dòng 1 email hoặc domain (@domain.com). Để trống nếu chỉ muốn quản lý bằng OAuth test users.",
    icon: "👥",
    type: "textarea",
    rows: 4,
    span: "sm:col-span-2 lg:col-span-3",
  },
  {
    key: KEYS.GS_WEBAPP_TOKEN,
    label: "GS WebApp Admin Token",
    placeholder: "Dán GIÁ TRỊ token (không phải chữ HB_ADMIN_TOKEN)",
    desc: "Lấy value của key HB_ADMIN_TOKEN trong Apps Script > Project settings > Script properties.",
    icon: "🔑",
    type: "password",
    span: "sm:col-span-2",
  },
  {
    key: KEYS.TRACKING_SHEET_ID,
    label: "Tracking Sheet ID",
    placeholder: "Dan ID hoac link Google Sheet tracking rieng",
    desc: "File rieng chi de luu Events theo ngay va Consults. De trong thi tracking fallback ve file hien tai.",
    icon: "LOG",
    span: "sm:col-span-2 lg:col-span-3",
  },
  {
    key: KEYS.GEMINI_API_KEY,
    label: "Gemini API Keys",
    placeholder: "Chưa cấu hình",
    desc: "Được tự động đồng bộ từ tab AI Tags.",
    icon: "✨",
    readOnly: true,
  },
  {
    key: KEYS.ENABLE_VISITOR_TRACKING,
    label: "Visitor Tracking",
    placeholder: "false",
    desc: "true/false để bật/tắt ghi log local.",
    icon: "👀",
  },
  {
    key: KEYS.IP2LOCATION_API_KEY,
    label: "IP2Location API Key",
    placeholder: "Dan key IP2Location.io",
    desc: "Dung cho /api/track tra IP ra quan/huyen tot hon. Key luu o tab Config va backend doc server-side.",
    icon: "IP",
    type: "password",
    span: "sm:col-span-2",
  },
];

const AUTO_FIELDS = [
  { key: KEYS.SHEET_GID_PRODUCTS, label: "Products GID", placeholder: "541884820", icon: "🧁" },
  { key: KEYS.SHEET_GID_FB, label: "Facebook Posts", placeholder: "1250492303", icon: "📘" },
  { key: KEYS.SHEET_GID_MENU, label: "Menu", placeholder: "0", icon: "📜" },
  { key: KEYS.SHEET_GID_PAGES, label: "Trang nội dung", placeholder: "993105126", icon: "📄" },
  { key: KEYS.SHEET_GID_ANNOUNCEMENTS, label: "Thông báo", placeholder: "1621494911", icon: "📢" },
  { key: KEYS.SHEET_GID_CATEGORIES, label: "Danh mục", placeholder: "", icon: "🏷️" },
  { key: KEYS.SHEET_GID_TAGS, label: "Tags", placeholder: "", icon: "🔖" },
  { key: KEYS.SHEET_GID_TYPES, label: "Loại bánh", placeholder: "", icon: "🎂" },
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
const AUTO_KEYS = [...AUTO_VISIBLE_KEYS, KEYS.PRODUCT_TABS, KEYS.SHEET_GID_CONFIG];
const AUTO_REQUIRED_KEYS = [
  KEYS.SHEET_GID_PRODUCTS,
  KEYS.SHEET_GID_FB,
  KEYS.SHEET_GID_MENU,
  KEYS.SHEET_GID_PAGES,
  KEYS.SHEET_GID_ANNOUNCEMENTS,
  KEYS.SHEET_GID_CATEGORIES,
  KEYS.SHEET_GID_TAGS,
  KEYS.SHEET_GID_TYPES,
  KEYS.SHEET_GID_SIZES,
];
const AUTO_SYNC_SIGNATURE_KEY = "admin.settings.auto_sync_signature_v1";

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
    if (!key) continue;
    const valueParts = r.slice(1);
    const value = valueParts.join(",").trim();
    if (!value) continue;
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
  if (!res.ok) throw new Error(`Không đọc được tab config (HTTP ${res.status})`);
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
  if (!id) throw new Error("Thiếu Sheet ID");

  const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không đọc được sheet (HTTP ${res.status})`);

  const html = await res.text();
  const tabs = parseTabsFromEditHtml(html);
  if (!tabs.length) throw new Error("Không phân tích được danh sách tab từ sheet");

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
  inferred[KEYS.SHEET_GID_CONFIG] = configGid || "";
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
  if (!v) return "Chưa có";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("vi-VN");
}

function geminiStatusLabel() {
  const count = getGeminiKeys().length;
  return count > 0 ? `Đã đồng bộ ${count} keys từ AI Tags` : "Chưa cấu hình";
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

function ConfigSection({ icon, title, badge, children }) {
  return (
    <Section
      compact
      title={
        <span className="inline-flex items-center gap-2">
          <span>{icon}</span>
          <span>{title}</span>
        </span>
      }
      actions={badge}
    >
      <div className="space-y-2">{children}</div>
    </Section>
  );
}

function Field({ field, value, onChange, disabled = false }) {
  const id = `cfg-${field.key}`;
  const isDisabled = field.readOnly || disabled;
  const inputClassName = `w-full rounded-xl border px-3 h-10 text-xs
                   focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60
                   outline-none transition-all duration-200
                    ${isDisabled
            ? "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
            : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-100"
          }`;
  return (
    <div className={field.span || ""}>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
        <span className="text-xs opacity-80">{field.icon}</span>
        {field.label}
      </label>
      {field.desc && <p className="mb-1 text-[10px] leading-4 text-slate-500">{field.desc}</p>}
      {field.type === "textarea" ? (
        <textarea
          id={id}
          rows={field.rows || 3}
          className={`${inputClassName} h-auto py-2 leading-5 resize-y`}
          value={value}
          onChange={(e) => { if (!isDisabled) onChange(field.key, e.target.value); }}
          placeholder={field.placeholder}
          disabled={isDisabled}
        />
      ) : (
        <input
          id={id}
          type={field.type || "text"}
          className={inputClassName}
          value={value}
          onChange={(e) => { if (!isDisabled) onChange(field.key, e.target.value); }}
          placeholder={field.placeholder}
          disabled={isDisabled}
        />
      )}
    </div>
  );
}

function StatusCell({ ok, label }) {
  return <Badge variant={ok ? "success" : "warning"}>{label}</Badge>;
}

function DenseInfoTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <th className="py-2.5 pr-3">Mục</th>
            <th className="py-2.5 pr-3">Trạng thái</th>
            <th className="py-2.5">Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-800/80 last:border-b-0">
              <td className="py-3 pr-3 font-medium text-slate-200">{row.name}</td>
              <td className="py-3 pr-3">{row.status}</td>
              <td className="py-3 text-slate-400">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SettingsPanel({ canEdit = true }) {
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const autoReqRef = useRef(0);
  const autoLastSignatureRef = useRef("");
  const autoFilledRef = useRef({});
  const readPersistedAutoSignature = () => {
    try {
      return String(localStorage.getItem(AUTO_SYNC_SIGNATURE_KEY) || "");
    } catch {
      return "";
    }
  };
  const writePersistedAutoSignature = (value = "") => {
    try {
      if (value) localStorage.setItem(AUTO_SYNC_SIGNATURE_KEY, String(value));
      else localStorage.removeItem(AUTO_SYNC_SIGNATURE_KEY);
    } catch {}
  };

  useEffect(() => {
    const vals = getAllConfig();
    if (!String(vals[KEYS.SUPER_ADMIN_EMAIL] || "").trim()) {
      vals[KEYS.SUPER_ADMIN_EMAIL] = DEFAULT_SUPER_ADMIN_EMAIL;
    }
    vals[KEYS.GEMINI_API_KEY] = geminiStatusLabel();
    setValues(vals);
  }, []);

  const update = (key, val) => {
    if (!canEdit || saveBusy) return;
    if (key === KEYS.SHEET_ID || key === KEYS.DRIVE_FOLDER_ID) {
      autoLastSignatureRef.current = "";
      writePersistedAutoSignature("");
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
  const manualReady = MANUAL_FIELDS.filter((field) => field.readOnly || String(values[field.key] || "").trim()).length;
  const autoReady = AUTO_FIELDS.filter((field) => String(values[field.key] || "").trim()).length;
  const criticalReady = [KEYS.SHEET_ID, KEYS.GS_WEBAPP_URL, KEYS.GS_WEBAPP_TOKEN, KEYS.DRIVE_FOLDER_ID].filter((key) =>
    String(values[key] || "").trim()
  ).length;
  const systemRows = [
    {
      key: "sheet",
      name: "Google Sheet",
      status: <StatusCell ok={!!sheetValue} label={sheetValue ? "Đã nối" : "Thiếu"} />,
      detail: sheetValue ? "Nguồn dữ liệu chính đã khai báo." : "Thiếu Sheet ID nên nhiều panel phải fallback.",
    },
    {
      key: "drive",
      name: "Google Drive",
      status: <StatusCell ok={!!driveValue} label={driveValue ? "Sẵn sàng" : "Thiếu"} />,
      detail: driveValue ? "Đã có thư mục gốc cho media." : "Chưa có thư mục gốc cho upload.",
    },
    {
      key: "webapp",
      name: "GS WebApp",
      status: <StatusCell ok={!!values[KEYS.GS_WEBAPP_URL] && !!values[KEYS.GS_WEBAPP_TOKEN]} label={values[KEYS.GS_WEBAPP_URL] && values[KEYS.GS_WEBAPP_TOKEN] ? "Đủ URL + token" : "Thiếu cấu hình"} />,
      detail:
        values[KEYS.GS_WEBAPP_URL] && values[KEYS.GS_WEBAPP_TOKEN]
          ? "Có thể ghi dữ liệu admin lên Sheet."
          : "Chưa đủ điều kiện cho thao tác ghi từ admin.",
    },
    {
      key: "oauth",
      name: "Google OAuth",
      status: <StatusCell ok={!!values[KEYS.GOOGLE_OAUTH_CLIENT_ID]} label={values[KEYS.GOOGLE_OAUTH_CLIENT_ID] ? "Đã có client ID" : "Thiếu"} />,
      detail: values[KEYS.GOOGLE_OAUTH_CLIENT_ID] ? "Drive direct upload có thể hoạt động." : "Thiếu client ID cho direct upload.",
    },
  ];

  const runtimeRows = [
    {
      key: "gemini",
      name: "Gemini keys",
      status: <StatusCell ok={getGeminiKeys().length > 0} label={getGeminiKeys().length > 0 ? `${getGeminiKeys().length} key` : "Chưa có"} />,
      detail: getGeminiKeys().length > 0 ? "Nguồn AI đã được khai báo trong tab AI Tags." : "Chưa có key AI hoạt động.",
    },
    {
      key: "tracking",
      name: "Visitor tracking",
      status: <StatusCell ok={String(values[KEYS.ENABLE_VISITOR_TRACKING] || "").toLowerCase() === "true"} label={String(values[KEYS.ENABLE_VISITOR_TRACKING] || "").toLowerCase() === "true" ? "Đang bật" : "Đang tắt"} />,
      detail: "Điều khiển ghi log local từ frontend.",
    },
    {
      key: "sync",
      name: "Sync gần nhất",
      status: <StatusCell ok={!!lastSyncAt} label={lastSyncAt ? "Đã sync" : "Chưa sync"} />,
      detail: lastSyncAt ? formatSyncTime(lastSyncAt) : "Chưa có mốc đồng bộ.",
    },
  ];

  useEffect(() => {
    if (!canEdit) { setAutoBusy(false); setAutoMsg(""); return; }
    if (!sheetValue) { setAutoBusy(false); setAutoMsg(""); return; }
    const signature = `${sheetValue}::${driveValue}`;
    const persistedSignature = readPersistedAutoSignature();
    const hasMissingAuto = AUTO_REQUIRED_KEYS.some((k) => !String(values[k] || "").trim());
    if (!hasMissingAuto) {
      autoLastSignatureRef.current = signature;
      writePersistedAutoSignature(signature);
      setAutoBusy(false);
      setAutoMsg("");
      return;
    }
    if (signature === autoLastSignatureRef.current || signature === persistedSignature) {
      setAutoBusy(false);
      return;
    }
    const timer = setTimeout(async () => {
      const reqId = ++autoReqRef.current;
      setAutoBusy(true);
      try {
        const { inferred, tabsCount, productTabCount } = await inferConfigFromSheet(sheetValue);
        if (reqId !== autoReqRef.current) return;
        setValues((prev) => {
          const { next, changed } = mergeAutoValues(prev, inferred, autoFilledRef.current, false);
          if (changed) { setHasChanges(true); setSaved(false); }
          return next;
        });
        autoLastSignatureRef.current = signature;
        writePersistedAutoSignature(signature);
        setAutoMsg(`Tự động nhận: ${tabsCount} tab, ${productTabCount} product tab.`);
      } catch (e) {
        if (reqId !== autoReqRef.current) return;
        setAutoMsg(e?.message || "Không thể tự động nhận dữ liệu.");
      } finally {
        if (reqId === autoReqRef.current) setAutoBusy(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [canEdit, sheetValue, driveValue, values]);

  const clearDataCache = () => {
    ["products","categories","menu","pages","tags","schemes","types","levels","sizes","fb_urls","halley_announcements"].forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("cache:")) localStorage.removeItem(k);
      }
    } catch {}
  };

  const withAutoInferredMissing = async (baseValues) => {
    const current = { ...(baseValues || {}) };
    const sheetId = String(current[KEYS.SHEET_ID] || "").trim();
    if (!sheetId) return current;
    const hasMissingAuto = AUTO_REQUIRED_KEYS.some((k) => !String(current[k] || "").trim());
    if (!hasMissingAuto) return current;
    try {
      const { inferred } = await inferConfigFromSheet(sheetId);
      const { next, changed } = mergeAutoValues(current, inferred, autoFilledRef.current, true);
      if (changed) { setValues(next); setHasChanges(true); }
      return next;
    } catch { return current; }
  };

  const syncNow = async () => {
    if (!canEdit || saveBusy) return;
    if (!canSyncNow) { setSyncMsg("Thiếu API URL hoặc Sheet ID."); return; }
    setSyncBusy(true); setSyncMsg("");
    try {
      const url = buildUnifiedApiUrl({ ...unifiedParamsFromValues(values), forceLocal: true, force: true, meta: true });
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `Sync thất bại (HTTP ${res.status})`);
      const syncedAt = data?._meta?.refreshedAt || new Date().toISOString();
      setConfig(KEYS.LAST_SYNC_AT, syncedAt);
      setValues((prev) => ({ ...prev, [KEYS.LAST_SYNC_AT]: syncedAt }));
      clearDataCache();
      window.dispatchEvent(new Event("hb:config-changed"));
      setSyncMsg("✅ Sync xong. Dữ liệu mới đã sẵn sàng.");
      setTimeout(() => setSyncMsg(""), 4000);
    } catch (e) {
      setSyncMsg(e?.message || "Không thể sync ngay.");
    } finally { setSyncBusy(false); }
  };

  const save = async () => {
    if (!canEdit || saveBusy) return false;
    setSaveBusy(true);
    try {
      const finalValues = await withAutoInferredMissing(values);
      if (!String(finalValues[KEYS.SUPER_ADMIN_EMAIL] || "").trim()) {
        finalValues[KEYS.SUPER_ADMIN_EMAIL] = DEFAULT_SUPER_ADMIN_EMAIL;
      }
      const host = String(window.location?.hostname || "").toLowerCase();
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
      if (!isLocal && !String(finalValues[KEYS.API_ALL_URL] || "").trim()) finalValues[KEYS.API_ALL_URL] = "/api/all";
      const geminiKeys = getGeminiKeys();
      finalValues[KEYS.GEMINI_API_KEYS] = geminiKeys.join("\n");
      finalValues[KEYS.GEMINI_API_KEY] = geminiKeys[0] || "";
      const authToken = String(finalValues[KEYS.GS_WEBAPP_TOKEN] || "").trim();
      const webappUrl = String(finalValues[KEYS.GS_WEBAPP_URL] || "").trim();

      let remoteSyncNote = "";
      let remoteSyncOk = false;
      try {
        const pushed = await saveRuntimeConfigToSheet(finalValues, { authToken, webappUrl });
        remoteSyncOk = true;
        remoteSyncNote = `✅ Đã đồng bộ ${pushed.updated + pushed.inserted} mục lên tab ${pushed.sheetName}.`;
      } catch (e) {
        remoteSyncNote = `⚠ Chưa đồng bộ toàn máy: ${e?.message || "lỗi không xác định"}`;
      }

      setAllConfig(finalValues);
      clearDataCache();
      window.dispatchEvent(new Event("hb:config-changed"));
      if (remoteSyncNote) {
        setSyncMsg(remoteSyncNote);
        if (remoteSyncOk) setTimeout(() => setSyncMsg(""), 6000);
      }

      audit("settings.save", {
        user: (readLS(LS.AUTH, {}) || {}).username || "?",
        remoteSyncOk,
      });

      if (!remoteSyncOk) {
        setSaved(false);
        setHasChanges(true);
        return false;
      }

      setSaved(true);
      setHasChanges(false);
      setTimeout(() => setSaved(false), 3000);
      return true;
    } finally {
      setSaveBusy(false);
    }
  };

  const reset = () => {
    if (!canEdit || saveBusy) return;
    if (!confirm("Xoá toàn bộ config đã lưu local?\nGiá trị sẽ fallback về .env (nếu có).")) return;
    resetAllConfig(); clearDataCache();
    window.dispatchEvent(new Event("hb:config-changed"));
    const vals = getAllConfig();
    vals[KEYS.SUPER_ADMIN_EMAIL] = DEFAULT_SUPER_ADMIN_EMAIL;
    vals[KEYS.GEMINI_API_KEY] = geminiStatusLabel();
    setValues(vals);
    setHasChanges(false); setSaved(false); setAutoMsg("");
    autoFilledRef.current = {}; autoLastSignatureRef.current = "";
  };

  const reload = async () => {
    if (!canEdit || saveBusy) return;
    const ok = await save();
    if (!ok) return;
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cấu hình"
        description="Nguồn dữ liệu, tích hợp và runtime của toàn bộ admin."
        compact
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={syncNow} disabled={!canEdit || !canSyncNow || syncBusy || saveBusy}>
              {syncBusy ? "Đang sync..." : "Đồng bộ ngay"}
            </Button>
            <Button variant="ghost" size="sm" onClick={save} disabled={!canEdit || !hasChanges || saveBusy}>
              {saveBusy ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button size="sm" onClick={reload} disabled={!canEdit || !hasChanges || saveBusy}>
              Lưu & tải lại
            </Button>
          </div>
        }
        chips={
          <>
            <Badge variant={hasChanges ? "warning" : "success"}>{hasChanges ? "Có thay đổi chưa lưu" : "Đã đồng bộ local"}</Badge>
            <Badge variant={lastSyncAt ? "info" : "warning"}>{lastSyncAt ? `Sync: ${formatSyncTime(lastSyncAt)}` : "Chưa có mốc sync"}</Badge>
          </>
        }
      />

      <MetricStrip columnsClassName="xl:grid-cols-4">
        <MetricItem label="Nhập tay" value={`${manualReady}/${MANUAL_FIELDS.length}`} meta="Các trường vận hành chính" tone="blue" />
        <MetricItem label="Tự nhận" value={`${autoReady}/${AUTO_FIELDS.length}`} meta="Tab/GID và API đã suy ra" tone="violet" />
        <MetricItem label="Điểm trọng yếu" value={`${criticalReady}/4`} meta="Sheet, Drive, WebApp URL, token" tone="amber" />
        <MetricItem label="Quyền chỉnh sửa" value={canEdit ? "Bật" : "Chỉ xem"} meta="Ghi cấu hình và sync" tone="emerald" />
      </MetricStrip>

      {!canEdit && (
        <Callout tone="warning" title="Chế độ chỉ xem">
          Tài khoản này chỉ có quyền xem cấu hình. Các thao tác lưu, reset và sync đã bị khóa.
        </Callout>
      )}

      {syncMsg ? (
        <Callout tone={String(syncMsg).startsWith("⚠") ? "warning" : "success"} title="Trạng thái đồng bộ">
          {syncMsg}
        </Callout>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Section title="Ma trận tích hợp" compact>
          <DenseInfoTable rows={systemRows} />
        </Section>

        <Section title="Runtime & chẩn đoán" compact>
          <DenseInfoTable rows={runtimeRows} />
        </Section>
      </div>

      <div className="space-y-4">
        {!canEdit && (
          <div className="hidden" />
        )}

        {/* ── Section 1: Manual ── */}
        <ConfigSection icon="📝" title="Thông tin nhập tay">
          <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-[11px] leading-4 text-blue-300">
            <b>HB_ADMIN_TOKEN</b> là tên key ở Apps Script (<span className="font-medium">Project settings &gt; Script properties</span>). Ô
            <b> GS WebApp Admin Token</b> cần dán <b>value</b> của key đó.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {MANUAL_FIELDS.map(f => (
              <Field key={f.key} field={f} value={values[f.key] || ""} onChange={update} disabled={!canEdit || saveBusy} />
            ))}
          </div>
        </ConfigSection>

        {/* ── Section 2: Auto GIDs ── */}
        <ConfigSection
          icon="🤖"
          title="Tự động nhận từ Sheet"
          badge={
            <div className="flex items-center gap-1.5">
              {autoBusy
                ? <span className="flex items-center gap-1 text-[10px] font-medium text-blue-300"><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Đang nhận...</span>
                : lastSyncAt ? <span className="text-[10px] text-slate-500">{formatSyncTime(lastSyncAt).slice(0,16)}</span> : null
              }
              <Button variant="ghost" size="sm" onClick={syncNow} disabled={!canEdit || !canSyncNow || syncBusy || saveBusy}>
                {syncBusy ? "Syncing..." : "Sync"}
              </Button>
            </div>
          }
        >
          {(autoMsg || syncMsg) && (
            <div className={`rounded-xl px-3 py-1.5 text-[10px] ${syncMsg ? (String(syncMsg).startsWith("⚠") ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300") : "bg-blue-500/10 text-blue-300"}`}>
              {syncMsg || autoMsg}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {AUTO_FIELDS.map(f => (
              <Field key={f.key} field={f} value={values[f.key] || ""} onChange={update} disabled={!canEdit || saveBusy} />
            ))}
          </div>
        </ConfigSection>

        <Section title="Hành động hệ thống" compact>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[11px] text-slate-500">
              {hasChanges ? "Có thay đổi chưa lưu" : "Không có thay đổi đang chờ"}
            </span>
            <Button variant="ghost" size="sm" onClick={async () => {
              if (!confirm("Tải cấu hình mới nhất từ Sheet? Mọi thay đổi chưa lưu sẽ bị ghi đè.")) return;
              setSaveBusy(true);
              try {
                const { syncConfigFromRemote } = await import("../../../utils/config.js");
                await syncConfigFromRemote({ force: true });
                window.location.reload();
              } catch {
                alert("Lỗi tải cấu hình");
              } finally {
                setSaveBusy(false);
              }
            }} disabled={!canEdit || saveBusy}>
              {saveBusy ? "Đang tải..." : "Tải từ Sheet"}
            </Button>
            <Button variant="ghost" size="sm" onClick={save} disabled={!canEdit || !hasChanges || saveBusy}>
              {saveBusy ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button size="sm" onClick={reload} disabled={!canEdit || !hasChanges || saveBusy}>
              {saveBusy ? "Đang lưu..." : "Lưu & tải lại"}
            </Button>
            <Button variant="danger" size="sm" onClick={reset} disabled={!canEdit || saveBusy}>
              Reset
            </Button>
            {saved && <Badge variant="success">Đã lưu</Badge>}
          </div>
        </Section>
      </div>
    </div>
  );
}
