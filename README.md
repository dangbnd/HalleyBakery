# HalleyBakery

## Local dev

1. `npm install`
2. `npm run dev`

## Runtime config

- App ưu tiên config lưu trong `localStorage` (Admin > Cấu hình).
- Nếu chưa có local config, app fallback sang `.env` (`VITE_*`).
- Với `sheet_id` và `drive_folder_id`, có thể dán ID hoặc full URL.
