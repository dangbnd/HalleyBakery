import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import App from "./App.jsx";
import "./index.css";
import ErrorBoundary from "./components/system/ErrorBoundary.jsx";
import { LS, readLS } from "./utils.js";

// Lazy load Admin modules — chỉ tải khi cần
const Login = lazy(() => import("./components/Admin/Login.jsx"));
const AdminIndex = lazy(() => import("./components/Admin/index.jsx"));

function Root() {
  const path = window.location.pathname || "/";
  const inAdmin = path === "/admin" || path.startsWith("/admin/");
  const user = readLS(LS.AUTH, null);
  if (inAdmin) {
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
