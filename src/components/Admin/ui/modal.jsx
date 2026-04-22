import React from "react";
import { Button } from "./primitives.jsx";

export function Modal({
  open,
  onClose,
  title,
  description = "",
  children,
  footer = null,
  widthClass = "max-w-3xl",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`w-full ${widthClass} overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-[0_32px_80px_rgba(2,6,23,0.6)]`}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-white">{title}</div>
              {description ? <div className="mt-1 text-sm text-slate-400">{description}</div> : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
          {footer ? <div className="border-t border-slate-800 bg-slate-950/65 px-6 py-4">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
