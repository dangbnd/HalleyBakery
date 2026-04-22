import React, { useMemo, useState } from "react";
import { cn } from "./primitives.jsx";

export function Tabs({ items = [], value: controlled, onChange, className = "", tabsClassName = "" }) {
  const firstKey = items[0]?.key || "";
  const [internal, setInternal] = useState(firstKey);
  const current = controlled ?? internal;
  const setCurrent = onChange ?? setInternal;
  const currentItem = useMemo(() => items.find((item) => item.key === current) || items[0], [items, current]);

  if (!items.length) return null;

  return (
    <div className={className}>
      <div
        className={cn(
          "inline-flex max-w-full items-center gap-1 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/80 p-1 shadow-sm",
          tabsClassName
        )}
      >
        {items.map((item) => {
          const active = item.key === currentItem?.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setCurrent(item.key)}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition",
                active
                  ? "bg-blue-500 text-white shadow-[0_10px_25px_rgba(59,130,246,0.22)]"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? (
                <span className={cn("rounded-full px-2 py-0.5 text-[10px]", active ? "bg-white/15 text-white" : "bg-slate-800 text-slate-400")}>
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3">{currentItem?.children}</div>
    </div>
  );
}
