import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { renameSync } from "fs";
import { resolve } from "path";

// Post-build: rename index.html → _app.html
// Để Vercel không serve index.html tĩnh, cho phép api/og.js handle root path
function renameIndexPlugin() {
  return {
    name: "rename-index-html",
    closeBundle() {
      try {
        const dist = resolve("dist");
        renameSync(resolve(dist, "index.html"), resolve(dist, "_app.html"));
        console.log("✅ Renamed dist/index.html → dist/_app.html");
      } catch (e) {
        console.warn("⚠️ Could not rename index.html:", e.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), renameIndexPlugin()],
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ["preview.halleybakery.io.vn", "halleybakery.io.vn"],
  },
});
