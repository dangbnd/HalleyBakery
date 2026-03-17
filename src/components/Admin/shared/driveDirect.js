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
