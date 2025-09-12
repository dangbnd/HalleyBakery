
import React, { useState } from "react";
import { cn } from "./primitives.jsx";
export function Tabs({ items=[], value:controlled, onChange }){
  const [val, setVal] = useState(items[0]?.key);
  const current = controlled ?? val;
  const set = onChange ?? setVal;
  return (<div><div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">{items.map(it => (<button key={it.key} className={cn("px-3 py-1.5 rounded-lg text-sm", current===it.key ? "bg-white shadow border" : "text-gray-600")} onClick={()=>set(it.key)}>{it.label}</button>))}</div><div className="mt-4">{items.find(i=>i.key===current)?.children}</div></div> ); }
