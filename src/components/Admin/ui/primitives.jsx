
import React from "react";
export function cn(...xs) { return xs.filter(Boolean).join(" "); }

export function Button({ as = 'button', className = '', variant = 'primary', size = 'md', ...props }) {
  const C = as;
  const base = "inline-flex items-center justify-center rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all duration-200 active:scale-[0.97]";
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2", lg: "text-base px-5 py-2.5" };
  const variants = {
    primary: "bg-gradient-to-r from-gray-900 to-gray-800 text-white hover:from-gray-800 hover:to-gray-700 shadow-sm hover:shadow-md",
    ghost: "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 hover:ring-gray-300",
    subtle: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-gradient-to-r from-red-500 to-rose-600 text-white hover:from-red-600 hover:to-rose-700 shadow-sm",
    success: "bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 shadow-sm",
  };
  return <C className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}

export function IconButton({ className = '', ...props }) { return <Button className={cn("!p-2 rounded-lg", className)} {...props} />; }

export const Input = React.forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cn(
    "w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50/50",
    "focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300",
    "text-sm outline-none transition-all duration-200",
    className
  )} {...props} />;
});

export function Textarea({ className = '', ...props }) {
  return <textarea className={cn(
    "w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50/50",
    "focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300",
    "text-sm outline-none transition-all duration-200 resize-none",
    className
  )} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return <select className={cn(
    "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white",
    "focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300",
    "text-sm outline-none transition-all duration-200",
    className
  )} {...props}>{children}</select>;
}

export function Switch({ checked, onChange }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer select-none">
      <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange?.(e.target.checked)} />
      <span className={cn(
        "w-11 h-6 rounded-full transition-all duration-300 shadow-inner",
        checked ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-gray-300"
      )}></span>
      <span className={cn(
        "absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300",
        checked ? "translate-x-5" : ""
      )}></span>
    </label>
  );
}

export function Badge({ children, className = '', variant = '' }) {
  const vars = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return <span className={cn(
    "inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border",
    vars[variant] || "bg-gray-50 text-gray-600 border-gray-200",
    className
  )}>{children}</span>;
}

export function Card({ className = '', children }) {
  return <div className={cn("bg-white rounded-2xl border border-gray-100 shadow-sm", className)}>{children}</div>;
}

export function Section({ title, actions, children, className = '' }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

export function Toolbar({ children, className = '' }) {
  return <div className={cn("flex flex-wrap items-center gap-2 p-3 bg-gray-50/80 border border-gray-100 rounded-xl", className)}>{children}</div>;
}

export function Empty({ title = "Chưa có dữ liệu", hint = null, children = null }) {
  return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3 opacity-30">📭</div>
      <div className="text-base font-semibold text-gray-600">{title}</div>
      {hint && <div className="text-sm text-gray-400 mt-1">{hint}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="w-5 h-5 animate-spin border-2 border-gray-200 border-t-indigo-600 rounded-full" />;
}
