import React, { useEffect, useMemo } from "react";

export function SizeSelector({ sizes = [], value, onChange, className = "" }) {
  const items = useMemo(() => sizes.filter(Boolean), [sizes]);
  const active = value ?? items[0]?.id;

  useEffect(() => {
    if (!items.find(s => s.id === active) && items[0]) onChange?.(items[0].id);
  }, [items, active, onChange]);

  // rất nhỏ
  const btnBase = "px-1 py-[1px] text-[9px] leading-[14px] tracking-tight";

  return (
    <div
      className={"grid grid-cols-3 gap-1 " + className}
      role="radiogroup"
      aria-label="Chọn size"
    >
      {items.map((s) => {
        const selected = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(s.id)}
            className={
              "min-w-0 w-full truncate text-center rounded-full border " + btnBase + " " +
              (selected
                ? "bg-orange-700 text-white border-orange-700 shadow-sm"
                : "bg-white text-gray-800 border-gray-300 hover:bg-orange-100")
            }
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
