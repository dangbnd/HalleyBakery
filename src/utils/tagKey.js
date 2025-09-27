// src/utils/tagKey.js
export function tagKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toTagArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v || "")
    .split(/[|,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}