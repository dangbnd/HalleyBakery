import { useEffect, useState } from "react";
import {
  getTrackingConsent,
  setTrackingConsent,
  TRACKING_CONSENT_EVENT,
} from "../services/telemetry.js";

export default function TrackingConsent() {
  const [consent, setConsent] = useState(() => getTrackingConsent());
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const open = () => {
      setConsent(getTrackingConsent());
      setDetailsOpen(true);
    };
    window.addEventListener("hb:open-privacy-settings", open);
    return () => window.removeEventListener("hb:open-privacy-settings", open);
  }, []);

  const choose = (value) => {
    setTrackingConsent(value);
    setConsent(value);
    setDetailsOpen(false);
  };

  if (consent && !detailsOpen) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[110] mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
      <div className="text-sm font-semibold text-gray-900">Quyền riêng tư</div>
      <p className="mt-1 text-sm leading-5 text-gray-600">
        Halley Bakery chỉ ghi nhận thao tác xem, tìm kiếm và liên hệ để cải thiện danh mục.
        Không tự xin GPS. Bạn có thể từ chối mà vẫn xem đầy đủ sản phẩm.
      </p>
      {detailsOpen && (
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs leading-5 text-gray-600">
          Dữ liệu gồm ID ẩn danh, phiên truy cập, trang, từ khóa, mẫu bánh đã xem và thông tin thiết bị cơ bản.
          Yêu cầu tư vấn chỉ gửi khi bạn chủ động điền form. Dữ liệu được gửi qua API Halley Bakery và lưu trong hệ thống quản trị.
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Đồng ý
        </button>
        <button
          type="button"
          onClick={() => choose("declined")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Từ chối
        </button>
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          className="ml-auto text-sm text-gray-500 hover:text-gray-900"
        >
          {detailsOpen ? "Thu gọn" : "Xem chi tiết"}
        </button>
      </div>
    </div>
  );
}

export { TRACKING_CONSENT_EVENT };
