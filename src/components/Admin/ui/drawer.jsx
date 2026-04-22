
import React from "react";
import { Button } from "./primitives.jsx";
export function Drawer({ open, onClose, side='right', width=520, title, children, footer }){
  if(!open) return null;
  const pos = side === 'right' ? { wrapper: "items-stretch justify-end", panel: `h-full w-full max-w-[${width}px] right-0` } : { wrapper: "items-stretch justify-start", panel: `h-full w-full max-w-[${width}px] left-0` };
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className={"absolute inset-0 flex " + pos.wrapper}>
        <div className={"absolute top-0 rounded-none border border-slate-800 bg-slate-900 shadow-[0_24px_60px_rgba(2,6,23,0.55)] " + pos.panel}>
          <div className="flex items-center justify-between border-b border-slate-800 p-4">
            <div className="font-semibold text-white">{title}</div>
            <Button variant="ghost" onClick={onClose}>Đóng</Button>
          </div>
          <div className="h-[calc(100vh-140px)] overflow-auto p-4 text-slate-200">{children}</div>
          {footer ? <div className="sticky bottom-0 border-t border-slate-800 bg-slate-950/90 p-4">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
