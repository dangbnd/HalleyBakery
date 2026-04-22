import { useEffect, useMemo, useState } from "react";
import { LS, readLS } from "../../../utils.js";
import {
  CUSTOMER_BEHAVIOR_EVENT,
  clearCustomerBehavior,
  summarizeCustomerBehavior,
} from "../../../utils/customerBehavior.js";
import { cdnThumb } from "../../../utils/img.js";
import { Badge, Button, Empty, MetricItem, MetricStrip, PageHeader, Section } from "../ui/primitives.jsx";

const fmt = new Intl.NumberFormat("vi-VN");
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function CountTable({ title, rows = [], label = "Nội dung" }) {
  return (
    <Section title={title} className="h-full" compact>
      {!rows.length ? (
        <Empty className="!py-10" title="Chưa có dữ liệu" hint="Dữ liệu sẽ xuất hiện khi người dùng bắt đầu tương tác trên frontend." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="py-3 pr-3">{label}</th>
                <th className="py-3 text-right">Lượt</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.key} className="border-b border-slate-800/80 last:border-b-0">
                  <td className="py-3 pr-3 text-slate-200">{row.label}</td>
                  <td className="py-3 text-right font-semibold text-white">{fmt.format(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function ProductTable({ rows = [] }) {
  return (
    <Section title="Mẫu đang được quan tâm" compact>
      {!rows.length ? (
        <Empty className="!py-10" title="Chưa có tín hiệu sản phẩm" hint="Khi khách mở detail, bấm Messenger hoặc gửi tư vấn, danh sách này sẽ được cập nhật." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="py-3 pr-3">Mẫu</th>
                <th className="py-3 text-right">Detail</th>
                <th className="py-3 text-right">Messenger</th>
                <th className="py-3 text-right">Tư vấn</th>
                <th className="py-3 text-right">Điểm</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.pid} className="border-b border-slate-800/80 last:border-b-0">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      {row.image ? (
                        <img src={cdnThumb(row.image, 72, 72, 65)} alt="" className="h-11 w-11 rounded-xl border border-slate-800 object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-[11px] text-slate-600">
                          Không có
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{row.name}</div>
                        <div className="truncate text-xs text-slate-500">{row.category || row.pid}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right text-slate-300">{fmt.format(row.detail)}</td>
                  <td className="py-3 text-right text-slate-300">{fmt.format(row.messenger)}</td>
                  <td className="py-3 text-right text-slate-300">{fmt.format(row.consult)}</td>
                  <td className="py-3 text-right font-semibold text-rose-300">{fmt.format(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function LeadsTable({ rows = [] }) {
  return (
    <Section title="Yêu cầu tư vấn gần đây" compact>
      {!rows.length ? (
        <Empty className="!py-10" title="Chưa có form tư vấn" hint="Khi khách gửi thông tin tư vấn, danh sách này sẽ hiện ngay tại đây." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="py-3 pr-3">Thời gian</th>
                <th className="py-3 pr-3">Khách</th>
                <th className="py-3 pr-3">Sản phẩm</th>
                <th className="py-3 pr-3">Ngày cần</th>
                <th className="py-3">Thông tin thêm</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.id} className="border-b border-slate-800/80 last:border-b-0 align-top">
                  <td className="py-3 pr-3 whitespace-nowrap text-slate-400">
                    {row.ts ? dateFmt.format(new Date(row.ts)) : "—"}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-white">{row.name || "Chưa có tên"}</div>
                    <div className="text-xs text-slate-500">{row.phone || "—"}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-300">{row.product_name || row.product?.name || row.product_pid || "—"}</td>
                  <td className="py-3 pr-3 whitespace-nowrap text-slate-300">{row.needed_date || "—"}</td>
                  <td className="py-3 text-slate-400">{row.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export default function AnalyticsPanel() {
  const [tick, setTick] = useState(0);
  const products = useMemo(() => readLS(LS.PRODUCTS, []), [tick]);
  const summary = useMemo(() => summarizeCustomerBehavior(products), [products, tick]);

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    window.addEventListener(CUSTOMER_BEHAVIOR_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CUSTOMER_BEHAVIOR_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Phân tích hành vi khách"
        description="Bảng tín hiệu từ frontend."
        compact
        actions={
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Xóa toàn bộ dữ liệu hành vi cục bộ trên trình duyệt này?")) clearCustomerBehavior();
            }}
          >
            Xóa dữ liệu local
          </Button>
        }
        chips={
          <>
            <Badge variant="warning">Nguồn local</Badge>
          </>
        }
      />

      <MetricStrip columnsClassName="xl:grid-cols-6">
        <MetricItem label="Tổng sự kiện" value={summary.totals.events} meta="Toàn bộ event đang ghi được" tone="blue" />
        <MetricItem label="Mở detail" value={summary.totals.details} meta="Lượt xem chi tiết sản phẩm" tone="violet" />
        <MetricItem label="Messenger" value={summary.totals.messenger} meta="Lượt bấm liên hệ nhanh" tone="rose" />
        <MetricItem label="Tìm kiếm" value={summary.totals.searches} meta="Lượt nhập và chạy search" tone="amber" />
        <MetricItem label="Yêu thích" value={summary.totals.favorites} meta="Lượt thêm mẫu vào yêu thích" tone="emerald" />
        <MetricItem label="Tư vấn" value={summary.totals.consults} meta="Lead tạo từ form tư vấn" tone="blue" />
      </MetricStrip>

      <ProductTable rows={summary.topProducts} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CountTable title="Từ khóa được tìm nhiều" rows={summary.topSearches} label="Từ khóa" />
        <CountTable title="Tag đang hot" rows={summary.topTags} label="Tag" />
        <CountTable title="Danh mục được quan tâm" rows={summary.topCategories} label="Danh mục" />
      </div>

      <LeadsTable rows={summary.recentLeads} />
    </div>
  );
}
