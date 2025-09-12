// src/components/Admin/shared/sheets.js
export const GS = { WEBAPP_KEY: "https://script.google.com/macros/s/AKfycbzAzNNjpUS7xXTEpO1MNDSe5LOVVOU9RemBp89qbBnytc5Dm5Hdwq2u2aAfpVk1gEU15Q/exec" };

export function getWebappUrl() {
  const envUrl =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_GS_WEBAPP_URL;
  const lsUrl =
    typeof window !== "undefined" &&
    window.localStorage &&
    window.localStorage.getItem(GS.WEBAPP_KEY);
  return envUrl || lsUrl || "";
}

export function setGsWebappUrl(url) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(GS.WEBAPP_KEY, url);
    }
  } catch {}
}

async function call(action, payload = {}) {
  const WEBAPP = getWebappUrl();
  if (!WEBAPP) throw new Error("Chưa cấu hình GS WebApp URL");

  const res = await fetch(WEBAPP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`GS error ${res.status}`);
  return res.json();
}

// API đơn giản
export const listSheet       = (sheet)            => call("list",   { sheet });
export const insertToSheet   = (sheet, row)       => call("insert", { sheet, row });
export const updateToSheet   = (sheet, row)       => call("update", { sheet, row });
export const deleteFromSheet = (sheet, id)        => call("delete", { sheet, id });

// Nếu WebApp của bạn dùng GET thay vì POST, đổi hàm call() cho phù hợp.
