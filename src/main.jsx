import { createRoot } from "react-dom/client";
import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App.jsx";
import "./index.css";
import ErrorBoundary from "./components/system/ErrorBoundary.jsx";
import LoadingSkeleton from "./components/LoadingSkeleton.jsx";
import TrackingConsent from "./components/TrackingConsent.jsx";
import { LS, removeLS, writeLS } from "./utils.js";
import { clearLegacyClientSecrets, syncConfigFromRemote } from "./utils/config.js";

clearLegacyClientSecrets();

const Login = lazy(() => import("./components/Admin/Login.jsx"));
const AdminIndex = lazy(() => import("./components/Admin/index.jsx"));

function FullscreenLoading() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <LoadingSkeleton count={8} message="Bạn chờ chút chút nhé..." />
    </div>
  );
}

function isSystemAdminRuntime() {
  const hostname = window.location.hostname;
  const path = window.location.pathname || "/";
  return (
    hostname.startsWith("admin.") ||
    hostname.includes("-admin") ||
    path === "/admin" ||
    path.startsWith("/admin/")
  );
}

function Root() {
  const [ready, setReady] = useState(() => !isSystemAdminRuntime());
  const [sessionUser, setSessionUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isAdminDomain = window.location.hostname.startsWith("admin.");
      const path = window.location.pathname || "/";
      const isAdminPath = path === "/admin" || path.startsWith("/admin/");
      const isSystemAdminMode = isAdminDomain || isAdminPath;
      const timeoutMs = isAdminDomain ? 6000 : 3000;
      const params = new URLSearchParams(window.location.search || "");
      const forceConfigSync =
        params.has("hb_config_sync") || params.has("hb_refresh_config");

      if (!isSystemAdminMode) {
        syncConfigFromRemote({ force: forceConfigSync }).catch(() => {});
        return;
      }

      try {
        await Promise.race([
          syncConfigFromRemote({ force: forceConfigSync }),
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      } catch {}
      try {
        const res = await fetch("/api/admin-auth", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.user) {
          writeLS(LS.AUTH, data.user);
          if (!cancelled) setSessionUser(data.user);
        } else {
          removeLS(LS.AUTH);
        }
      } catch {
        removeLS(LS.AUTH);
      }
      if (!cancelled) setReady(true);
      if (!cancelled && isAdminDomain) {
        setTimeout(() => {
          syncConfigFromRemote().catch(() => {});
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
  const user = sessionUser;

  if (!isLocal && !isAdminDomain && isAdminPath) {
    window.location.replace("https://admin.halleybakery.io.vn");
    return null;
  }

  if (!isLocal && isAdminDomain && isAdminPath) {
    window.location.replace("/");
    return null;
  }

  if (isSystemAdminMode) {
    return (
      <Suspense fallback={<FullscreenLoading />}>
        {user ? <AdminIndex /> : <Login />}
      </Suspense>
    );
  }

  return (
    <>
      <App />
      <TrackingConsent />
    </>
  );
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
