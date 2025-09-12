// src/components/Admin/panels/ProductsPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Section, Toolbar, Badge } from "../ui/primitives.jsx";
import { Table } from "../ui/table.jsx";
import { readLS, writeLS } from "../../../utils.js";
import { genId } from "../shared/helpers.js";
import { listSheet, insertToSheet, updateToSheet, deleteFromSheet } from "../shared/sheets.js";

/* ----------------- helpers ----------------- */
const safe = (x) => (Array.isArray(x) ? x.filter((v) => v && typeof v === "object") : []);
const s = (v) => (v == null ? "" : String(v));

const parseMaybeJSON = (v) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t) return t;
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { return JSON.parse(t); } catch { return v; }
  }
  return v;
};

const normImages = (v) => Array.isArray(v) ? v : s(v).split(/[\n,|]\s*/).filter(Boolean);
const firstImg = (p) => Array.isArray(p?.images) ? (p.images[0] || "") : s(p?.image) || "";

/* ----------------- types & sizes (for size/price) ----------------- */
const sizeKey = (z) => `${s(z?.code).trim()}@@${s(z?.height).trim()}`;
const sizeLabel = (z) => `${z?.label || z?.code}${z?.height ? ` - cao ${z.height}cm` : ""}`;

function useTypesSizes() {
  const [types, setTypes] = useState(() => safe(readLS("types") || []));
  const [sizes, setSizes] = useState(() => safe(readLS("sizes") || []));
  const vT = useRef(""), vS = useRef("");

  useEffect(() => {
    let t; let alive = true;
    const loop = async () => {
      const a = await listSheet("Types");
      if (a?.ok && a.version !== vT.current) {
        vT.current = a.version;
        const rows = safe(a.rows).map((r) => ({
          id: s(r.id) || genId(),
          code: s(r.code).trim(),
          name: s(r.name).trim(),
          sizeCodes: Array.isArray(r.sizeCodes)
            ? r.sizeCodes
            : (Array.isArray(parseMaybeJSON(r.sizeCodes))
                ? parseMaybeJSON(r.sizeCodes)
                : s(r.sizeCodes).split(/[\s,|]+/)).filter(Boolean).map(s),
        }));
        setTypes(rows); writeLS("types", rows);
      }
      const b = await listSheet("Sizes");
      if (b?.ok && b.version !== vS.current) {
        vS.current = b.version;
        const rows = safe(b.rows).map((r) => ({
          id: s(r.id) || genId(),
          code: s(r.code).trim(),
          label: s(r.label).trim(),
          height: s(r.height).trim(),
        }));
        setSizes(rows); writeLS("sizes", rows);
      }
      if (alive) t = setTimeout(loop, 8000);
    };
    loop(); return () => { alive = false; clearTimeout(t); };
  }, []);

  return { types, sizes };
}

/* ----------------- categories from SHEET (not menu) ----------------- */
function useCategories() {
  const [cats, setCats] = useState(() => safe(readLS("categories") || []));
  const verRef = useRef("");

  useEffect(() => {
    let t; let alive = true;
    const loop = async () => {
      const a = await listSheet("Category");
      const r = a?.ok ? a : await listSheet("Categories");
      if (r?.ok && r.version !== verRef.current) {
        verRef.current = r.version;
        const headers = (r.headers || []).map((h) => String(h || "").toLowerCase());
        const rows = safe(r.rows).map((row) => {
          const o = {};
          headers.forEach((h) => { o[h] = row[h]; });
          return {
            id: s(o.id) || genId(),
            slug: s(o.slug || o.code || o.value || o.path || o.name).trim(),
            name: s(o.name || o.title || o.label).trim(),
          };
        }).filter((c) => c.slug && c.name);
        setCats(rows); writeLS("categories", rows);
      }
      if (alive) t = setTimeout(loop, 8000);
    };
    loop(); return () => { alive = false; clearTimeout(t); };
  }, []);

  const options = useMemo(() => cats.map((c) => ({ value: c.slug, label: c.name })), [cats]);
  const mapByVal = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  return { catOptions: options, catMap: mapByVal };
}
const displayCategory = (catMap, v) => catMap.get(s(v).trim())?.label || s(v);

/* ----------------- products ----------------- */
const normProduct = (row) => ({
  id: s(row.id) || genId(),
  name: s(row.name).trim(),
  category: s(row.category).trim(),     // slug (sheet) – show with diacritics via catMap
  type: s(row.type).trim(),             // type code
  active: !!(row.active ?? true),
  images: Array.isArray(row.images) ? row.images : normImages(parseMaybeJSON(row.images ?? row.image)),
  priceBySize: (row && typeof parseMaybeJSON(row.priceBySize) === "object") ? parseMaybeJSON(row.priceBySize) : {},
  description: s(row.description || row.desc || ""),
  banner: !!row.banner,
  tags: s(row.tags || ""),
  createdAt: row.createdAt || new Date().toISOString(),
});
const notEmptyProduct = (p) => !!(s(p.name).trim() && (s(p.type).trim() || true));

/* ----------------- main ----------------- */
export default function ProductsPanel() {
  const [products, setProducts] = useState(() => safe(readLS("products") || []));
  const [q, setQ] = useState("");
  const verP = useRef("");

  const { types, sizes } = useTypesSizes();
  const { catOptions, catMap } = useCategories();

  // pull Products from sheet
  useEffect(() => {
    let t; let alive = true;
    const loop = async () => {
      const a = await listSheet("Products");
      if (a?.ok && a.version !== verP.current) {
        verP.current = a.version;
        const rows = safe(a.rows).map(normProduct).filter(notEmptyProduct);
        setProducts(rows); writeLS("products", rows);
      }
      if (alive) t = setTimeout(loop, 8000);
    };
    loop(); return () => { alive = false; clearTimeout(t); };
  }, []);

  const [rowNew, setRowNew] = useState({
    name: "", category: "", type: "", active: true, images: [], priceBySize: {}, description: "", banner: false, tags: ""
  });
  const canSaveNew = !!(s(rowNew.name).trim());
  const dirtyNew = !!rowNew.name || !!rowNew.category || !!rowNew.type ||
    Object.keys(rowNew.priceBySize || {}).length > 0 || !!rowNew.description || !!rowNew.tags;

  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  const view = products.filter((p) => {
    const hay = (p.name + " " + displayCategory(catMap, p.category) + " " + p.type).toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const list = [{ id: "__new__" }, ...view];

  function getAllowedSizes(typeCode) {
    if (!typeCode) return [];
    const t = (types || []).find((x) => x.code === typeCode);
    const allow = t?.sizeCodes || [];
    const byKey = new Map(sizes.map((z) => [sizeKey(z), z]));
    const byCode = new Map(sizes.map((z) => [z.code, z]));
    return allow.map((k) => byKey.get(k) || byCode.get(k)).filter(Boolean);
  }

  function saveNew() {
    if (!canSaveNew) return;
    const allowed = getAllowedSizes(rowNew.type);
    const keysHaveAt = (types.find((t) => t.code === rowNew.type)?.sizeCodes || []).some((x) => String(x).includes("@@"));
    const keyFor = (s) => (keysHaveAt ? sizeKey(s) : s.code);

    const pruned = Object.fromEntries(Object.entries(rowNew.priceBySize || {}).filter(([k]) => {
      const ok = allowed.some((sz) => keyFor(sz) === k || sz.code === k);
      return ok;
    }));

    const item = normProduct({
      id: genId(),
      name: rowNew.name,
      category: rowNew.category,
      type: rowNew.type,
      active: true,
      images: normImages(rowNew.images || []),
      priceBySize: pruned,
      description: rowNew.description || "",
      banner: !!rowNew.banner,
      tags: rowNew.tags || "",
    });

    insertToSheet("Products", item);
    const next = [item, ...products];
    setProducts(next); writeLS("products", next);
    setRowNew({ name: "", category: "", type: "", active: true, images: [], priceBySize: {}, description: "", banner: false, tags: "" });
  }

  function startEdit(row) {
    setEditId(row.id);
    setDraft({
      ...row,
      image: firstImg(row),
      images: [...(row.images || [])],
      priceBySize: { ...(row.priceBySize || {}) },
    });
  }
  function cancelEdit() { setEditId(null); setDraft(null); }

  function saveEdit() {
    const allowed = getAllowedSizes(draft.type);
    const keysHaveAt = (types.find((t) => t.code === draft.type)?.sizeCodes || []).some((x) => String(x).includes("@@"));
    const keyFor = (s) => (keysHaveAt ? sizeKey(s) : s.code);

    const pruned = Object.fromEntries(Object.entries(draft.priceBySize || {}).filter(([k]) => {
      const ok = allowed.some((sz) => keyFor(sz) === k || sz.code === k);
      return ok;
    }));

    const clean = normProduct({
      ...draft,
      images: normImages(draft.image || draft.images),
      priceBySize: pruned,
    });

    updateToSheet("Products", clean);
    const next = products.map((p) => (p.id === editId ? clean : p));
    setProducts(next); writeLS("products", next);
    cancelEdit();
  }

  function removeRow(row) {
    deleteFromSheet("Products", row.id);
    const next = products.filter((p) => p.id !== row.id);
    setProducts(next); writeLS("products", next);
  }

  const Img = ({ src }) => (
    <img
      src={src}
      alt=""
      className="w-12 h-12 object-cover rounded-lg border"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );

  return (
    <Section title="Sản phẩm" actions={<Toolbar><Input placeholder="Tìm..." value={q} onChange={(e) => setQ(e.target.value)} /></Toolbar>}>
      <Table
        columns={[
          { title: "ID", dataIndex: "id", thClass: "w-28" },
          { title: "Ảnh", dataIndex: "image", thClass: "w-[18rem]", tdClass: "w-[18rem]" },
          { title: "Tên", dataIndex: "name", thClass: "w-[20rem]" },
          { title: "Danh mục", dataIndex: "category", thClass: "w-64" },
          { title: "Loại", dataIndex: "type", thClass: "w-48" },
          { title: "Size / Giá", dataIndex: "sizes" },
          { title: "Mô tả", dataIndex: "desc", thClass: "w-[22rem]" },
          { title: "Banner", dataIndex: "banner", thClass: "w-20" },
          { title: "Tags (CSV)", dataIndex: "tags", thClass: "w-64" },
          { title: "Hiện", dataIndex: "active", thClass: "w-20" },
          { title: "", dataIndex: "actions", thClass: "w-44" },
        ]}
        data={list}
        rowRender={(row) => row.id === "__new__" ? (
          <tr key="__new__">
            <td className="px-3 py-2 text-gray-400">—</td>

            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-lg border bg-gray-50 overflow-hidden" />
                <Input
                  value={Array.isArray(rowNew.images) ? rowNew.images.join(", ") : ""}
                  onChange={(e) => setRowNew({ ...rowNew, images: normImages(e.target.value) })}
                  placeholder="1 hoặc nhiều URL, cách nhau dấu phẩy"
                />
              </div>
            </td>

            <td className="px-3 py-2">
              <Input value={rowNew.name} onChange={(e) => setRowNew({ ...rowNew, name: e.target.value })} placeholder="Tên sản phẩm" />
            </td>

            <td className="px-3 py-2">
              <select
                className="w-full px-2 py-1.5 border rounded-lg"
                value={rowNew.category}
                onChange={(e) => setRowNew({ ...rowNew, category: e.target.value })}
              >
                <option value="">-- chọn danh mục (lá) --</option>
                {catOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </td>

            <td className="px-3 py-2">
              <select
                className="w-full px-2 py-1.5 border rounded-lg"
                value={rowNew.type}
                onChange={(e) => {
                  const code = e.target.value;
                  setRowNew({ ...rowNew, type: code, priceBySize: {} });
                }}
              >
                <option value="">-- chọn --</option>
                {(types || []).map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
              </select>
            </td>

            <td className="px-3 py-2">
              <InlinePriceEditor
                sizes={sizes}
                types={types}
                typeCode={rowNew.type}
                value={rowNew.priceBySize}
                onChange={(v) => setRowNew({ ...rowNew, priceBySize: v })}
              />
            </td>

            <td className="px-3 py-2">
              <textarea
                className="w-full px-2 py-1.5 border rounded-lg min-h-[2.5rem]"
                value={rowNew.description}
                onChange={(e) => setRowNew({ ...rowNew, description: e.target.value })}
                placeholder="Mô tả…"
              />
            </td>

            <td className="px-3 py-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!rowNew.banner} onChange={(e) => setRowNew({ ...rowNew, banner: e.target.checked })} />
                Gắn banner
              </label>
            </td>

            <td className="px-3 py-2">
              <Input value={rowNew.tags} onChange={(e) => setRowNew({ ...rowNew, tags: e.target.value })} placeholder="vd: sinh nhật, cute" />
            </td>

            <td className="px-3 py-2">
              <Badge>Ẩn</Badge>
            </td>

            <td className="px-3 py-2 text-right">
              <div className="flex justify-end gap-2">
                <Button disabled={!canSaveNew} onClick={saveNew}>Lưu</Button>
                <Button variant="ghost" disabled={!dirtyNew} onClick={() => setRowNew({
                  name: "", category: "", type: "", active: true, images: [], priceBySize: {}, description: "", banner: false, tags: ""
                })}>Huỷ</Button>
              </div>
            </td>
          </tr>
        ) : (
          <tr key={row.id}>
            <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[7rem]" title={row.id}>{row.id}</td>

            <td className="px-3 py-2">
              {editId === row.id ? (
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-lg border bg-gray-50 overflow-hidden">
                    {firstImg(draft) && <Img src={firstImg(draft)} />}
                  </div>
                  <Input
                    value={Array.isArray(draft.images) ? draft.images.join(", ") : draft.image || ""}
                    onChange={(e) => setDraft({ ...draft, images: normImages(e.target.value), image: "" })}
                    placeholder="1 hoặc nhiều URL, cách nhau dấu phẩy"
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg border bg-gray-50 overflow-hidden">
                  {firstImg(row) && <Img src={firstImg(row)} />}
                </div>
              )}
            </td>

            <td className="px-3 py-2">
              {editId === row.id
                ? <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                : <div className="font-medium">{row.name}</div>}
            </td>

            <td className="px-3 py-2">
              {editId === row.id ? (
                <select
                  className="w-full px-2 py-1.5 border rounded-lg"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  <option value="">-- chọn danh mục (lá) --</option>
                  {catOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <span>{displayCategory(catMap, row.category) || "—"}</span>
              )}
            </td>

            <td className="px-3 py-2">
              {editId === row.id ? (
                <select
                  className="w-full px-2 py-1.5 border rounded-lg"
                  value={draft.type}
                  onChange={(e) => {
                    const code = e.target.value;
                    setDraft({ ...draft, type: code, priceBySize: {} });
                  }}
                >
                  <option value="">-- chọn --</option>
                  {(types || []).map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
                </select>
              ) : ((types || []).find((t) => t.code === row.type)?.name || row.type)}
            </td>

            <td className="px-3 py-2">
              {editId === row.id ? (
                <InlinePriceEditor
                  sizes={sizes}
                  types={types}
                  typeCode={draft.type}
                  value={draft.priceBySize || {}}
                  onChange={(v) => setDraft({ ...draft, priceBySize: v })}
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(row.priceBySize || {}).map(([k, v]) => {
                    // support both key formats
                    const byKey = new Map(sizes.map((z) => [sizeKey(z), z]));
                    const byCode = new Map(sizes.map((z) => [z.code, z]));
                    const sz = byKey.get(k) || byCode.get(k);
                    const label = sz ? sizeLabel(sz) : k;
                    return <Badge key={k}>{label}: {Number(v).toLocaleString()}đ</Badge>;
                  })}
                </div>
              )}
            </td>

            <td className="px-3 py-2">
              {editId === row.id ? (
                <textarea
                  className="w-full px-2 py-1.5 border rounded-lg min-h-[2.5rem]"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Mô tả…"
                />
              ) : (
                <span className="text-sm text-gray-500 line-clamp-2">{row.description}</span>
              )}
            </td>

            <td className="px-3 py-2">
              {editId === row.id ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!draft.banner} onChange={(e) => setDraft({ ...draft, banner: e.target.checked })} />
                  Gắn banner
                </label>
              ) : (row.banner ? <Badge className="bg-amber-50 border-amber-300">Banner</Badge> : <span>—</span>)}
            </td>

            <td className="px-3 py-2">
              {editId === row.id
                ? <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="vd: sinh nhật, cute" />
                : <span className="text-sm text-gray-500">{row.tags}</span>}
            </td>

            <td className="px-3 py-2">
              {editId === row.id
                ? (<label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                    Hiển thị
                  </label>)
                : (row.active ? <Badge className="bg-green-100 border-green-300">Hiển</Badge> : <Badge>Ẩn</Badge>)}
            </td>

            <td className="px-3 py-2 text-right">
              {editId === row.id ? (
                <div className="flex justify-end gap-2">
                  <Button onClick={saveEdit}>Lưu</Button>
                  <Button variant="ghost" onClick={cancelEdit}>Huỷ</Button>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => startEdit(row)}>Sửa</Button>
                  <Button variant="danger" onClick={() => removeRow(row)}>Xoá</Button>
                </div>
              )}
            </td>
          </tr>
        )}
      />
      {view.length === 0 && <div className="text-sm text-gray-500 p-3">Chưa có sản phẩm.</div>}
    </Section>
  );
}

/* ----------------- inline size/price editor ----------------- */
function InlinePriceEditor({ sizes, types, typeCode, value = {}, onChange }) {
  if (!typeCode) return <div className="text-xs text-gray-500">Chọn loại để nhập giá theo size</div>;
  const t = (types || []).find((x) => x.code === typeCode);
  const allow = (t?.sizeCodes || []);
  const byKey = new Map((sizes || []).map((z) => [sizeKey(z), z]));
  const byCode = new Map((sizes || []).map((z) => [z.code, z]));
  const anyHasAt = allow.some((k) => String(k).includes("@@"));

  const allowedSizes = allow
    .map((k) => byKey.get(k) || byCode.get(k))
    .filter(Boolean);

  if (allowedSizes.length === 0) return <div className="text-xs text-gray-500">Loại này chưa gán size.</div>;

  const keyFor = (sz) => (anyHasAt ? sizeKey(sz) : sz.code);

  return (
    <div className="flex flex-wrap gap-2">
      {allowedSizes.map((sz) => {
        const k = keyFor(sz);
        const v = (value[k] ?? value[sz.code]) ?? "";
        return (
          <label key={sz.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-[11rem]">{sizeLabel(sz)}</span>
            <input
              className="w-28 px-2 py-1 border rounded"
              type="number"
              value={v}
              onChange={(e) => {
                const num = e.target.value ? Number(e.target.value) : undefined;
                const next = { ...value, [k]: num };
                // dọn legacy key nếu có
                if (k !== sz.code && next.hasOwnProperty(sz.code)) delete next[sz.code];
                onChange(next);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}
