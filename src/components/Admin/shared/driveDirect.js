const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

let gisLoadPromise = null;

function s(v) {
  return v == null ? "" : String(v).trim();
}

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    return s(data?.error?.message || data?.error_description || data?.error);
  } catch {
    try {
      const text = await res.text();
      return s(text);
    } catch {
      return "";
    }
  }
}

function ensureGisLoaded() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Trình duyệt không khả dụng"));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Không tải được Google Identity Services")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Không tải được Google Identity Services"));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

export function isTokenExpired(expiresAtMs = 0, bufferMs = 30_000) {
  return !Number(expiresAtMs) || Date.now() + bufferMs >= Number(expiresAtMs);
}

export async function requestGoogleDriveToken({ clientId = "", prompt = "consent" } = {}) {
  const normalizedClientId = s(clientId);
  if (!normalizedClientId) {
    throw new Error("Thiếu Google OAuth Client ID");
  }

  await ensureGisLoaded();

  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("Hết thời gian chờ đăng nhập Google"));
    }, 60_000);

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: normalizedClientId,
      scope: DRIVE_SCOPE,
      prompt,
      callback: (resp) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);

        if (resp?.error) {
          reject(new Error(s(resp.error_description || resp.error || "Không lấy được access token")));
          return;
        }

        const accessToken = s(resp?.access_token);
        if (!accessToken) {
          reject(new Error("Không lấy được access token"));
          return;
        }

        const expiresIn = Number(resp?.expires_in || 3600);
        resolve({
          accessToken,
          expiresIn,
          expiresAt: Date.now() + expiresIn * 1000,
          scope: s(resp?.scope),
          tokenType: s(resp?.token_type || "Bearer"),
        });
      },
    });

    tokenClient.requestAccessToken({ prompt });
  });
}

export async function uploadFileDirectToDrive({
  accessToken = "",
  folderId = "",
  file,
  fileName = "",
  mimeType = "",
} = {}) {
  const token = s(accessToken);
  const targetFolderId = s(folderId);
  if (!token) throw new Error("Thiếu access token Google Drive");
  if (!targetFolderId) throw new Error("Thiếu folder đích");
  if (!(file instanceof File)) throw new Error("File upload không hợp lệ");

  const finalMimeType = s(mimeType) || s(file.type) || "application/octet-stream";
  const finalName = s(fileName) || s(file.name) || `upload_${Date.now()}`;

  const initUrl =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink,mimeType,size";

  const initRes = await fetch(initUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": finalMimeType,
      "X-Upload-Content-Length": String(file.size || 0),
    },
    body: JSON.stringify({
      name: finalName,
      parents: [targetFolderId],
    }),
  });

  if (!initRes.ok) {
    const msg = await readErrorMessage(initRes);
    throw new Error(msg || `Không khởi tạo upload Drive (HTTP ${initRes.status})`);
  }

  const uploadUrl = s(initRes.headers.get("Location") || initRes.headers.get("location"));
  if (!uploadUrl) throw new Error("Google Drive không trả URL upload");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": finalMimeType,
    },
    body: file,
  });

  if (!putRes.ok) {
    const msg = await readErrorMessage(putRes);
    throw new Error(msg || `Upload file lên Drive thất bại (HTTP ${putRes.status})`);
  }

  const data = await putRes.json().catch(() => ({}));
  const id = s(data?.id);
  const fallbackView = id ? `https://drive.google.com/file/d/${id}/view` : "";

  return {
    id,
    name: s(data?.name || finalName),
    url: s(data?.webViewLink || fallbackView),
    downloadUrl: s(data?.webContentLink),
    mimeType: s(data?.mimeType || finalMimeType),
    size: Number(data?.size || file.size || 0),
    raw: data,
  };
}

/* ===== Save/Load drive hashes to Google Sheet tab "drive_hashes" ===== */

const HASH_TAB_NAME = "drive_hashes";
const HASH_HEADERS = ["hash", "algo", "name", "fileId", "folderId", "folderName", "size", "mimeType"];

/**
 * Lưu danh sách hash lên tab "drive_hashes" trong Google Sheet.
 * Dùng Google Sheets API v4 (OAuth scope: drive).
 */
export async function saveHashesToSheet({ accessToken, sheetId, hashes = [] }) {
  const token = s(accessToken);
  if (!token) throw new Error("Thiếu access token");
  if (!sheetId) throw new Error("Thiếu Sheet ID");

  // 1. Tạo tab nếu chưa có
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaRes.ok) throw new Error(`Không đọc được Sheet (HTTP ${metaRes.status})`);
  const metaData = await metaRes.json();
  const tabs = (metaData?.sheets || []).map(sh => s(sh?.properties?.title));

  if (!tabs.includes(HASH_TAB_NAME)) {
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: HASH_TAB_NAME } } }],
        }),
      }
    );
    if (!addRes.ok) {
      const errMsg = await readErrorMessage(addRes);
      throw new Error(`Không tạo được tab ${HASH_TAB_NAME}: ${errMsg}`);
    }
  }

  // 2. Xóa dữ liệu cũ + ghi mới
  const range = `${HASH_TAB_NAME}!A1`;
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(HASH_TAB_NAME)}:clear`;
  await fetch(clearUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });

  // 3. Ghi header + data
  const rows = [HASH_HEADERS];
  for (const h of hashes) {
    rows.push(HASH_HEADERS.map(col => s(h[col] ?? "")));
  }
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const writeRes = await fetch(writeUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: rows }),
  });
  if (!writeRes.ok) {
    const errMsg = await readErrorMessage(writeRes);
    throw new Error(`Không ghi được hash lên Sheet: ${errMsg}`);
  }

  return { ok: true, count: hashes.length };
}

/**
 * Tải danh sách hash từ tab "drive_hashes" trên Google Sheet (đọc public CSV, không cần token).
 */
export async function loadHashesFromSheet({ sheetId }) {
  if (!sheetId) return [];

  // Lấy gid của tab "drive_hashes"
  // Dùng cách tải toàn bộ sheet metadata nếu có token, hoặc thử CSV với gid đoán
  // Approach: thử fetch qua gviz query
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(HASH_TAB_NAME)}`;
  const res = await fetch(url);
  if (!res.ok) return []; // tab chưa tồn tại → trả rỗng

  const txt = await res.text();
  try {
    const json = JSON.parse(txt.substring(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    const cols = (json.table?.cols || []).map(c => s(c.label || "").toLowerCase());
    return (json.table?.rows || []).map(r => {
      const obj = {};
      (r.c || []).forEach((cell, i) => {
        if (cols[i]) obj[cols[i]] = cell?.v != null ? String(cell.v) : "";
      });
      return obj;
    }).filter(h => h.hash); // chỉ giữ dòng có hash
  } catch {
    return [];
  }
}
