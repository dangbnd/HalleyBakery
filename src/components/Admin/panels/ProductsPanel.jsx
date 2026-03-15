// src/components/Admin/panels/ProductsPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { readLS, writeLS, audit } from "../../../utils.js";
import { listSheet, updateToSheet, deleteFromSheet } from "../shared/sheets.js";
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
  active: !!(row.active ?? true),
  images: Array.isArray(row.images) ? row.images : normImages(parseMaybeJSON(row.images ?? row.image)),
  description: s(row.description || row.desc || ""),
  tags: s(row.tags || ""),
  createdAt: row.createdAt || new Date().toISOString(),
});

/* ====================== MAIN ====================== */
export default function ProductsPanel() {
  const [products, setProducts] = useState(() => safe(readLS("products") || []));
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [page, setPage] = useState(1);
  const verP = useRef("");

  useEffect(() => {
    let t, alive = true;
    const loop = async () => {
      try {
        const a = await listSheet("Products");
        if (a?.ok && a.version !== verP.current) {
          verP.current = a.version;
          const rows = safe(a.rows).map(normProduct).filter((p) => !!s(p.name).trim());
          setProducts(rows); writeLS("products", rows);
        }
      } catch { }
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

  function startEdit(row) { setEditId(row.id); setDraft({ ...row, images: [...(row.images || [])] }); }
  function cancelEdit() { setEditId(null); setDraft(null); }
  async function saveEdit() {
    const clean = normProduct({ ...draft, images: normImages(draft.image || draft.images) });
    try {
      await updateToSheet("Products", clean);
      const next = products.map((p) => (p.id === editId ? clean : p));
      setProducts(next);
      writeLS("products", next);
      audit("product.update", { id: clean.id, name: clean.name, user: (readLS("auth") || {}).username || "?" });
      cancelEdit();
    } catch (e) {
      console.error("update Products failed:", e);
      alert("Không cập nhật được sản phẩm.");
    }
  }
  async function removeRow(row) {
    try {
      await deleteFromSheet("Products", row.id);
      const next = products.filter((p) => p.id !== row.id);
      setProducts(next);
      writeLS("products", next);
      audit("product.delete", { id: row.id, name: row.name, user: (readLS("auth") || {}).username || "?" });
    } catch (e) {
      console.error("delete Products failed:", e);
      alert("Không xoá được sản phẩm.");
    }
  }

  /* Pagination */
  const Pagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between py-2 px-1">
        <span className="text-xs text-gray-400">
          {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, view.length)} / {view.length}
        </span>
        <div className="flex items-center gap-1">
          <PgBtn onClick={() => setPage(1)} disabled={safePage === 1}>«</PgBtn>
          <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹</PgBtn>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
            const p = start + i;
            if (p > totalPages) return null;
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`px-2.5 py-1 text-xs rounded border transition ${p === safePage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}
              >{p}</button>
            );
          })}
          <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</PgBtn>
          <PgBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</PgBtn>
        </div>
      </div>
    );
  };
  const PgBtn = ({ children, ...p }) => <button {...p} className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition">{children}</button>;

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

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* ===== FIXED HEADER ===== */}
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          <select className={`h-7 px-2 pr-6 text-[11px] font-medium rounded-full border appearance-none bg-no-repeat transition cursor-pointer focus:outline-none ${catFilter ? "bg-purple-50 text-purple-700 border-purple-200" : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"}`}
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 6px center" }}
            value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">📁 Tất cả danh mục ({products.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{catLabel(c)} ({products.filter(p => p.category === c).length})</option>
            ))}
          </select>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input className="h-9 pl-9 pr-4 w-60 border border-gray-200 rounded-lg bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              placeholder="Tìm theo tên, ID, tag..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <Pagination />
      </div>

      {/* ===== SCROLLABLE TABLE (single table = aligned columns) ===== */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200/80 shadow-sm">
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
                {/* Thumb */}
                <td className="py-2 px-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200/60">
                    {firstImg(row) ? <img src={fixThumbUrl(firstImg(row), 96)} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
                  </div>
                </td>
                {/* Name */}
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <input className="w-full px-2 py-1 border rounded-lg text-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    : <div><div className="font-medium text-gray-900 truncate">{row.name}</div><div className="text-[10px] text-gray-400">ID: {row.id}</div></div>}
                </td>
                {/* Category */}
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <select className="w-full px-2 py-1 border rounded-lg text-sm" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
                    : <span className="text-gray-600 text-xs">{catLabel(row.category) || "—"}</span>}
                </td>
                {/* Status */}
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
                    : <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${row.active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}><span className={`w-1.5 h-1.5 rounded-full ${row.active ? "bg-emerald-500" : "bg-gray-400"}`} />{row.active ? "Active" : "Hidden"}</span>}
                </td>
                {/* Description */}
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <textarea className="w-full px-2 py-1 border rounded-lg text-sm min-h-[2rem]" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Mô tả…" />
                    : <span className="text-xs text-gray-500 line-clamp-2">{row.description || "—"}</span>}
                </td>
                {/* Tags */}
                <td className="py-2 px-3">
                  {editId === row.id
                    ? <input className="w-full px-2 py-1 border rounded-lg text-sm" value={Array.isArray(draft.tags) ? draft.tags.join(", ") : (draft.tags || "")} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="tag1, tag2" />
                    : <div className="flex flex-wrap gap-0.5">{tagsArr(row.tags).map((t, i) => <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] border border-gray-200/60">{t}</span>)}{!tagsArr(row.tags).length && <span className="text-gray-300 text-xs">—</span>}</div>}
                </td>
                {/* Actions */}
                <td className="py-2 px-3 text-right">
                  {editId === row.id ? (
                    <div className="flex flex-col gap-1">
                      <button onClick={saveEdit} className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition">Save</button>
                      <button onClick={cancelEdit} className="px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100 rounded transition">✕</button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(row)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Sửa">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                      </button>
                      <button onClick={() => removeRow(row)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Xoá">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">Chưa có sản phẩm.</div>}
      </div>
    </div>
  );
}


