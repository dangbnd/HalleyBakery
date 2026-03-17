// src/components/Admin/panels/ProductsPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LS, audit, parseBooleanLike, readLS, writeLS } from "../../../utils.js";
import {
  listConfiguredProductSheet,
  updateConfiguredProductRow,
  deleteConfiguredProductRow,
} from "../shared/sheets.js";
import { getConfig } from "../../../utils/config.js";
import { fetchTabAsObjects } from "../../../services/sheets.js";

const PAGE_SIZE = 50;

/* helpers */
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
const tagsArr = (v) => Array.isArray(v) ? v.map(t => String(t).trim()).filter(Boolean) : s(v).split(",").map(t => t.trim()).filter(Boolean);
const stableRowId = (row) => {
  const explicit = s(row.id ?? row.ID ?? row.key ?? row.sku ?? row.code).trim();
  if (explicit) return explicit;
  const name = s(row.name ?? row.title ?? row.ten).trim().toLowerCase();
  const category = s(row.category ?? row.danh_muc ?? row.type).trim().toLowerCase();
  const image = Array.isArray(row.images)
    ? s(row.images[0]).trim().toLowerCase()
    : s(row.images ?? row.image).split(/[\n,|]\s*/)[0]?.trim().toLowerCase();
  return [name, category, image].filter(Boolean).join("|");
};

const fixThumbUrl = (url, size = 96) => {
  if (!url) return "";
  const u = String(url);
  const m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/) || u.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  return u.replace(/sz=w\d+/, `sz=w${size}`);
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

/* ====================== MAIN ====================== */
export default function ProductsPanel({ canEdit = true, canDelete = true }) {
  const [products, setProducts] = useState(() => safe(readLS("products") || []));
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [page, setPage] = useState(1);
  const verP = useRef("");

  useEffect(() => {
    let t, alive = true;
    const loop = async () => {
      try {
        const a = await listConfiguredProductSheet().catch(() => null);
        if (a?.ok && a.version !== verP.current) {
          verP.current = a.version;
          const rows = safe(a.rows).map(normProduct).filter((p) => !!s(p.name).trim());
          setProducts(rows); writeLS("products", rows);
        } else if (!a?.ok) {
          const sheetId = getConfig("sheet_id");
          const gid = getConfig("sheet_gid_products");
          if (sheetId) {
            const rows = await fetchTabAsObjects({ sheetId, gid: (gid || "0") });
            const pRows = rows.map(normProduct).filter((p) => !!s(p.name).trim());
            setProducts(pRows); writeLS("products", pRows);
          }
        }
      } catch { }
      setLoading(false);
      if (alive) t = setTimeout(loop, 10000);
    };
    loop(); return () => { alive = false; clearTimeout(t); };
  }, []);

  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

    /* Category label map from Menu sheet */
  const [catMap, setCatMap] = useState(new Map());
  useEffect(() => {
    const sheetId = getConfig("sheet_id");
    const gid = getConfig("sheet_gid_menu") || getConfig("sheet_gid_categories");
    if (!sheetId || !gid) return;
    let alive = true;
    (async () => {
      try {
        const rows = await fetchTabAsObjects({ sheetId, gid });
        const m = new Map();
        for (const r of rows) {
          const slug = s(r.slug ?? r.code ?? r.value ?? r.path ?? r.key).trim();
          const name = s(r.name ?? r.title ?? r.label ?? r.ten ?? r["t�n"]).trim();
          if (slug && name) m.set(slug, name);
        }
        if (alive) setCatMap(m);
      } catch { }
    })();
    return () => { alive = false; };
  }, []);

  const catLabel = (slug) => catMap.get(slug) || slug;

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach(p => { if (p.category) set.add(p.category); });
    return [...set].sort();
  }, [products]);

  /* Sort */
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [imgModal, setImgModal] = useState(null);
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const view = useMemo(() => {
    let arr = products.filter((p) => {
      const hay = (p.name + " " + p.category + " " + s(p.tags) + " " + p.id).toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (catFilter && p.category !== catFilter) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      let va, vb;
      if (sortKey === "name") { va = a.name; vb = b.name; }
      else if (sortKey === "category") { va = catLabel(a.category); vb = catLabel(b.category); }
      else if (sortKey === "status") { va = a.active ? 0 : 1; vb = b.active ? 0 : 1; return (va - vb) * dir; }
      else if (sortKey === "id") { va = parseInt(a.id) || 0; vb = parseInt(b.id) || 0; return (va - vb) * dir; }
      else { va = s(a[sortKey]); vb = s(b[sortKey]); }
      return String(va).localeCompare(String(vb), "vi", { numeric: true }) * dir;
    });
    return arr;
  }, [products, q, catFilter, sortKey, sortDir, catMap]);

  useEffect(() => { setPage(1); }, [q, catFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = view.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function startEdit(row) {
    if (!canEdit) return;
    setEditId(row.id);
    setDraft({ ...row, images: [...(row.images || [])] });
  }
  function cancelEdit() { setEditId(null); setDraft(null); }
  async function saveEdit() {
    if (!canEdit) return;
    const clean = normProduct({ ...draft, images: normImages(draft.image || draft.images) });
    try {
      await updateConfiguredProductRow(clean);
      const next = products.map((p) => (p.id === editId ? clean : p));
      setProducts(next);
      writeLS("products", next);
      audit("product.update", { id: clean.id, name: clean.name, user: (readLS(LS.AUTH) || {}).username || "?" });
      cancelEdit();
    } catch (e) {
      console.error("update Products failed:", e);
      alert("Không cập nhật được sản phẩm.");
    }
  }
  async function removeRow(row) {
    if (!canDelete) return;
    try {
      await deleteConfiguredProductRow(row.id);
      const next = products.filter((p) => p.id !== row.id);
      setProducts(next);
      writeLS("products", next);
      audit("product.delete", { id: row.id, name: row.name, user: (readLS(LS.AUTH) || {}).username || "?" });
    } catch (e) {
      console.error("delete Products failed:", e);
      alert("Không xoá được sản phẩm.");
    }
  }

  /* Pagination */
  const Pagination = () => {
    if (totalPages <= 1) return null;
    // Smart pages: show first, last, current±1, with ellipsis
    const pages = [];
    const addPage = (n) => { if (n >= 1 && n <= totalPages && !pages.includes(n)) pages.push(n); };
    addPage(1);
    addPage(safePage - 1);
    addPage(safePage);
    addPage(safePage + 1);
    addPage(totalPages);
    pages.sort((a, b) => a - b);

    return (
      <div className="flex items-center justify-between py-1.5 px-0.5">
        <span className="text-[11px] text-gray-400">
          {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, view.length)} / {view.length}
        </span>
        <div className="flex items-center gap-0.5">
          <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
          </PgBtn>
          {pages.map((p, idx) => {
            const prev = pages[idx - 1];
            const showDot = prev && p - prev > 1;
            return (
              <span key={p} className="flex items-center gap-0.5">
                {showDot && <span className="px-1 text-xs text-gray-300">…</span>}
                <button onClick={() => setPage(p)}
                  className={`min-w-[28px] h-7 px-1.5 text-xs rounded-md border transition ${
                    p === safePage ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>{p}</button>
              </span>
            );
          })}
          <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
          </PgBtn>
        </div>
      </div>
    );
  };
  const PgBtn = ({ children, ...p }) => <button {...p} className="w-7 h-7 flex items-center justify-center text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition">{children}</button>;

  /* Sort header */
  const SortTh = ({ label, field, className = "" }) => (
    <th className={`text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 cursor-pointer select-none hover:text-gray-700 transition ${className}`}
      onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px] opacity-40">{sortKey === field ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </span>
    </th>
  );

  return (<>
    <div className="flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Header */}
      <div className="shrink-0 space-y-2 mb-2">
        {(!canEdit || !canDelete) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {canEdit
              ? "Tài khoản này chỉ được sửa sản phẩm, không được xoá."
              : "Tài khoản này chỉ có quyền xem sản phẩm."}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select className={`h-8 px-2 pr-6 text-[11px] font-medium rounded-full border appearance-none bg-no-repeat transition cursor-pointer focus:outline-none flex-1 min-w-0 sm:flex-none ${catFilter ? "bg-purple-50 text-purple-700 border-purple-200" : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"}`}
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 6px center" }}
            value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">📁 Tất cả ({products.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{catLabel(c)} ({products.filter(p => p.category === c).length})</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input className="h-8 pl-8 pr-3 w-full border border-gray-200 rounded-lg bg-white text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              placeholder="Tìm theo tên, ID, tag..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <Pagination />
      </div>

      {/* Mobile Card View - compact */}
      <div className="flex-1 overflow-y-auto md:hidden space-y-1.5">
        {paged.map((row) => (
          <div key={row.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {editId === row.id ? (
              /* Edit mode */
              <div className="p-3 space-y-1.5">
                <input className="w-full px-2 py-1 border rounded-lg text-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <select className="w-full px-2 py-1 border rounded-lg text-xs" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  <option value="">— Danh mục —</option>{categories.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
                </select>
                <input className="w-full px-2 py-1 border rounded-lg text-xs" value={Array.isArray(draft.tags) ? draft.tags.join(", ") : (draft.tags || "")} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="tag1, tag2" />
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
                  <div className="flex gap-1.5">
                    <button onClick={saveEdit} className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">✓ Lưu</button>
                    <button onClick={cancelEdit} className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition">Huỷ</button>
                  </div>
                </div>
              </div>
            ) : (
              /* View mode - compact single row */
              <div className="flex items-center gap-2 px-2.5 py-2">
                <div className="h-10 w-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-100 shrink-0 cursor-pointer" onClick={() => { const raw = firstImg(row); raw && setImgModal(raw); }}>
                  {firstImg(row) ? <img src={fixThumbUrl(firstImg(row), 80)} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-900 text-xs truncate">{row.name}</span>
                    <span className={`shrink-0 inline-flex items-center text-[9px] font-medium px-1 py-px rounded-full ${
                      row.active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"
                    }`}>{row.active ? "●" : "○"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{catLabel(row.category) || "—"}</span>
                    {tagsArr(row.tags).length > 0 && (
                      <span className="text-[9px] text-gray-400">· {tagsArr(row.tags).slice(0,2).join(", ")}{tagsArr(row.tags).length > 2 ? ` +${tagsArr(row.tags).length - 2}` : ""}</span>
                    )}
                  </div>
                </div>
                 {(canEdit || canDelete) && (
                   <div className="flex gap-0.5 shrink-0">
                     {canEdit && (
                       <button onClick={() => startEdit(row)} className="p-1.5 text-gray-300 hover:text-blue-500 rounded-lg transition">
                         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                       </button>
                     )}
                     {canDelete && (
                       <button onClick={() => removeRow(row)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg transition">
                         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                       </button>
                     )}
                   </div>
                 )}
              </div>
            )}
          </div>
        ))}
        {view.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">Chưa có sản phẩm.</div>}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200/80 shadow-sm">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "3.5rem" }} />
            <col />
            <col style={{ width: "9rem" }} />
            <col style={{ width: "5.5rem" }} />
            <col />
            <col />
            <col style={{ width: "3.5rem" }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200">
              <th className="py-2.5 px-3 bg-gray-50" />
              <SortTh label="Tên SP" field="name" />
              <SortTh label="Danh mục" field="category" />
              <SortTh label="TT" field="status" />
              <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Mô tả</th>
              <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Tags</th>
              <th className="py-2.5 px-3 bg-gray-50" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paged.map((row) => (
              <tr key={row.id} className="group hover:bg-blue-50/40 transition-colors">
                <td className="py-2 px-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200/60 cursor-pointer hover:ring-2 hover:ring-blue-400 transition"
                    onClick={() => { const raw = firstImg(row); raw && setImgModal(raw); }}>
                    {firstImg(row) ? <img src={fixThumbUrl(firstImg(row), 96)} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
                  </div>
                </td>
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <input className="w-full px-2 py-1 border rounded-lg text-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    : <div><div className="font-medium text-gray-900 truncate">{row.name}</div><div className="text-[10px] text-gray-400">ID: {row.id}</div></div>}
                </td>
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <select className="w-full px-2 py-1 border rounded-lg text-sm" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
                    : <span className="text-gray-600 text-xs">{catLabel(row.category) || "—"}</span>}
                </td>
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
                    : <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${row.active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}><span className={`w-1.5 h-1.5 rounded-full ${row.active ? "bg-emerald-500" : "bg-gray-400"}`} />{row.active ? "Active" : "Hidden"}</span>}
                </td>
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <textarea className="w-full px-2 py-1 border rounded-lg text-sm min-h-[2rem]" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Mô tả…" />
                    : <span className="text-xs text-gray-500 line-clamp-2">{row.description || "—"}</span>}
                </td>
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <input className="w-full px-2 py-1 border rounded-lg text-sm" value={Array.isArray(draft.tags) ? draft.tags.join(", ") : (draft.tags || "")} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="tag1, tag2" />
                    : <div className="flex flex-wrap gap-0.5">{tagsArr(row.tags).map((t, i) => <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] border border-gray-200/60">{t}</span>)}{!tagsArr(row.tags).length && <span className="text-gray-300 text-xs">—</span>}</div>}
                </td>
                <td className="py-2 px-3 text-right">
                  {editId === row.id ? (
                    <div className="flex flex-col gap-1">
                      <button onClick={saveEdit} className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition">Save</button>
                      <button onClick={cancelEdit} className="px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100 rounded transition">✕</button>
                    </div>
                  ) : (
                     (canEdit || canDelete) && (
                       <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {canEdit && (
                           <button onClick={() => startEdit(row)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Sửa">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                           </button>
                         )}
                         {canDelete && (
                           <button onClick={() => removeRow(row)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Xoá">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                           </button>
                         )}
                       </div>
                     )
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">Chưa có sản phẩm.</div>}
      </div>
    </div>

      {/* Image Lightbox Modal */}
      {imgModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={() => setImgModal(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={imgModal} alt=""
              className="block rounded-2xl shadow-2xl object-contain"
              style={{ width: 320, height: 320 }}
              onError={e => {
                const m = imgModal.match(/[?&]id=([a-zA-Z0-9_-]+)/) || imgModal.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (m && !e.currentTarget.src.includes('lh3')) {
                  e.currentTarget.src = `https://lh3.googleusercontent.com/d/${m[1]}=w400`;
                }
              }}
            />
            <button onClick={() => setImgModal(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-900 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
