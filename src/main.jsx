import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import ErrorBoundary from "./components/system/ErrorBoundary.jsx";
import Login from "./components/Admin/Login.jsx";
import { LS, readLS } from "./utils.js";

function Root() {
  const path = window.location.pathname || "/";
  const inAdmin = path === "/admin" || path.startsWith("/admin/");
  const user = readLS(LS.AUTH, null);
  if (inAdmin && !user) return <Login />;
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>
);

if (typeof window !== "undefined") window.__ENV = { ...import.meta.env };

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
