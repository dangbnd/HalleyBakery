import { useEffect, useMemo, useRef, useState } from "react";
import { openChatTarget } from "../utils/chatLink.js";
import { queueTelemetryEvent } from "../services/telemetry.js";
import { productSnapshot } from "../utils/customerBehavior.js";

const todayIso = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseIsoDate = (iso = "") => {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const toIsoDate = (date) => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const sameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const sameMonth = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const formatDateLabel = (iso = "") => {
  if (!iso) return "Chọn ngày";
  const [year, month, day] = String(iso).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
};

const formatMonthLabel = (date) => `Tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;

const buildCalendarDays = (viewMonth) => {
  const first = monthStart(viewMonth);
  const last = monthEnd(viewMonth);
  const startOffset = (first.getDay() + 6) % 7;
  const endOffset = 6 - ((last.getDay() + 6) % 7);
  const gridStart = addDays(first, -startOffset);
  const gridEnd = addDays(last, endOffset);
  const days = Math.round((startOfDay(gridEnd).getTime() - startOfDay(gridStart).getTime()) / 86400000) + 1;
  return Array.from({ length: days }, (_, index) => addDays(gridStart, index));
};

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export default function ConsultForm({ product, onSubmit }) {
  const minDate = useMemo(() => parseIsoDate(todayIso()) || startOfDay(new Date()), []);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    neededDate: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(monthStart(parseIsoDate(todayIso()) || new Date()));
  const datePickerRef = useRef(null);
  const startedRef = useRef(false);
  const submittedRef = useRef(false);
  const dirtyFieldsRef = useRef(new Set());

  const phoneOk = useMemo(() => form.phone.replace(/\D/g, "").length >= 9, [form.phone]);
  const canSubmit = phoneOk && !busy;
  const selectedDate = useMemo(() => parseIsoDate(form.neededDate), [form.neededDate]);
  const canGoPrevMonth = viewMonth.getTime() > monthStart(minDate).getTime();
  const calendarDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);

  const update = (key, value) => {
    const text = String(value || "").trim();
    if (text) dirtyFieldsRef.current.add(key);
    if (!startedRef.current && text) {
      startedRef.current = true;
      queueTelemetryEvent("consult_form_start", {
        product: productSnapshot(product),
        source: "consult_form",
        page_type: "product_detail",
        content_group: "catalog",
        section: "consult_form",
        category: product?.category || "",
        value: key,
      });
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!dateOpen) return undefined;
    const closeOnOutside = (event) => {
      if (!datePickerRef.current?.contains(event.target)) {
        setDateOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setDateOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dateOpen]);

  useEffect(() => {
    return () => {
      if (!startedRef.current || submittedRef.current) return;
      const filledFields = [...dirtyFieldsRef.current];
      queueTelemetryEvent("consult_form_abandon", {
        product: productSnapshot(product),
        source: "consult_form",
        status: "abandon",
        page_type: "product_detail",
        content_group: "catalog",
        section: "consult_form",
        category: product?.category || "",
        value: filledFields.join(","),
        meta: { filledFields, fieldCount: filledFields.length },
      });
    };
  }, [product]);

  const openDatePicker = () => {
    setViewMonth(monthStart(selectedDate || minDate));
    setDateOpen(true);
  };

  const pickDate = (date) => {
    if (startOfDay(date).getTime() < minDate.getTime()) return;
    update("neededDate", toIsoDate(date));
    setDateOpen(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    submittedRef.current = true;
    setBusy(true);
    setResult(null);
    try {
      const res = await onSubmit?.({ ...form, productName: product?.name || "" });
      setResult(res || { ok: true });
      if (res?.chatTarget?.href) {
        try {
          openChatTarget(res.chatTarget);
        } catch {}
      }
    } catch (error) {
      setResult({ ok: false, error: String(error?.message || error || "") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          {"T\u00ean"}
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
            placeholder={"T\u00ean c\u1ee7a b\u1ea1n"}
          />
        </label>

        <label className="text-xs text-gray-600">
          {"S\u1ed1 \u0111i\u1ec7n tho\u1ea1i"}
          <input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
            placeholder="09..."
            inputMode="tel"
            required
          />
        </label>
      </div>

      <label className="block text-xs text-gray-600">
        {"Th\u00f4ng tin th\u00eam"}
        <textarea
          value={form.note}
          onChange={(e) => update("note", e.target.value)}
          className="mt-1 w-full min-h-[64px] rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200"
          placeholder={"M\u1eabu, ch\u1eef tr\u00ean b\u00e1nh, s\u1ed1 l\u01b0\u1ee3ng, \u0111\u1ecba ch\u1ec9 giao..."}
        />
      </label>

      <div className="grid grid-cols-[minmax(0,1fr)_120px] sm:grid-cols-[minmax(0,1fr)_132px] gap-2 items-end">
        <label className="text-xs text-gray-600">
          {"Ng\u00e0y c\u1ea7n b\u00e1nh"}
          <div ref={datePickerRef} className="relative mt-1">
            <button
              type="button"
              onClick={() => (dateOpen ? setDateOpen(false) : openDatePicker())}
              className={
                "group h-10 w-full rounded-xl border bg-white px-3 pr-10 text-left text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-rose-200 " +
                (dateOpen ? "border-rose-300 ring-2 ring-rose-100" : "border-gray-200 hover:border-rose-200")
              }
            >
              <span className={form.neededDate ? "text-gray-900" : "text-gray-400"}>
                {formatDateLabel(form.neededDate)}
              </span>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 group-hover:text-rose-400">
                <CalendarIcon />
              </span>
            </button>

            {dateOpen ? (
              <div className="absolute left-0 top-full z-30 mt-2 w-[248px] max-w-[calc(100vw-56px)] rounded-2xl border border-rose-100 bg-white p-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => canGoPrevMonth && setViewMonth((prev) => addMonths(prev, -1))}
                    disabled={!canGoPrevMonth}
                    className="h-7 w-7 rounded-full border border-gray-200 text-gray-400 grid place-items-center hover:border-rose-200 hover:text-rose-500 disabled:opacity-35 disabled:cursor-not-allowed"
                    aria-label="Thang truoc"
                  >
                    &#8249;
                  </button>
                  <div className="text-[13px] font-semibold text-gray-900">{formatMonthLabel(viewMonth)}</div>
                  <button
                    type="button"
                    onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
                    className="h-7 w-7 rounded-full border border-gray-200 text-gray-400 grid place-items-center hover:border-rose-200 hover:text-rose-500"
                    aria-label="Thang sau"
                  >
                    &#8250;
                  </button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-1">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="h-6 grid place-items-center text-[10px] font-medium text-gray-400">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const iso = toIsoDate(day);
                    const isDisabled = startOfDay(day).getTime() < minDate.getTime();
                    const isCurrentMonth = sameMonth(day, viewMonth);
                    const isSelected = sameDay(day, selectedDate);
                    const isToday = sameDay(day, minDate);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => pickDate(day)}
                        disabled={isDisabled}
                        className={
                          "h-8 rounded-lg text-[13px] transition " +
                          (isSelected
                            ? "bg-rose-500 text-white shadow-sm"
                            : isDisabled
                              ? "text-gray-200 cursor-not-allowed"
                              : isCurrentMonth
                                ? "text-gray-700 hover:bg-rose-50"
                                : "text-gray-300 hover:bg-gray-50") +
                          (isToday && !isSelected ? " ring-1 ring-rose-200" : "")
                        }
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      update("neededDate", "");
                      setDateOpen(false);
                    }}
                    className="text-[11px] font-medium text-gray-400 hover:text-gray-600"
                  >
                    Xóa
                  </button>
                  <button
                    type="button"
                    onClick={() => pickDate(minDate)}
                    className="h-7 rounded-full border border-gray-200 px-3 text-[11px] font-medium text-gray-600 hover:border-rose-200 hover:text-rose-600"
                  >
                    Hôm nay
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-10 px-4 rounded-full bg-rose-500 text-white text-sm font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:bg-rose-600"
        >
          {busy ? "\u0110ang g\u1eedi..." : "G\u1eedi t\u01b0 v\u1ea5n"}
        </button>
      </div>

      {!phoneOk && form.phone ? (
        <div className="text-xs text-rose-600">
          {"S\u1ed1 \u0111i\u1ec7n tho\u1ea1i c\u1ea7n \u00edt nh\u1ea5t 9 ch\u1eef s\u1ed1."}
        </div>
      ) : null}

      {result ? (
        <div className={"text-xs " + (result.ok ? "text-emerald-700" : "text-rose-600")}>
          {result.ok
            ? result.remoteOk
              ? "\u0110\u00e3 l\u01b0u y\u00eau c\u1ea7u v\u00e0o Sheet."
              : "\u0110\u00e3 l\u01b0u y\u00eau c\u1ea7u tr\u00ean m\u00e1y n\u00e0y."
            : result.error || "Kh\u00f4ng g\u1eedi \u0111\u01b0\u1ee3c y\u00eau c\u1ea7u."}
        </div>
      ) : null}
    </form>
  );
}
