
import React from "react";
import { Button } from "./primitives.jsx";
export function Drawer({ open, onClose, side='right', width=520, title, children, footer }){
  if(!open) return null;
  const pos = side === 'right' ? { wrapper: "items-stretch justify-end", panel: `h-full w-full max-w-[${width}px] right-0` } : { wrapper: "items-stretch justify-start", panel: `h-full w-full max-w-[${width}px] left-0` };
  return (<div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={onClose} /><div className={"absolute inset-0 flex " + pos.wrapper}><div className={"absolute top-0 bg-white border shadow-xl rounded-none " + pos.panel}><div className="flex items-center justify-between p-4 border-b"><div className="font-semibold">{title}</div><Button variant="ghost" onClick={onClose}>Đóng</Button></div><div className="p-4 overflow-auto h-[calc(100vh-140px)]">{children}</div>{footer && <div className="p-4 border-t sticky bottom-0 bg-white">{footer}</div>}</div></div></div> ); }
