import { useEffect } from "react";

export default function FilterSheet({ open, title = "Bộ lọc", onClose, children }) {
  // L8: lock body scroll khi mở filter panel
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev || ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Mobile: thẻ nổi ở GÓC PHẢI-DƯỚI; >=md: drawer bên phải */}
      <div
        className="
          absolute right-3 top-16 w-[80vw] h-[60vh] rounded-2xl shadow-2xl bg-white
          flex flex-col overflow-hidden
          md:bottom-0 md:top-0 md:right-0 md:w-full md:max-w-md md:h-[100dvh] md:rounded-none md:shadow-xl
        "
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded border px-3 py-1 text-sm">Đóng</button>
        </div>
        <div className="flex-1 overflow-auto p-3">{children}</div>
      </div>
    </div>
  );
}
