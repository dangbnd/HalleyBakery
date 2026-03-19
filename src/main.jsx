import { createRoot } from "react-dom/client";
import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App.jsx";
import "./index.css";
import ErrorBoundary from "./components/system/ErrorBoundary.jsx";
import LoadingSkeleton from "./components/LoadingSkeleton.jsx";
import { LS, readLS } from "./utils.js";
import { syncConfigFromRemote } from "./utils/config.js";

const Login = lazy(() => import("./components/Admin/Login.jsx"));
const AdminIndex = lazy(() => import("./components/Admin/index.jsx"));

function FullscreenLoading() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <LoadingSkeleton count={8} message="Ban cho chut chut nhe..." />
    </div>
  );
}

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isAdminDomain = window.location.hostname.startsWith("admin.");
      const timeoutMs = isAdminDomain ? 6000 : 400;
      try {
        await Promise.race([
          syncConfigFromRemote({ force: true }),
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      } catch {}
      if (!cancelled) setReady(true);
      if (!cancelled && isAdminDomain) {
        setTimeout(() => {
          syncConfigFromRemote({ force: true }).catch(() => {});
        }, 3000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <FullscreenLoading />;

  const path = window.location.pathname || "/";
  const hostname = window.location.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const isAdminDomain = hostname.startsWith("admin.") || hostname.includes("-admin");
  const isAdminPath = path === "/admin" || path.startsWith("/admin/");

  const isSystemAdminMode = isAdminDomain || isAdminPath;
  const user = readLS(LS.AUTH, null);

  if (!isLocal && !isAdminDomain && isAdminPath) {
    window.location.replace("https://admin.halleybakery.io.vn");
    return null;
  }

  if (!isLocal && isAdminDomain && isAdminPath) {
    window.location.replace("/");
    return null;
  }

  if (
    !isSystemAdminMode &&
    path === "/" &&
    user &&
    window.matchMedia("(display-mode: standalone)").matches &&
    !sessionStorage.getItem("visited_home")
  ) {
    sessionStorage.setItem("visited_home", "1");
    window.location.replace(isLocal ? "/admin" : "https://admin.halleybakery.io.vn");
    return null;
  }

  if (isSystemAdminMode) {
    return (
      <Suspense fallback={<FullscreenLoading />}>
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
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
