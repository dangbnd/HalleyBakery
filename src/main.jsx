import { createRoot } from "react-dom/client";
import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App.jsx";
import "./index.css";
import ErrorBoundary from "./components/system/ErrorBoundary.jsx";
import { LS, readLS } from "./utils.js";
import { syncConfigFromRemote } from "./utils/config.js";

// Lazy load Admin modules — chỉ tải khi cần
const Login = lazy(() => import("./components/Admin/Login.jsx"));
const AdminIndex = lazy(() => import("./components/Admin/index.jsx"));

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.race([
          syncConfigFromRemote({ force: true }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch {}
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const run = (force = false) => {
      syncConfigFromRemote({ force }).catch(() => {});
    };
    const timer = setInterval(() => run(true), 60 * 1000);
    const onFocus = () => run(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") run(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready]);

  if (!ready) {
    return <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-500">Đang tải cấu hình...</div>;
  }

  const path = window.location.pathname || "/";
  const hostname = window.location.hostname;
  
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const isAdminDomain = hostname.startsWith("admin.") || hostname.includes("-admin");
  const isAdminPath = path === "/admin" || path.startsWith("/admin/");

  const isSystemAdminMode = isAdminDomain || isAdminPath;
  const user = readLS(LS.AUTH, null);

  // 1. Chặn xem admin trên web chính (chỉ áp dụng trên mạng, bỏ qua local dev)
  if (!isLocal && !isAdminDomain && isAdminPath) {
    window.location.replace("https://admin.halleybakery.io.vn");
    return null;
  }

  // 2. Tự dọn dẹp URL trên admin (giấu đoạn /admin cho sạch)
  if (!isLocal && isAdminDomain && isAdminPath) {
    window.location.replace("/");
    return null;
  }

  // 3. PWA tự động vào admin cho localhost/dev (tránh load lại trang web chính)
  if (!isSystemAdminMode && path === "/" && user && window.matchMedia("(display-mode: standalone)").matches && !sessionStorage.getItem("visited_home")) {
    sessionStorage.setItem("visited_home", "1");
    window.location.replace(isLocal ? "/admin" : "https://admin.halleybakery.io.vn");
    return null;
  }

  if (isSystemAdminMode) {
    return (
      <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><p>Đang tải...</p></div>}>
        {user ? <AdminIndex /> : <Login />}
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { });
  });
}
