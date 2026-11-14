// src/utils/tagKey.js
export function tagKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const TAG_LABEL_FIXES = new Map([
  ["basicbasic", "Basic"],
  ["1 tuoituoi", "1 tuổi"],
  ["phu nunu", "Phụ nữ"],
  ["sieu nhannhan", "Siêu nhân"],
  ["de thuong", "Dễ thương"],
]);

export function normalizeTagLabel(value = "") {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const folded = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  return TAG_LABEL_FIXES.get(folded) || raw;
}

export function toTagArray(v) {
  const values = Array.isArray(v) ? v : String(v || "").split(/[|,;\n]+/);
  return values
    .map(normalizeTagLabel)
    .filter(Boolean);
}
