// pid = khóa duy nhất toàn cục cho sản phẩm
// Ưu tiên các trường đã duy nhất nếu có, cuối cùng fallback category:id
export const pidOf = (p = {}) =>
  String(p.uid || p.code || p.slug || `${p.category}:${p.id}`);
