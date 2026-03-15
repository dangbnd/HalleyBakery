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
  if (!WEBAPP) throw new Error("Chưa cấu hình GS WebApp URL");

  const res = await fetch(WEBAPP, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`GS error ${res.status}`);
  return res.json();
}

// API đơn giản
export const listSheet = (sheet) => call("list", { sheet });
export const insertToSheet = (sheet, row) => call("insert", { sheet, row });
export const updateToSheet = (sheet, row) => call("update", { sheet, row });
export const deleteFromSheet = (sheet, id) => call("delete", { sheet, id });

// Nếu WebApp của bạn dùng GET thay vì POST, đổi hàm call() cho phù hợp.
