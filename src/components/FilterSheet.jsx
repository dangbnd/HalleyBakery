import { useEffect, useRef } from "react";

export default function FilterSheet({ open, title = "Bộ lọc", onClose, children }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // L8: lock body scroll khi mở filter panel
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    const focusId = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCloseRef.current?.();
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusId);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev || "";
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Mobile: thẻ nổi ở GÓC PHẢI-DƯỚI; >=md: drawer bên phải */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="
          absolute right-3 top-16 w-[80vw] h-[60vh] rounded-2xl shadow-2xl bg-white
          flex flex-col overflow-hidden
          md:bottom-0 md:top-0 md:right-0 md:w-full md:max-w-md md:h-[100dvh] md:rounded-none md:shadow-xl
        "
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button ref={closeButtonRef} onClick={onClose} className="rounded border px-3 py-1 text-sm">Đóng</button>
        </div>
        <div className="flex-1 overflow-auto p-3">{children}</div>
      </div>
    </div>
  );
}
