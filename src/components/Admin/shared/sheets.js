// src/components/Admin/shared/sheets.js
import { getConfig, setConfig } from "../../../utils/config.js";

export function getWebappUrl() {
  return getConfig("gs_webapp_url", "");
}

export function setGsWebappUrl(url) {
  setConfig("gs_webapp_url", url);
}

function s(v) {
  return v == null ? "" : String(v).trim();
}

function pickArray(data = {}, keys = []) {
  for (const key of keys) {
    const v = data?.[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function responseMessage(data = {}) {
  return s(data?.msg || data?.message || data?.error || data?.reason || "");
}

const UNKNOWN_ACTION_RE =
  /no action|unknown action|unknown op|invalid action|unsupported action|action not supported|unknown action\/op/i;

function isUnknownAction(data) {
  const msg = responseMessage(data).toLowerCase();
  return UNKNOWN_ACTION_RE.test(msg);
}

async function postBody(body = {}) {
  const webApp = getWebappUrl();
  if (!webApp) throw new Error("Chưa cấu hình GS WebApp URL");

  const res = await fetch(webApp, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify(body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(responseMessage(data) || `GS WebApp lỗi HTTP ${res.status}`);
  }

  return data;
}

async function call(action, payload = {}) {
  return postBody({ action, ...payload });
}

async function callOp(op, payload = {}) {
  return postBody({ op, ...payload });
}

async function callDriveOp(op, payload = {}) {
  return postBody({ action: "drive", op, ...payload });
}

async function callDriveOperation(op, payload = {}) {
  return postBody({ action: "drive", operation: op, ...payload });
}

async function callWithAliases(actions = [], payload = {}) {
  let lastErr = null;
  for (const action of actions) {
    const runners = [
      () => call(action, payload),
      () => callOp(action, payload),
      () => callDriveOp(action, payload),
      () => callDriveOperation(action, payload),
    ];

    for (const run of runners) {
      try {
        const data = await run();

        if (isUnknownAction(data)) {
          lastErr = new Error(responseMessage(data) || "Action chưa được hỗ trợ bởi GS WebApp");
          continue;
        }

        if (data?.ok === false) {
          lastErr = new Error(responseMessage(data) || `GS WebApp trả lỗi ở action: ${action}`);
          continue;
        }

        return data;
      } catch (e) {
        lastErr = e;
      }
    }
  }

  throw lastErr || new Error("GS WebApp chưa hỗ trợ action cần thiết");
}

// Basic sheet APIs
export const listSheet = (sheet) => call("list", { sheet });
export const insertToSheet = (sheet, row) => call("insert", { sheet, row });
export const updateToSheet = (sheet, row) => call("update", { sheet, row });
export const deleteFromSheet = (sheet, id) => call("delete", { sheet, id });

function normalizeFolderRow(row = {}) {
  const id = s(row.id || row.folderId || row.driveId || row.fileId);
  const name = s(row.name || row.title || row.folderName);
  const path = s(row.path || row.fullPath || row.folderPath);
  const parentId = s(row.parentId || row.parent || row.parentFolderId);
  const levelRaw = Number(row.level ?? row.depth ?? NaN);
  const level = Number.isFinite(levelRaw) ? levelRaw : null;
  const hasChildren = String(row.hasChildren ?? row.hasSubfolders ?? "").toLowerCase() === "true";
  return { id, name, path, parentId, level, hasChildren };
}

function deriveLeafFolders(rows = [], rootFolderId = "") {
  if (!rows.length) return [];

  const hasParentInfo = rows.some((x) => x.parentId);
  if (!hasParentInfo) return rows;

  const parentIds = new Set(rows.map((x) => x.parentId).filter(Boolean));
  let leaves = rows.filter((x) => !parentIds.has(x.id));

  if (rootFolderId) {
    leaves = leaves.filter((x) => x.id !== rootFolderId);
  }

  return leaves;
}

export async function listDriveFolders({ rootFolderId = "" } = {}) {
  const data = await callWithAliases(
    [
      "drive.listFolders",
      "drive_list_folders",
      "listDriveFolders",
      "list_folders",
      "listFolders",
      "driveListFolders",
      "drive.list_folders",
      "drive/list_folders",
      "driveFolders",
      "drive.folders",
      "folders.list",
    ],
    {
      rootFolderId,
      folderId: rootFolderId,
      parentId: rootFolderId,
      recursive: true,
      includeRoot: true,
      includeLeafOnly: false,
    }
  );

  const rowsRaw = pickArray(data, ["folders", "rows", "data", "items", "result"]);
  return rowsRaw.map(normalizeFolderRow).filter((x) => x.id && x.name);
}

export async function listDriveLeafFolders({ rootFolderId = "" } = {}) {
  try {
    const data = await callWithAliases(
      [
        "drive.listLeafFolders",
        "drive_list_leaf_folders",
        "listDriveLeafFolders",
        "list_leaf_folders",
        "listLeafFolders",
        "driveListLeafFolders",
        "drive.list_leaf_folders",
        "drive/list_leaf_folders",
        "leaf_folders",
      ],
      {
        rootFolderId,
        folderId: rootFolderId,
        parentId: rootFolderId,
        recursive: true,
        includeRoot: false,
        includeLeafOnly: true,
      }
    );

    const rowsRaw = pickArray(data, ["folders", "rows", "data", "items", "result"]);
    return rowsRaw.map(normalizeFolderRow).filter((x) => x.id && x.name);
  } catch {
    const all = await listDriveFolders({ rootFolderId });
    return deriveLeafFolders(all, rootFolderId);
  }
}

function normalizeHashRow(row = {}) {
  const id = s(row.id || row.fileId || row.driveId);
  const name = s(row.name || row.fileName || row.title);
  const folderId = s(row.folderId || row.parentId || row.parentFolderId);
  const path = s(row.path || row.fullPath || row.folderPath);

  let hash = s(row.hash || row.sha256 || row.sha_256 || row.md5 || row.md5Checksum || row.checksum).toLowerCase();
  hash = hash.replace(/[^a-f0-9]/g, "");

  let algo = s(row.hashAlgo || row.algo || row.algorithm).toLowerCase();
  if (!algo) {
    if (hash.length === 64) algo = "sha256";
    else if (hash.length === 32) algo = "md5";
  }

  return {
    id,
    name,
    folderId,
    path,
    hash,
    algo,
    size: Number(row.size || row.fileSize || 0) || 0,
    mimeType: s(row.mimeType || row.type),
    url: s(row.url || row.webViewLink || row.fileUrl),
  };
}

export async function listDriveFileHashes({ rootFolderId = "" } = {}) {
  const data = await callWithAliases(
    [
      "drive.listFileHashes",
      "drive_list_file_hashes",
      "listDriveFileHashes",
      "list_file_hashes",
      "listFiles",
      "list_files",
      "drive.list_files",
      "drive/list_files",
      "drive.listFiles",
      "driveListFiles",
      "drive.hashes",
      "drive.listFilesWithHash",
    ],
    {
      rootFolderId,
      folderId: rootFolderId,
      parentId: rootFolderId,
      recursive: true,
      includeHash: true,
      includeMd5: true,
      includeSha256: true,
    }
  );

  const rowsRaw = pickArray(data, ["files", "rows", "data", "items", "result"]);
  return rowsRaw
    .map(normalizeHashRow)
    .filter((x) => x.id && x.hash && (x.hash.length === 64 || x.hash.length === 32));
}

export async function uploadDriveFile({
  folderId = "",
  fileName = "",
  mimeType = "image/jpeg",
  base64 = "",
  category = "",
  tags = "",
  rootFolderId = "",
} = {}) {
  if (!folderId) throw new Error("Thiếu folderId upload");
  if (!base64) throw new Error("Thiếu nội dung file");

  const data = await callWithAliases(
    [
      "drive.uploadFile",
      "drive_upload_file",
      "uploadDriveFile",
      "upload_file",
      "drive.upload_file",
      "drive/upload_file",
      "uploadFile",
      "driveUpload",
      "drive.uploadImage",
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
      tags,
    }
  );

  return {
    id: s(data?.id || data?.fileId || data?.driveId),
    name: s(data?.name || data?.fileName || fileName),
    url: s(data?.url || data?.webViewLink || data?.fileUrl || data?.downloadUrl || data?.imageUrl),
    raw: data,
  };
}
