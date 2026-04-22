import React from "react";

export function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

export function Button({
  as = "button",
  className = "",
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  leftIcon = null,
  rightIcon = null,
  children,
  ...props
}) {
  const C = as;
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.985]";
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-sm",
  };
  const variants = {
    primary:
      "border border-blue-500/70 bg-blue-500 text-white shadow-[0_10px_30px_rgba(59,130,246,0.24)] hover:bg-blue-400 focus:ring-blue-500/30",
    secondary:
      "border border-violet-500/70 bg-violet-500 text-white shadow-[0_10px_30px_rgba(139,92,246,0.24)] hover:bg-violet-400 focus:ring-violet-500/30",
    ghost:
      "border border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700 hover:bg-slate-800/90 focus:ring-slate-700/40",
    subtle:
      "bg-slate-800 text-slate-200 hover:bg-slate-700 focus:ring-slate-700/40",
    danger:
      "border border-red-500/70 bg-red-500 text-white shadow-[0_10px_30px_rgba(239,68,68,0.18)] hover:bg-red-400 focus:ring-red-500/30",
    success:
      "border border-emerald-500/70 bg-emerald-500 text-white shadow-[0_10px_30px_rgba(16,185,129,0.18)] hover:bg-emerald-400 focus:ring-emerald-500/30",
  };

  return (
    <C
      className={cn(base, sizes[size], variants[variant] || variants.primary, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="!h-4 !w-4 !border-white/25 !border-t-white" /> : leftIcon}
      <span>{children}</span>
      {!loading && rightIcon}
    </C>
  );
}

export function IconButton({ className = "", size = "md", children, ...props }) {
  const sizeClass = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-10 w-10";
  return (
    <Button variant="ghost" className={cn("!p-0 rounded-lg", sizeClass, className)} {...props}>
      {children}
    </Button>
  );
}

const controlBase =
  "w-full rounded-lg border border-slate-800 bg-slate-950 text-sm text-slate-100 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = React.forwardRef(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={cn(controlBase, "h-10 px-3", className)} {...props} />;
});

export const Textarea = React.forwardRef(function Textarea({ className = "", rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(controlBase, "px-3 py-2 resize-none", className)} {...props} />;
});

export function Select({ className = "", children, ...props }) {
  return (
    <select className={cn(controlBase, "h-10 px-3 appearance-none", className)} {...props}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label = "" }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 select-none">
      <span
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
          checked ? "border-blue-500/70 bg-blue-500/90" : "border-slate-700 bg-slate-800"
        )}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </span>
      {label ? <span className="text-sm text-slate-300">{label}</span> : null}
    </label>
  );
}

export function Badge({ children, className = "", variant = "neutral" }) {
  const variants = {
    neutral: "border-slate-700 bg-slate-800 text-slate-300",
    success: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
    danger: "border-red-500/35 bg-red-500/12 text-red-300",
    warning: "border-amber-500/35 bg-amber-500/12 text-amber-300",
    info: "border-blue-500/35 bg-blue-500/12 text-blue-300",
    violet: "border-violet-500/35 bg-violet-500/12 text-violet-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        variants[variant] || variants.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className = "", children }) {
  return (
    <div className={cn("rounded-2xl border border-slate-800 bg-slate-900/92 text-slate-300 shadow-[0_16px_40px_rgba(2,6,23,0.32)] backdrop-blur", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow = "",
  title,
  description = "",
  actions = null,
  chips = null,
  className = "",
  compact = false,
}) {
  return (
    <div
      className={cn(
        "flex flex-col lg:flex-row lg:items-start lg:justify-between",
        compact ? "gap-3" : "gap-4",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div> : null}
        <h1 className={cn("font-semibold tracking-tight text-white", compact ? "mt-0 text-xl leading-7" : "mt-1 text-2xl")}>{title}</h1>
        {description ? (
          <p className={cn("max-w-3xl text-sm text-slate-400", compact ? "mt-1.5 leading-5" : "mt-2 leading-6")}>
            {description}
          </p>
        ) : null}
        {chips ? <div className={cn("flex flex-wrap items-center gap-2", compact ? "mt-2" : "mt-3")}>{chips}</div> : null}
      </div>
      {actions ? <div className={cn("flex flex-wrap items-center gap-2 lg:justify-end", compact ? "pt-1" : "")}>{actions}</div> : null}
    </div>
  );
}

export function Section({ title, description = "", actions = null, children, className = "", compact = false }) {
  return (
    <Card className={className}>
      {(title || actions || description) && (
        <div
          className={cn(
            "flex flex-col border-b border-slate-800 sm:flex-row sm:items-start sm:justify-between",
            compact ? "gap-2 px-4 py-3" : "gap-3 px-5 py-4"
          )}
        >
          <div className="min-w-0">
            {title ? <h2 className={cn("font-semibold text-white", compact ? "text-[15px]" : "text-base")}>{title}</h2> : null}
            {description ? <p className={cn("text-sm text-slate-400", compact ? "mt-0.5 leading-5" : "mt-1")}>{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={cn(compact ? "p-4" : "p-5")}>{children}</div>
    </Card>
  );
}

export function Toolbar({ children, className = "" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-2.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatGrid({ className = "", children }) {
  return <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function StatCard({ label, value, hint = "", icon = null, tone = "neutral", action = null }) {
  const tones = {
    neutral: "from-slate-900 via-slate-900 to-slate-950 border-slate-800",
    blue: "from-blue-950/70 via-slate-900 to-slate-950 border-blue-900/60",
    emerald: "from-emerald-950/70 via-slate-900 to-slate-950 border-emerald-900/60",
    amber: "from-amber-950/70 via-slate-900 to-slate-950 border-amber-900/60",
    violet: "from-violet-950/70 via-slate-900 to-slate-950 border-violet-900/60",
    rose: "from-rose-950/70 via-slate-900 to-slate-950 border-rose-900/60",
  };
  return (
    <div className={cn("rounded-3xl border bg-gradient-to-br p-4 shadow-[0_16px_34px_rgba(2,6,23,0.32)]", tones[tone] || tones.neutral)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="mt-2.5 text-[34px] font-semibold tracking-tight text-white leading-none">{value}</div>
        </div>
        {icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
            {icon}
          </div>
        ) : null}
      </div>
      {hint || action ? (
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <p className="text-[13px] leading-5 text-slate-400">{hint}</p>
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function MetricStrip({ className = "", columnsClassName = "", children }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className={cn("grid divide-y divide-slate-800 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4", columnsClassName)}>
        {children}
      </div>
    </Card>
  );
}

export function MetricItem({ label, value, meta = "", tone = "neutral", action = null }) {
  const tones = {
    neutral: "border-l-slate-700",
    blue: "border-l-blue-500/70",
    emerald: "border-l-emerald-500/70",
    amber: "border-l-amber-500/70",
    violet: "border-l-violet-500/70",
    rose: "border-l-rose-500/70",
  };
  return (
    <div className={cn("border-l-2 px-3.5 py-3", tones[tone] || tones.neutral)}>
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold leading-none text-white">{value}</div>
        {action}
      </div>
      {meta ? <div className="mt-1.5 text-xs leading-5 text-slate-400">{meta}</div> : null}
    </div>
  );
}

export function Callout({ tone = "info", title, children, action = null, className = "" }) {
  const tones = {
    info: "border-blue-500/30 bg-blue-500/10 text-blue-100",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    danger: "border-red-500/30 bg-red-500/10 text-red-100",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  };
  return (
    <div className={cn("rounded-2xl border px-4 py-3", tones[tone] || tones.info, className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {title ? <div className="text-sm font-semibold">{title}</div> : null}
          <div className="mt-1 text-sm leading-6 text-current/85">{children}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function Empty({
  title = "Chưa có dữ liệu",
  hint = "",
  icon = "○",
  children = null,
  className = "",
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/55 px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-xl text-slate-500">
        {icon}
      </div>
      <div className="text-base font-semibold text-slate-200">{title}</div>
      {hint ? <div className="mt-2 max-w-md text-sm text-slate-500">{hint}</div> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function Spinner({ className = "" }) {
  return <div className={cn("h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400", className)} />;
}

export function Field({ label, hint = "", children, className = "" }) {
  return (
    <label className={cn("block", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
