import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: true,
    port: 4173,
    // an toàn: chỉ cho phép domain bạn dùng
    allowedHosts: ["preview.halleybakery.io.vn", "halleybakery.io.vn"],
    // hoặc mở rộng cho mọi host (ít an toàn):
    // allowedHosts: true,
  },
});
