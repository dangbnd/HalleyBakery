// src/components/Admin/shared/sheets.js
import { getConfig, setConfig } from "../../../utils/config.js";

export function getWebappUrl() {
  return getConfig("gs_webapp_url", "");
}

export function setGsWebappUrl(url) {
  setConfig("gs_webapp_url", url);
}

async function call(action, payload = {}) {
  const WEBAPP = getWebappUrl();
  if (!WEBAPP) throw new Error("Chua cau hinh GS WebApp URL");

  const res = await fetch(WEBAPP, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`GS error ${res.status}`);
  return res.json();
}

// Basic sheet APIs
export const listSheet = (sheet) => call("list", { sheet });
export const insertToSheet = (sheet, row) => call("insert", { sheet, row });
export const updateToSheet = (sheet, row) => call("update", { sheet, row });
export const deleteFromSheet = (sheet, id) => call("delete", { sheet, id });

function isUnknownAction(data) {
  const msg = String(data?.msg || data?.message || data?.error || "").toLowerCase();
  return /no action|unknown action|invalid action|unsupported action/.test(msg);
}

async function callWithAliases(actions = [], payload = {}) {
  let lastErr = null;
  for (const action of actions) {
    try {
      const data = await call(action, payload);
      if (isUnknownAction(data)) {
        lastErr = new Error(data?.msg || "Action not supported by GS WebApp");
        continue;
      }
      return data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Action not supported by GS WebApp");
}

function normalizeFolderRow(row = {}) {
  const id = String(row.id || row.folderId || row.driveId || row.fileId || "").trim();
  const name = String(row.name || row.title || row.folderName || "").trim();
  const path = String(row.path || row.fullPath || row.folderPath || "").trim();
  const parentId = String(row.parentId || row.parent || "").trim();
  return { id, name, path, parentId };
}

export async function listDriveFolders({ rootFolderId = "" } = {}) {
  const data = await callWithAliases(
    [
      "drive.listFolders",
      "drive_list_folders",
      "listDriveFolders",
      "list_folders",
      "driveFolders",
    ],
    {
      rootFolderId,
      folderId: rootFolderId,
      parentId: rootFolderId,
      includeRoot: true,
    }
  );

  const rowsRaw = Array.isArray(data?.folders)
    ? data.folders
    : Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.items)
          ? data.items
          : [];

  return rowsRaw.map(normalizeFolderRow).filter((x) => x.id && x.name);
}

export async function uploadDriveFile({
  folderId = "",
  fileName = "",
  mimeType = "image/jpeg",
  base64 = "",
  category = "",
  rootFolderId = "",
} = {}) {
  if (!folderId) throw new Error("Missing folderId");
  if (!base64) throw new Error("Missing file content");

  const data = await callWithAliases(
    [
      "drive.uploadFile",
      "drive_upload_file",
      "uploadDriveFile",
      "upload_file",
      "driveUpload",
    ],
    {
      folderId,
      rootFolderId,
      fileName,
      mimeType,
      base64,
      data: base64,
      contentBase64: base64,
      category,
    }
  );

  return {
    id: String(data?.id || data?.fileId || data?.driveId || "").trim(),
    name: String(data?.name || data?.fileName || fileName || "").trim(),
    url: String(
      data?.url ||
      data?.webViewLink ||
      data?.fileUrl ||
      data?.downloadUrl ||
      data?.imageUrl ||
      ""
    ).trim(),
    raw: data,
  };
}
