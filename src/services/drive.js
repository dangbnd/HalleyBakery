// src/services/drive.js
const API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function listPage({ q, pageToken, apiKey }) {
  const params = new URLSearchParams({
    key: apiKey,
    q,
    pageSize: "1000",
    fields: "nextPageToken,files(id,name,mimeType,parents,modifiedTime)",
    orderBy: "name",
    ...(pageToken ? { pageToken } : {})
  });
  const r = await fetch(`${API}?${params}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Drive list failed: ${r.status}`);
  return r.json();
}

/** Liệt kê ảnh trong folder và mọi subfolder (BFS) */
export async function fetchAllDriveImagesDeep({ folderId, apiKey }) {
  if (!folderId || !apiKey) return [];
  const queue = [folderId];
  const images = [];
  while (queue.length) {
    const pid = queue.shift();
    let pageToken;
    do {
      const q = `'${pid}' in parents and trashed=false`;
      const { files = [], nextPageToken } = await listPage({ q, pageToken, apiKey });
      pageToken = nextPageToken;
      for (const f of files) {
        if (f.mimeType === FOLDER_MIME) queue.push(f.id);
        else if (f.mimeType?.startsWith("image/")) images.push(f);
      }
    } while (pageToken);
  }
  return images;
}

export function buildImageMap(files = []) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .trim();

  const map = new Map();
  for (const f of files) {
    const key = norm(f.name);
    const ver = Math.floor(new Date(f.modifiedTime).getTime() / 1000);
    const url = `https://drive.google.com/thumbnail?id=${f.id}&sz=w2048&v=${ver}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(url);
  }
  return { map, norm };
}
