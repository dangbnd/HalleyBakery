import React, { useMemo } from "react";
import { LS, getAuthUser, readAudit, readLS } from "../../../utils.js";
import { summarizeCustomerBehavior } from "../../../utils/customerBehavior.js";
import { getConfig, KEYS } from "../../../utils/config.js";
import {
  Badge,
  Button,
  Empty,
  MetricItem,
  MetricStrip,
  PageHeader,
  Section,
} from "../ui/primitives.jsx";

function fmt(value = 0) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0));
}

function HealthBadge({ ok }) {
  return <Badge variant={ok ? "success" : "warning"}>{ok ? "Sẵn sàng" : "Cần xử lý"}</Badge>;
}

function LinkButton({ children, onClick }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

function DenseTable({ columns, rows, emptyTitle = "Chưa có dữ liệu", emptyHint = "" }) {
  if (!rows.length) {
    return <Empty className="!py-10" title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {columns.map((column) => (
              <th key={column.key} className={`py-2.5 ${column.align === "right" ? "text-right" : ""}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key || index} className="border-b border-slate-800/80 last:border-b-0">
              {columns.map((column) => (
                <td key={column.key} className={`py-3 pr-3 align-top text-slate-300 ${column.align === "right" ? "text-right" : ""}`}>
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminOverviewPanel({ onNavigate }) {
  const user = useMemo(() => getAuthUser(), []);
  const products = useMemo(() => readLS(LS.PRODUCTS, []), []);
  const users = useMemo(() => readLS(LS.USERS, []), []);
  const activity = useMemo(() => readAudit().slice(0, 8), []);
  const behavior = useMemo(() => summarizeCustomerBehavior(products), [products]);

  const activeProducts = products.filter((item) => item?.active !== false).length;
  const hiddenProducts = products.filter((item) => item?.active === false).length;
  const categories = new Set(products.map((item) => String(item?.category || "").trim()).filter(Boolean));
  const activeUsers = users.filter((item) => item?.active !== false).length;

  const sheetId = String(getConfig(KEYS.SHEET_ID, "") || "").trim();
  const gsWebAppUrl = String(getConfig(KEYS.GS_WEBAPP_URL, "") || "").trim();
  const gsToken = String(getConfig(KEYS.GS_WEBAPP_TOKEN, "") || "").trim();
  const driveRootId = String(getConfig(KEYS.DRIVE_FOLDER_ID, "") || "").trim();
  const googleClientId = String(getConfig(KEYS.GOOGLE_OAUTH_CLIENT_ID, "") || "").trim();

  const systemRows = [
    {
      key: "catalog",
      area: "Sản phẩm",
      total: fmt(products.length),
      status: activeProducts ? "Ổn định" : "Cần kiểm tra",
      detail: `${fmt(activeProducts)} đang hiển thị • ${fmt(hiddenProducts)} đang ẩn • ${fmt(categories.size)} danh mục`,
      action: () => onNavigate?.("catalog", "products"),
      actionLabel: "Mở sản phẩm",
    },
    {
      key: "users",
      area: "Người dùng",
      total: fmt(users.length),
      status: activeUsers ? "Hoạt động" : "Cần kiểm tra",
      detail: `${fmt(activeUsers)} tài khoản đang hoạt động`,
      action: () => onNavigate?.("operations", "users"),
      actionLabel: "Mở người dùng",
    },
    {
      key: "analytics",
      area: "Phân tích",
      total: fmt(behavior.totals?.events),
      status: "Local",
      detail: `${fmt(behavior.totals?.details)} detail • ${fmt(behavior.totals?.consults)} tư vấn`,
      action: () => onNavigate?.("operations", "analytics"),
      actionLabel: "Mở phân tích",
    },
    {
      key: "audit",
      area: "Nhật ký",
      total: fmt(activity.length),
      status: "Local",
      detail: `${fmt(activity.length)} sự kiện gần nhất trên trình duyệt này`,
      action: () => onNavigate?.("operations", "audit"),
      actionLabel: "Mở nhật ký",
    },
  ];

  const integrationRows = [
    {
      key: "sheet",
      name: "Nguồn Google Sheet",
      ok: !!sheetId,
      detail: sheetId ? "Đã cấu hình nguồn dữ liệu chính." : "Chưa có Sheet ID, panel sẽ phải fallback.",
      action: () => onNavigate?.("system", "settings"),
      actionLabel: "Cấu hình",
    },
    {
      key: "webapp",
      name: "GS WebApp ghi dữ liệu",
      ok: !!gsWebAppUrl && !!gsToken,
      detail: gsWebAppUrl && gsToken ? "Đủ URL và token cho thao tác ghi." : "Thiếu URL hoặc token cho thao tác ghi.",
      action: () => onNavigate?.("system", "settings"),
      actionLabel: "Kiểm tra",
    },
    {
      key: "drive",
      name: "Kho ảnh Google Drive",
      ok: !!driveRootId && !!googleClientId,
      detail: driveRootId && googleClientId ? "Upload trực tiếp đã có nền tảng." : "Thiếu Drive root hoặc OAuth client ID.",
      action: () => onNavigate?.("media", "upload"),
      actionLabel: "Mở upload",
    },
    {
      key: "analytics-backend",
      name: "Phân tích tập trung",
      ok: false,
      detail: "Vẫn đang dùng dữ liệu local-browser, chưa gom về backend.",
      action: () => onNavigate?.("operations", "analytics"),
      actionLabel: "Xem local",
    },
  ];

  const workspaceRows = [
    {
      key: "catalog",
      name: "Sản phẩm",
      tools: "Sản phẩm, Loại & size",
      focus: "Chuẩn hóa dữ liệu và trạng thái hiển thị",
      action: () => onNavigate?.("catalog", "products"),
    },
    {
      key: "media",
      name: "Ảnh & AI",
      tools: "Upload, AI tags",
      focus: "Ảnh, phân loại, gắn tag và chuẩn bị publish",
      action: () => onNavigate?.("media", "upload"),
    },
    {
      key: "ops",
      name: "Vận hành",
      tools: "Người dùng, Phân tích, Nhật ký",
      focus: "Theo dõi hoạt động nội bộ và hành vi khách",
      action: () => onNavigate?.("operations", "users"),
    },
    {
      key: "system",
      name: "Hệ thống",
      tools: "Cấu hình",
      focus: "Tích hợp, runtime và các điểm kỹ thuật",
      action: () => onNavigate?.("system", "settings"),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tổng quan"
        description="Bảng điều khiển vận hành."
        compact
        chips={
          <>
            <Badge variant="info">{user?.name || user?.username || "Admin"}</Badge>
            <Badge variant={sheetId ? "success" : "warning"}>
              {sheetId ? "Google Sheet: đã nối" : "Google Sheet: chưa nối"}
            </Badge>
            <Badge variant={gsWebAppUrl && gsToken ? "success" : "warning"}>
              {gsWebAppUrl && gsToken ? "WebApp: sẵn sàng" : "WebApp: thiếu cấu hình"}
            </Badge>
          </>
        }
      />

      <MetricStrip columnsClassName="xl:grid-cols-4">
        <MetricItem
          label="Sản phẩm"
          value={fmt(products.length)}
          meta={`${fmt(activeProducts)} hiển thị • ${fmt(categories.size)} danh mục`}
          tone="blue"
          action={<LinkButton onClick={() => onNavigate?.("catalog", "products")}>Mở</LinkButton>}
        />
        <MetricItem
          label="Người dùng"
          value={fmt(users.length)}
          meta={`${fmt(activeUsers)} đang hoạt động`}
          tone="violet"
          action={<LinkButton onClick={() => onNavigate?.("operations", "users")}>Mở</LinkButton>}
        />
        <MetricItem
          label="Sự kiện hành vi"
          value={fmt(behavior.totals?.events)}
          meta={`${fmt(behavior.totals?.details)} detail • ${fmt(behavior.totals?.consults)} tư vấn`}
          tone="rose"
          action={<LinkButton onClick={() => onNavigate?.("operations", "analytics")}>Mở</LinkButton>}
        />
        <MetricItem
          label="Nhật ký"
          value={fmt(activity.length)}
          meta="Đọc từ phiên local hiện tại"
          tone="emerald"
          action={<LinkButton onClick={() => onNavigate?.("operations", "audit")}>Mở</LinkButton>}
        />
      </MetricStrip>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.95fr]">
        <Section title="Tổng quan hệ thống" compact>
          <DenseTable
            columns={[
              { key: "area", label: "Khu vực" },
              { key: "total", label: "Chỉ số", align: "right" },
              {
                key: "status",
                label: "Trạng thái",
                render: (value) => (
                  <Badge variant={value === "Ổn định" || value === "Hoạt động" ? "success" : value === "Local" ? "warning" : "neutral"}>
                    {value}
                  </Badge>
                ),
              },
              { key: "detail", label: "Ghi chú" },
              {
                key: "action",
                label: "",
                align: "right",
                render: (_, row) => <LinkButton onClick={row.action}>{row.actionLabel}</LinkButton>,
              },
            ]}
            rows={systemRows}
          />
        </Section>

        <Section title="Tích hợp" compact>
          <DenseTable
            columns={[
              { key: "name", label: "Hệ thống" },
              {
                key: "ok",
                label: "Tình trạng",
                render: (_, row) => <HealthBadge ok={row.ok} />,
              },
              { key: "detail", label: "Chi tiết" },
              {
                key: "action",
                label: "",
                align: "right",
                render: (_, row) => <LinkButton onClick={row.action}>{row.actionLabel}</LinkButton>,
              },
            ]}
            rows={integrationRows}
          />
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.2fr]">
        <Section title="Khu vực làm việc" compact>
          <DenseTable
            columns={[
              { key: "name", label: "Khu vực" },
              { key: "tools", label: "Công cụ" },
              { key: "focus", label: "Mục tiêu" },
              {
                key: "action",
                label: "",
                align: "right",
                render: (_, row) => <LinkButton onClick={row.action}>Mở</LinkButton>,
              },
            ]}
            rows={workspaceRows}
          />
        </Section>

        <Section title="Hoạt động gần đây" compact>
          <DenseTable
            columns={[
              { key: "event", label: "Sự kiện", render: (value) => <span className="text-slate-200">{value || "event"}</span> },
              {
                key: "actor",
                label: "Người thực hiện",
                render: (_, row) => <span className="text-slate-400">{row.payload?.user || row.payload?.username || "hệ thống"}</span>,
              },
              {
                key: "detail",
                label: "Chi tiết",
                render: (_, row) => (
                  <span className="text-slate-400">
                    {row.payload?.targetUser || row.payload?.name || row.payload?.id || "Không có chi tiết"}
                  </span>
                ),
              },
              {
                key: "time",
                label: "Thời gian",
                align: "right",
                render: (_, row) => <span className="text-slate-500">{row.ts ? new Date(row.ts).toLocaleString("vi-VN") : "—"}</span>,
              },
            ]}
            rows={activity}
            emptyTitle="Chưa có hoạt động quản trị"
            emptyHint="Khi admin đăng nhập, sửa dữ liệu hoặc thay đổi người dùng, sự kiện sẽ hiện ở đây."
          />
        </Section>
      </div>
    </div>
  );
}
