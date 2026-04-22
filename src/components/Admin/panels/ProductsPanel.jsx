import React, { useEffect, useMemo, useState } from "react";
import { LS, audit, parseBooleanLike, readLS, writeLS } from "../../../utils.js";
import { getConfig } from "../../../utils/config.js";
import { fetchTabAsObjects } from "../../../services/sheets.js";
import {
  deleteConfiguredProductRow,
  listConfiguredProductSheet,
  updateConfiguredProductRow,
} from "../shared/sheets.js";
import { Table } from "../ui/table.jsx";
import { Modal } from "../ui/modal.jsx";
import {
  Badge,
  Button,
  Callout,
  Empty,
  Field,
  Input,
  MetricItem,
  MetricStrip,
  PageHeader,
  Section,
  Select,
  Textarea,
  Toolbar,
} from "../ui/primitives.jsx";

const PAGE_SIZE = 40;
const SORT_OPTIONS = [
  { value: "name", label: "Tên sản phẩm" },
  { value: "category", label: "Danh mục" },
  { value: "status", label: "Trạng thái" },
];

const safe = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []);
const s = (value) => (value == null ? "" : String(value));

const parseMaybeJSON = (value) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return text;
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }
  return value;
};

const normImages = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return s(value)
    .split(/[\n,|]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const firstImage = (product) => {
  if (Array.isArray(product?.images)) return product.images[0] || "";
  return s(product?.image);
};

const tagsArr = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return s(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const stableRowId = (row) => {
  const explicit = s(row.id ?? row.ID ?? row.key ?? row.sku ?? row.code).trim();
  if (explicit) return explicit;
  const name = s(row.name ?? row.title ?? row.ten).trim().toLowerCase();
  const category = s(row.category ?? row.danh_muc ?? row.type).trim().toLowerCase();
  const image = Array.isArray(row.images)
    ? s(row.images[0]).trim().toLowerCase()
    : s(row.images ?? row.image)
        .split(/[\n,|]\s*/)[0]
        ?.trim()
        .toLowerCase();
  return [name, category, image].filter(Boolean).join("|");
};

const fixThumbUrl = (url, size = 96) => {
  if (!url) return "";
  const input = String(url);
  const match = input.match(/[?&]id=([a-zA-Z0-9_-]+)/) || input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}=w${size}`;
  return input.replace(/sz=w\d+/, `sz=w${size}`);
};

const normProduct = (row) => ({
  id: stableRowId(row),
  name: s(row.name).trim(),
  category: s(row.category).trim(),
  active: parseBooleanLike(row.active, true),
  images: Array.isArray(row.images) ? row.images : normImages(parseMaybeJSON(row.images ?? row.image)),
  description: s(row.description || row.desc || ""),
  tags: s(row.tags || ""),
  createdAt: row.createdAt || new Date().toISOString(),
});

function statusVariant(active) {
  return active ? "success" : "warning";
}

function statusLabel(active) {
  return active ? "Đang hiển thị" : "Đang ẩn";
}

function ProductForm({ draft, setDraft, categories, catLabel }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên sản phẩm">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Baby (1)"
          />
        </Field>
        <Field label="Danh mục">
          <Select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>
            <option value="">Chọn danh mục</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {catLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Tags" hint="Ngăn cách bằng dấu phẩy">
        <Input
          value={Array.isArray(draft.tags) ? draft.tags.join(", ") : draft.tags || ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, tags: e.target.value }))}
          placeholder="hoa baby, xanh dương, tối giản"
        />
      </Field>

      <Field label="Mô tả">
        <Textarea
          rows={4}
          value={draft.description || ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Mô tả ngắn để admin rà soát nhanh."
        />
      </Field>

      <Field label="Danh sách ảnh" hint="Mỗi dòng hoặc mỗi dấu phẩy là một ảnh">
        <Textarea
          rows={5}
          value={Array.isArray(draft.images) ? draft.images.join("\n") : draft.images || ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, images: e.target.value }))}
          placeholder="https://..."
        />
      </Field>

      <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={!!draft.active}
          onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.checked }))}
          className="h-4 w-4 accent-blue-500"
        />
        <span>Sản phẩm này đang hiển thị ngoài frontend</span>
      </label>
    </div>
  );
}

export default function ProductsPanel({ canEdit = true, canDelete = true }) {
  const [products, setProducts] = useState(() => safe(readLS("products") || []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState("local");
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [catMap, setCatMap] = useState(new Map());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const currentUser = readLS(LS.AUTH, {});
  const catLabel = (slug) => catMap.get(slug) || slug || "Chưa phân loại";

  const applyLocal = (rows) => {
    setProducts(rows);
    writeLS("products", rows);
  };

  const refreshProducts = async () => {
    setLoading(true);
    try {
      const result = await listConfiguredProductSheet().catch(() => null);
      if (result?.ok) {
        const rows = safe(result.rows).map(normProduct).filter((item) => !!s(item.name).trim());
        applyLocal(rows);
        setSource("sheet");
        setNotice(null);
      } else {
        const sheetId = getConfig("sheet_id");
        const gid = getConfig("sheet_gid_products");
        if (!sheetId) throw new Error("Chưa cấu hình Google Sheet cho tab sản phẩm.");
        const rows = await fetchTabAsObjects({ sheetId, gid: gid || "0" });
        const normalized = rows.map(normProduct).filter((item) => !!s(item.name).trim());
        applyLocal(normalized);
        setSource("sheet-fallback");
        setNotice({
          tone: "warning",
          title: "Đang dùng đường đọc fallback",
          text: "Panel sản phẩm đang đọc trực tiếp tab products vì chưa resolve được cấu hình tối ưu hơn.",
        });
      }
    } catch (error) {
      setSource("local");
      setNotice({
        tone: "warning",
        title: "Không tải được catalog mới nhất",
        text: error?.message || "Panel đang dùng dữ liệu cục bộ gần nhất trên trình duyệt này.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshProducts();
  }, []);

  useEffect(() => {
    const sheetId = getConfig("sheet_id");
    const gid = getConfig("sheet_gid_menu") || getConfig("sheet_gid_categories");
    if (!sheetId || !gid) return;
    let alive = true;

    (async () => {
      try {
        const rows = await fetchTabAsObjects({ sheetId, gid });
        const map = new Map();
        rows.forEach((row) => {
          const slug = s(row.slug ?? row.code ?? row.value ?? row.path ?? row.key).trim();
          const name = s(row.name ?? row.title ?? row.label ?? row.ten).trim();
          if (slug && name) map.set(slug, name);
        });
        if (alive) setCatMap(map);
      } catch {
        // giữ im lặng, fallback về slug
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(() => {
    return [...new Set(products.map((item) => item.category).filter(Boolean))].sort((a, b) =>
      catLabel(a).localeCompare(catLabel(b), "vi", { sensitivity: "base" })
    );
  }, [products, catMap]);

  const filteredProducts = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const list = products.filter((item) => {
      const hay = `${item.name} ${item.category} ${item.tags} ${item.id}`.toLowerCase();
      if (query && !hay.includes(query.toLowerCase())) return false;
      if (catFilter && item.category !== catFilter) return false;
      if (statusFilter === "active" && item.active === false) return false;
      if (statusFilter === "hidden" && item.active !== false) return false;
      return true;
    });

    return list.sort((a, b) => {
      if (sortKey === "status") return ((a.active ? 0 : 1) - (b.active ? 0 : 1)) * dir;
      const left = sortKey === "category" ? catLabel(a.category) : s(a[sortKey]);
      const right = sortKey === "category" ? catLabel(b.category) : s(b[sortKey]);
      return String(left).localeCompare(String(right), "vi", { numeric: true }) * dir;
    });
  }, [products, query, catFilter, statusFilter, sortKey, sortDir, catMap]);

  useEffect(() => {
    setPage(1);
  }, [query, catFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const active = products.filter((item) => item.active !== false).length;
    const hidden = products.filter((item) => item.active === false).length;
    const tagged = products.filter((item) => tagsArr(item.tags).length > 0).length;
    return {
      total: products.length,
      active,
      hidden,
      categories: categories.length,
      tagged,
    };
  }, [products, categories.length]);

  const openEdit = (product) => {
    if (!canEdit) return;
    setEditId(product.id);
    setDraft({ ...product, images: [...(product.images || [])] });
  };

  const saveEdit = async () => {
    if (!draft || !canEdit) return;

    const clean = normProduct({
      ...draft,
      images: normImages(draft.images),
    });

    try {
      setSaving(true);
      await updateConfiguredProductRow(clean);
      applyLocal(products.map((item) => (item.id === editId ? clean : item)));
      audit("product.update", {
        id: clean.id,
        name: clean.name,
        user: currentUser?.username || "?",
      });
      setNotice({ tone: "success", title: "Đã lưu sản phẩm", text: `${clean.name} đã được cập nhật.` });
      setEditId(null);
      setDraft(null);
      await refreshProducts();
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Không cập nhật được sản phẩm",
        text: error?.message || "Lỗi khi đồng bộ sản phẩm.",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    try {
      setSaving(true);
      await deleteConfiguredProductRow(deleteTarget.id);
      applyLocal(products.filter((item) => item.id !== deleteTarget.id));
      audit("product.delete", {
        id: deleteTarget.id,
        name: deleteTarget.name,
        user: currentUser?.username || "?",
      });
      setNotice({ tone: "success", title: "Đã xóa sản phẩm", text: `${deleteTarget.name} đã được gỡ khỏi catalog.` });
      setDeleteTarget(null);
      await refreshProducts();
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Không xóa được sản phẩm",
        text: error?.message || "Lỗi khi xóa sản phẩm.",
      });
    } finally {
      setSaving(false);
    }
  };

  const pageLabel = `${filteredProducts.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}-${Math.min(
    safePage * PAGE_SIZE,
    filteredProducts.length
  )} / ${filteredProducts.length}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sản phẩm"
        description="Bảng catalog."
        compact
        actions={
          <Button variant="ghost" loading={loading} onClick={refreshProducts}>
            Làm mới
          </Button>
        }
        chips={
          <>
            <Badge variant="info">
              Nguồn dữ liệu: {source === "sheet" ? "Sheet chính" : source === "sheet-fallback" ? "Sheet fallback" : "Bản cục bộ"}
            </Badge>
            {!canEdit || !canDelete ? (
              <Badge variant="warning">{!canEdit ? "Chỉ có quyền xem" : "Không có quyền xóa"}</Badge>
            ) : null}
          </>
        }
      />

      {notice ? (
        <Callout tone={notice.tone} title={notice.title}>
          {notice.text}
        </Callout>
      ) : null}

      <MetricStrip columnsClassName="xl:grid-cols-5">
        <MetricItem label="Tổng sản phẩm" value={stats.total} meta="Toàn bộ catalog đang đọc được" tone="blue" />
        <MetricItem label="Đang hiển thị" value={stats.active} meta="Frontend đang dùng" tone="emerald" />
        <MetricItem label="Đang ẩn" value={stats.hidden} meta="Cần rà soát trước khi bật lại" tone="amber" />
        <MetricItem label="Danh mục" value={stats.categories} meta="Số nhóm đang có hàng" tone="violet" />
        <MetricItem label="Có tags" value={stats.tagged} meta="Đủ dữ liệu cho search và related" tone="rose" />
      </MetricStrip>

      <Section
        title="Bảng catalog"
        compact
      >
        <div className="space-y-3">
          <Toolbar className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(320px,1.6fr)_repeat(4,minmax(0,1fr))]">
            <Input
              className="min-w-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên, ID, tag..."
            />
            <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="min-w-0">
              <option value="">Tất cả danh mục</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {catLabel(item)}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-0">
              <option value="all">Mọi trạng thái</option>
              <option value="active">Đang hiển thị</option>
              <option value="hidden">Đang ẩn</option>
            </Select>
            <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="min-w-0">
              {SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  Theo {item.label.toLowerCase()}
                </option>
              ))}
            </Select>
            <Select value={sortDir} onChange={(e) => setSortDir(e.target.value)} className="min-w-0">
              <option value="asc">Tăng dần</option>
              <option value="desc">Giảm dần</option>
            </Select>
          </Toolbar>

        {!filteredProducts.length ? (
          <Empty
            icon="📦"
            title="Không có sản phẩm khớp bộ lọc"
            hint="Hãy nới lỏng bộ lọc hoặc đồng bộ lại catalog từ Google Sheet."
          />
        ) : (
          <div className="space-y-3">
            <div className="hidden lg:block">
              <Table
                columns={[
                  { title: "Ảnh", dataIndex: "thumb", thClass: "w-[84px]" },
                  { title: "Sản phẩm", dataIndex: "name", thClass: "w-[28%]" },
                  { title: "Danh mục", dataIndex: "category", thClass: "w-[16%]" },
                  { title: "Trạng thái", dataIndex: "status", thClass: "w-[14%]" },
                  { title: "Tags", dataIndex: "tags" },
                  { title: "", dataIndex: "actions", thClass: "w-[14%]" },
                ]}
                data={pagedProducts}
                rowRender={(row) => (
                  <tr key={row.id} className="align-top transition hover:bg-slate-900/55">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="h-14 w-14 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                        onClick={() => {
                          const raw = firstImage(row);
                          if (raw) setPreviewImage(raw);
                        }}
                      >
                        {firstImage(row) ? (
                          <img src={fixThumbUrl(firstImage(row), 112)} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-600">Không có</div>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-semibold text-white">{row.name}</div>
                      <div className="mt-1 text-xs text-slate-500">ID: {row.id}</div>
                      {row.description ? <div className="mt-2 line-clamp-2 text-sm text-slate-400">{row.description}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm text-slate-300">{catLabel(row.category)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant(row.active)}>{statusLabel(row.active)}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {tagsArr(row.tags).length ? (
                          tagsArr(row.tags).slice(0, 6).map((tag) => (
                            <Badge key={`${row.id}-${tag}`} variant="neutral">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">Chưa có tag</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        {canEdit ? (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                            Sửa
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(row)}>
                            Xóa
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
              />
            </div>

            <div className="grid gap-3 lg:hidden">
              {pagedProducts.map((row) => (
                <div key={row.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                      onClick={() => {
                        const raw = firstImage(row);
                        if (raw) setPreviewImage(raw);
                      }}
                    >
                      {firstImage(row) ? (
                        <img src={fixThumbUrl(firstImage(row), 112)} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-600">Không có</div>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">{row.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{catLabel(row.category)}</div>
                      <div className="mt-2">
                        <Badge variant={statusVariant(row.active)}>{statusLabel(row.active)}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {tagsArr(row.tags).length ? (
                      tagsArr(row.tags).slice(0, 5).map((tag) => (
                        <Badge key={`${row.id}-${tag}`} variant="neutral">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">Chưa có tag</span>
                    )}
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    {canEdit ? (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        Sửa
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(row)}>
                        Xóa
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-400">{pageLabel}</div>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                    Trước
                  </Button>
                  <Badge variant="neutral">
                    Trang {safePage}/{totalPages}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={safePage === totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Sau
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
        </div>
      </Section>

      <Modal
        open={!!editId}
        onClose={() => {
          setEditId(null);
          setDraft(null);
        }}
        title="Sửa sản phẩm"
        description="Cập nhật metadata catalog."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setEditId(null);
                setDraft(null);
              }}
            >
              Hủy
            </Button>
            <Button variant="secondary" loading={saving} onClick={saveEdit}>
              Lưu thay đổi
            </Button>
          </div>
        }
      >
        {draft ? <ProductForm draft={draft} setDraft={setDraft} categories={categories} catLabel={catLabel} /> : null}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Xóa sản phẩm"
        description="Gỡ sản phẩm khỏi catalog admin."
        widthClass="max-w-xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button variant="danger" loading={saving} onClick={confirmDelete}>
              Xóa sản phẩm
            </Button>
          </div>
        }
      >
        <div className="text-sm leading-6 text-slate-300">
          Bạn sắp xóa <span className="font-semibold text-white">{deleteTarget?.name}</span>. Hãy chắc rằng sản phẩm này không còn cần cho catalog hoặc pipeline media.
        </div>
      </Modal>

      <Modal open={!!previewImage} onClose={() => setPreviewImage(null)} title="Xem ảnh sản phẩm" widthClass="max-w-2xl">
        {previewImage ? (
          <div className="flex justify-center">
            <img
              src={previewImage}
              alt=""
              className="max-h-[70vh] rounded-2xl border border-slate-800 object-contain shadow-[0_24px_60px_rgba(2,6,23,0.45)]"
              onError={(event) => {
                const match =
                  previewImage.match(/[?&]id=([a-zA-Z0-9_-]+)/) || previewImage.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match && !event.currentTarget.src.includes("lh3")) {
                  event.currentTarget.src = `https://lh3.googleusercontent.com/d/${match[1]}=w1200`;
                }
              }}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
