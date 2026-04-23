const MAX_FEEDBACK_IMAGES = 80;

function s(value) {
  return value == null ? "" : String(value).trim();
}

export function extractDriveFileId(input = "") {
  const raw = s(input);
  if (!raw) return "";
  const folderMatch = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return "";
}

export function buildDriveImageUrl(fileId = "", width = 1600) {
  const id = extractDriveFileId(fileId);
  if (!id) return "";
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${Math.max(240, Number(width) || 1600)}`;
}

export function normalizeFeedbackImageRecord(record = {}) {
  const id = s(record?.id || record?.fileId || record?.driveId || extractDriveFileId(record?.image || record?.url));
  const image = s(record?.image || buildDriveImageUrl(id));
  if (!image) return null;

  return {
    id: id || `feedback_${Math.random().toString(36).slice(2, 10)}`,
    image,
    url: s(record?.url || (id ? `https://drive.google.com/file/d/${id}/view` : "")),
    name: s(record?.name || record?.title || "Feedback khach hang"),
    uploadedAt: s(record?.uploadedAt || record?.createdAt || new Date().toISOString()),
  };
}

export function parseFeedbackImagesConfig(raw = "") {
  const text = s(raw);
  if (!text) return [];

  let parsed = [];
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed)) return [];

  const seen = new Set();
  const out = [];
  for (const item of parsed) {
    const normalized = normalizeFeedbackImageRecord(item);
    const key = s(normalized?.id || normalized?.image);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function serializeFeedbackImagesConfig(items = []) {
  return JSON.stringify(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeFeedbackImageRecord(item))
      .filter(Boolean)
      .slice(0, MAX_FEEDBACK_IMAGES)
  );
}

export function upsertFeedbackImageRecord(items = [], nextRecord = {}) {
  const normalizedNext = normalizeFeedbackImageRecord(nextRecord);
  if (!normalizedNext) return parseFeedbackImagesConfig(serializeFeedbackImagesConfig(items));

  const current = Array.isArray(items) ? items : [];
  const merged = [normalizedNext, ...current]
    .map((item) => normalizeFeedbackImageRecord(item))
    .filter(Boolean);

  const seen = new Set();
  return merged.filter((item) => {
    const key = s(item.id || item.image);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_FEEDBACK_IMAGES);
}
