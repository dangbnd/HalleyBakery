
import React from "react";
import { Button } from "./primitives.jsx";
export function Modal({ open, onClose, title, children, footer }){
  if(!open) return null;
  return (<div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={onClose} /><div className="absolute inset-0 flex items-center justify-center p-4"><div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border"><div className="flex items-center justify-between p-4 border-b"><div className="font-semibold">{title}</div><Button variant="ghost" onClick={onClose}>Đóng</Button></div><div className="p-4">{children}</div>{footer && <div className="p-4 border-t">{footer}</div>}</div></div></div> ); }
