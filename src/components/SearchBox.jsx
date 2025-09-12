import { useState } from "react";

export default function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Tìm sản phẩm...",
  autoFocus = false,
  className = "",
}) {
  const [v, setV] = useState(value ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(v);
      }}
      className={`flex items-center gap-2 ${className}`}
    >
      <input
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onChange?.(e.target.value);
        }}
        autoFocus={autoFocus}
        type="search"
        inputMode="search"
        placeholder={placeholder}
        className="w-full rounded-full border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-rose-500 px-3 py-2 text-white text-sm"
      >
        Tìm
      </button>
    </form>
  );
}
