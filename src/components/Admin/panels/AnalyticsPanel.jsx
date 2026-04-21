import { useEffect, useMemo, useState } from "react";
import { LS, readLS } from "../../../utils.js";
import {
  CUSTOMER_BEHAVIOR_EVENT,
  clearCustomerBehavior,
  summarizeCustomerBehavior,
} from "../../../utils/customerBehavior.js";
import { cdnThumb } from "../../../utils/img.js";

const fmt = new Intl.NumberFormat("vi-VN");
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Kpi({ label, value }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{fmt.format(value || 0)}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-gray-400">{children}</div>;
}

function CountTable({ title, rows = [], label = "Nội dung" }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {!rows.length ? (
        <Empty>Chưa có dữ liệu.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-400">
                <th className="py-2 font-medium">{label}</th>
                <th className="py-2 text-right font-medium">Lượt</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 text-gray-700">{row.label}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{fmt.format(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductTable({ rows = [] }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Mẫu đang được quan tâm</h3>
      {!rows.length ? (
        <Empty>Chưa có mở detail, Messenger hoặc tư vấn.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-400">
                <th className="py-2 font-medium">Mẫu</th>
                <th className="py-2 text-right font-medium">Detail</th>
                <th className="py-2 text-right font-medium">Messenger</th>
                <th className="py-2 text-right font-medium">Tư vấn</th>
                <th className="py-2 text-right font-medium">Điểm</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.pid} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-3">
                      {row.image ? (
                        <img src={cdnThumb(row.image, 72, 72, 65)} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-gray-100" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{row.name}</div>
                        <div className="truncate text-xs text-gray-400">{row.category || row.pid}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right">{fmt.format(row.detail)}</td>
                  <td className="py-2 text-right">{fmt.format(row.messenger)}</td>
                  <td className="py-2 text-right">{fmt.format(row.consult)}</td>
                  <td className="py-2 text-right font-semibold text-rose-600">{fmt.format(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LeadsTable({ rows = [] }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Yêu cầu tư vấn gần đây</h3>
      {!rows.length ? (
        <Empty>Chưa có form tư vấn.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-400">
                <th className="py-2 font-medium">Thời gian</th>
                <th className="py-2 font-medium">Khách</th>
                <th className="py-2 font-medium">Sản phẩm</th>
                <th className="py-2 font-medium">Ngày cần</th>
                <th className="py-2 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.id} className="border-b last:border-b-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{row.ts ? dateFmt.format(new Date(row.ts)) : ""}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-gray-900">{row.name || "Chưa có tên"}</div>
                    <div className="text-xs text-gray-500">{row.phone}</div>
                  </td>
                  <td className="py-2 pr-3 text-gray-700">{row.product_name || row.product?.name || row.product_pid}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-700">{row.needed_date}</td>
                  <td className="py-2 pr-3 text-gray-600">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AnalyticsPanel() {
  const [tick, setTick] = useState(0);
  const products = useMemo(() => readLS(LS.PRODUCTS, []), [tick]);
  const summary = useMemo(() => summarizeCustomerBehavior(products), [products, tick]);

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener(CUSTOMER_BEHAVIOR_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CUSTOMER_BEHAVIOR_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Hành vi khách</h2>
          <p className="mt-1 text-sm text-gray-500">Dữ liệu local từ trình duyệt này: detail, Messenger, tìm kiếm, yêu thích và tư vấn.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm("Xóa toàn bộ dữ liệu hành vi local trên trình duyệt này?")) clearCustomerBehavior();
          }}
          className="h-9 rounded-lg border bg-white px-3 text-sm text-gray-600 hover:bg-gray-50"
        >
          Xóa dữ liệu local
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Event" value={summary.totals.events} />
        <Kpi label="Detail" value={summary.totals.details} />
        <Kpi label="Messenger" value={summary.totals.messenger} />
        <Kpi label="Tìm kiếm" value={summary.totals.searches} />
        <Kpi label="Yêu thích" value={summary.totals.favorites} />
        <Kpi label="Tư vấn" value={summary.totals.consults} />
      </div>

      <ProductTable rows={summary.topProducts} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <CountTable title="Từ khóa hot" rows={summary.topSearches} label="Từ khóa" />
        <CountTable title="Tag hot" rows={summary.topTags} label="Tag" />
        <CountTable title="Danh mục hot" rows={summary.topCategories} label="Danh mục" />
      </div>

      <LeadsTable rows={summary.recentLeads} />
    </div>
  );
}
