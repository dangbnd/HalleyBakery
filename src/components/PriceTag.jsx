import React from "react";
export const VND = new Intl.NumberFormat("vi-VN", { style:"currency", currency:"VND", maximumFractionDigits:0 });
export function PriceTag({ value, className = "text-rose-600 text-sm" }) {
  const ok = Number.isFinite(Number(value)) && Number(value) > 0;
  return <span className={className}>{ok ? VND.format(Number(value)) : "Liên hệ"}</span>;
}
