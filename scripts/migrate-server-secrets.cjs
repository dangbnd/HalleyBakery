const crypto = require("crypto");
const fs = require("fs");

const envFile = ".env.local";
const FETCH_TIMEOUT_MS = 10_000;

function parseEnv(source = "") {
  const values = {};
  for (const line of String(source).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function parseCsv(source = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function configMap(csv = "") {
  const out = {};
  for (const row of parseCsv(csv.replace(/^\uFEFF/, ""))) {
    const key = normalizeKey(row[0]);
    if (key && !Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = String(row[1] || "").trim();
    }
  }
  return out;
}

function first(config, aliases) {
  for (const alias of aliases) {
    const value = String(config[normalizeKey(alias)] || "").trim();
    if (value) return value;
  }
  return "";
}

function quote(value = "") {
  return JSON.stringify(String(value));
}

function updateEnv(source, updates) {
  const lines = String(source).replace(/\s+$/, "").split(/\r?\n/);
  const touched = new Set();
  const next = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !Object.prototype.hasOwnProperty.call(updates, match[1])) return line;
    touched.add(match[1]);
    return `${match[1]}=${quote(updates[match[1]])}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!touched.has(key) && value) next.push(`${key}=${quote(value)}`);
  }
  return `${next.filter(Boolean).join("\n")}\n`;
}

function sheetGidsFromHtml(html = "") {
  const gids = new Set();
  const pattern = /\[(\d+),0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)\\"/g;
  let match;
  while ((match = pattern.exec(String(html)))) gids.add(String(match[2]));
  return gids;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const source = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const env = parseEnv(source);
  const sheetId = env.VITE_SHEET_ID;
  const gid = env.VITE_SHEET_GID_CONFIG;
  if (!sheetId || !gid) throw new Error("Missing VITE_SHEET_ID or VITE_SHEET_GID_CONFIG");

  const response = await fetchWithTimeout(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`
  );
  if (!response.ok) throw new Error(`Config Sheet HTTP ${response.status}`);
  const config = configMap(await response.text());
  const editResponse = await fetchWithTimeout(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`
  );
  const validGids = editResponse.ok ? sheetGidsFromHtml(await editResponse.text()) : new Set();
  const updates = {
    ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET || crypto.randomBytes(48).toString("base64url"),
    ADMIN_SUPER_USERNAME: env.ADMIN_SUPER_USERNAME || "halley",
    ADMIN_SUPER_PASSWORD: env.ADMIN_SUPER_PASSWORD || crypto.randomBytes(24).toString("base64url"),
    ADMIN_SUPER_NAME: env.ADMIN_SUPER_NAME || "Super Admin",
    GS_WEBAPP_URL: env.GS_WEBAPP_URL || first(config, ["gs_webapp_url", "webapp_url", "admin_webapp_url"]),
    GS_WEBAPP_TOKEN: env.GS_WEBAPP_TOKEN || first(config, ["gs_webapp_token", "hb_admin_token", "admin_token"]),
    TRACKING_SHEET_ID: env.TRACKING_SHEET_ID || first(config, ["tracking_sheet_id", "tracking_spreadsheet_id"]),
    GEMINI_API_KEYS: env.GEMINI_API_KEYS || first(config, ["gemini_api_keys", "gemini_keys", "gemini_api_key"]),
    IP2LOCATION_API_KEY: env.IP2LOCATION_API_KEY || first(config, ["ip2location_api_key", "ip2location_key"]),
    SUPER_ADMIN_EMAIL: env.SUPER_ADMIN_EMAIL || first(config, ["super_admin_email", "google_super_admin_email"]),
  };
  if (validGids.size) {
    for (const [key, value] of Object.entries(env)) {
      if (!key.startsWith("VITE_SHEET_GID_") || key === "VITE_SHEET_GID_CONFIG") continue;
      if (value && !validGids.has(String(value))) updates[key] = "";
    }
  }
  fs.writeFileSync(envFile, updateEnv(source, updates), { mode: 0o600 });
  const copiedKeys = Object.entries(updates)
    .filter(([, value]) => value)
    .map(([key]) => key);
  console.log(`Server values copied to ${envFile}: ${copiedKeys.join(", ")}`);
  console.warn(
    "Google Sheet and deployed environment were not modified. Remove secret rows, rotate exposed credentials, then update deployment environment before deploy."
  );
})().catch((error) => {
  console.error(`Secret migration failed: ${error.message}`);
  process.exit(1);
});
