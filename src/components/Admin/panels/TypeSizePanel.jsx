// src/components/Admin/panels/TypeSizePanel.jsx
import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Section, Toolbar, Badge } from "../ui/primitives.jsx";
import { Table } from "../ui/table.jsx";
import { Tabs } from "../ui/tabs.jsx";
import { readLS, writeLS } from "../../../utils.js";
import { genId } from "../shared/helpers.js";
import { listSheet, insertToSheet, updateToSheet, deleteFromSheet } from "../shared/sheets.js";

/* ---------- helpers ---------- */
const safe = (x) => (Array.isArray(x) ? x.filter(v => v && typeof v === "object") : []);
const s = (v) => (v == null ? "" : String(v));

const sizeKey = (z) => {
  const c = String(z?.code || "").trim();
  const h = Number(z?.height || 0) || 0;
  return `${c}-${h}`;
};
const sizeLabel = (z) => `${z?.label || z?.code}${z?.height ? ` - cao ${z.height}cm` : ""}`;

const parseMaybeJSON = (v) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t) return t;
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { return JSON.parse(t); } catch { return v; }
  }
  return v;
};

const notEmptySize = (r) =>
  !!(s(r?.code).trim() || s(r?.label).trim() || s(r?.height).trim());
const notEmptyType = (r) =>
  !!(s(r?.code).trim() || s(r?.name).trim() || (Array.isArray(r?.sizeCodes) && r.sizeCodes.filter(Boolean).length));

const normType = (row) => ({
  id: s(row.id) || genId(),
  code: s(row.code).trim(),
  name: s(row.name).trim(),
  // sizeCodes lưu KEY: "code-height"
  sizeCodes: Array.isArray(row.sizeCodes)
    ? row.sizeCodes.filter(Boolean).map(s)
    : (Array.isArray(parseMaybeJSON(row.sizeCodes)) ? parseMaybeJSON(row.sizeCodes) : s(row.sizeCodes).split(/[\s,|]+/)).filter(Boolean).map(s),
  createdAt: row.createdAt || new Date().toISOString(),
});

const normSize = (row) => ({
  id: s(row.id) || genId(),
  code: s(row.code).trim(),
  label: s(row.label).trim(),
  height: String(Number(row.height || 0) || 0),
  createdAt: row.createdAt || new Date().toISOString(),
});

/* ---------- main ---------- */
export default function TypeSizePanel() {
  const [types, setTypes] = useState(() => safe(readLS("types") || []));
  const [sizes, setSizes] = useState(() => safe(readLS("sizes") || []));
  const [qType, setQType] = useState("");
  const [qSize, setQSize] = useState("");
  const [tab, setTab] = useState("types");
  const verT = useRef(""); const verS = useRef("");

  // pull từ Google Sheet → LS → UI
  useEffect(() => {
    let t; let alive = true;
    const loop = async () => {
      try {
        const a = await listSheet("Types");
        if (a?.ok && a.version !== verT.current) {
          verT.current = a.version;
          const rows = safe(a.rows).map(normType).filter(notEmptyType);
          setTypes(rows); writeLS("types", rows);
        }
      } catch {}
      try {
        const b = await listSheet("Sizes");
        if (b?.ok && b.version !== verS.current) {
          verS.current = b.version;
          const rows = safe(b.rows).map(normSize).filter(notEmptySize);
          setSizes(rows); writeLS("sizes", rows);
        }
      } catch {}
      if (alive) t = setTimeout(loop, 7000);
    };
    loop(); return () => { alive = false; clearTimeout(t); };
  }, []);

  // nâng cấp dữ liệu cũ: code / code@h / code@@h -> key "code-h"
  useEffect(() => {
    if (!sizes.length || !types.length) return;
    const need = types.some(t => (t.sizeCodes || []).some(v => /@@|@/.test(String(v))));
    if (!need) return;
    const byCodeToKey = sizes.reduce((m, z) => { (m[z.code] ||= []).push(sizeKey(z)); return m; }, {});
    const upgraded = types.map(t => ({
      ...t,
      sizeCodes: (t.sizeCodes || []).map(v => {
        const sv = String(v);
        if (sv.includes('@@')) { const [c, h] = sv.split('@@'); return `${c}-${Number(h) || 0}`; }
        if (sv.includes('@'))  { const [c, h] = sv.split('@');  return `${c}-${Number(h) || 0}`; }
        return byCodeToKey[sv]?.[0] || sv;
      })
    }));
    setTypes(upgraded);
    writeLS("types", upgraded);
  }, [sizes]); // chạy khi có sizes

  // mirror sang key cũ "typeSize" (để phần khác đọc)
  useEffect(() => {
    const byKey = new Map(sizes.map(s => [sizeKey(s), s]));
    const byCode = new Map(sizes.map(z => [z.code, z])); // fallback cho dữ liệu cũ
    const mirror = types.map(t => ({
      type: t.code,
      name: t.name,
      sizes: (t.sizeCodes || []).map(k => {
        const z = byKey.get(k) || byCode.get(k);
        return z ? { code: z.code, label: z.label, height: z.height } : { code: k };
      }),
    }));
    writeLS("typeSize", mirror);
  }, [types, sizes]);

  return (
    <Section title="Loại bánh & Size" actions={<Toolbar />}>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          {
            key: "types",
            label: "Loại bánh",
            children: (
              <div className="space-y-3">
                <Toolbar>
                  <Input placeholder="Tìm loại..." value={qType} onChange={(e)=>setQType(e.target.value)} />
                </Toolbar>
                <TypesTable
                  data={safe(types).filter(x => (x.code + x.name).toLowerCase().includes(qType.toLowerCase()))}
                  allSizes={sizes}
                  onLocalChange={(rows)=>{ setTypes(rows); writeLS("types", rows); }}
                />
              </div>
            ),
          },
          {
            key: "sizes",
            label: "Size",
            children: (
              <div className="space-y-3">
                <Toolbar>
                  <Input placeholder="Tìm size..." value={qSize} onChange={(e)=>setQSize(e.target.value)} />
                </Toolbar>
                <SizesTable
                  data={safe(sizes).filter(x => (x.code + x.label).toLowerCase().includes(qSize.toLowerCase()))}
                  onLocalChange={(rows)=>{
                    setSizes(rows); writeLS("sizes", rows);
                    // loại tham chiếu size đã xóa dựa theo KEY
                    const exists = new Set(rows.map(sizeKey));
                    const nextTypes = safe(types).map(t => ({
                      ...t, sizeCodes: (t.sizeCodes||[]).filter(k => exists.has(k))
                    }));
                    setTypes(nextTypes); writeLS("types", nextTypes);
                  }}
                />
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}

/* ---------- TYPES (thêm trên đầu, ghi sheet khi Lưu) ---------- */
function TypesTable({ data, allSizes, onLocalChange }) {
  const rows = safe(data).map(normType).filter(notEmptyType);
  const [rowNew, setRowNew] = useState({ code: "", name: "", sizeCodes: [] });
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  const dirtyNew = !!(rowNew.code || rowNew.name || (rowNew.sizeCodes||[]).length);
  const canSaveNew = !!(s(rowNew.code).trim() && s(rowNew.name).trim());

  function commitNew(){
    if (!canSaveNew) return;
    const item = normType({ id: genId(), code: rowNew.code, name: rowNew.name, sizeCodes: rowNew.sizeCodes });
    insertToSheet("Types", item);                 // fire-and-forget
    onLocalChange([item, ...rows]);               // optimistic
    setRowNew({ code: "", name: "", sizeCodes: [] });
  }
  function commitEdit(row){
    const clean = normType({ ...row, code: draft.code, name: draft.name, sizeCodes: draft.sizeCodes });
    updateToSheet("Types", clean);
    onLocalChange(rows.map(r => r.id === row.id ? clean : r));
    setEditId(null); setDraft(null);
  }
  function remove(row){
    deleteFromSheet("Types", row.id);
    onLocalChange(rows.filter(r => r.id !== row.id));
  }

  const list = [{ id: "__new__" }, ...rows];

  return (
    <Table
      columns={[
        { title:"Mã", dataIndex:"code", thClass:"w-40" },
        { title:"Tên hiển thị", dataIndex:"name" },
        { title:"Sizes áp dụng", dataIndex:"sizeCodes" },
        { title:"", dataIndex:"actions", thClass:"w-40" },
      ]}
      data={list}
      rowRender={(row)=> row.id==="__new__" ? (
        <tr key="__new__">
          <td className="px-3 py-2">
            <InlineInput value={rowNew.code} onChange={(v)=>setRowNew({...rowNew, code:v})} placeholder="vd: tron" />
          </td>
          <td className="px-3 py-2">
            <InlineInput value={rowNew.name} onChange={(v)=>setRowNew({...rowNew, name:v})} placeholder="Bánh tròn" />
          </td>
          <td className="px-3 py-2">
            <InlineMulti sizeList={allSizes} codes={rowNew.sizeCodes} onChange={(codes)=>setRowNew({...rowNew, sizeCodes:codes})}/>
          </td>
          <td className="px-3 py-2 text-right">
            <div className="flex justify-end gap-2">
              <Button disabled={!canSaveNew} onClick={commitNew}>Lưu</Button>
              <Button variant="ghost" disabled={!dirtyNew} onClick={()=>setRowNew({ code:"", name:"", sizeCodes:[] })}>Huỷ</Button>
            </div>
          </td>
        </tr>
      ) : (
        <tr key={row.id}>
          <td className="px-3 py-2">
            {editId===row.id ? <InlineInput value={draft.code} onChange={(v)=>setDraft({...draft, code:v})}/> : row.code}
          </td>
          <td className="px-3 py-2">
            {editId===row.id ? <InlineInput value={draft.name} onChange={(v)=>setDraft({...draft, name:v})}/> : row.name}
          </td>
          <td className="px-3 py-2">
            {editId===row.id
              ? <InlineMulti sizeList={allSizes} codes={draft.sizeCodes||[]} onChange={(codes)=>setDraft({...draft, sizeCodes:codes})}/>
              : <SizeListChips sizeCodes={row.sizeCodes||[]} sizeList={allSizes||[]} />}
          </td>
          <td className="px-3 py-2 text-right">
            {editId===row.id ? (
              <div className="flex justify-end gap-2">
                <Button onClick={()=>commitEdit(row)}>Lưu</Button>
                <Button variant="ghost" onClick={()=>{ setEditId(null); setDraft(null); }}>Huỷ</Button>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={()=>{ setEditId(row.id); setDraft({...row}); }}>Sửa</Button>
                <Button variant="danger" onClick={()=>remove(row)}>Xoá</Button>
              </div>
            )}
          </td>
        </tr>
      )}
    />
  );
}

/* ---------- SIZES ---------- */
function SizesTable({ data, onLocalChange }) {
  const rows = safe(data).map(normSize).filter(notEmptySize);
  const [rowNew, setRowNew] = useState({ code: "", label: "", height: "" });
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  const dirtyNew = !!(rowNew.code || rowNew.label || rowNew.height);
  const canSaveNew = !!(s(rowNew.code).trim() && s(rowNew.label).trim());

  function commitNew(){
    if (!canSaveNew) return;
    const item = normSize({ id: genId(), code: rowNew.code, label: rowNew.label, height: rowNew.height });
    insertToSheet("Sizes", item);
    onLocalChange([item, ...rows]);
    setRowNew({ code: "", label: "", height: "" });
  }
  function commitEdit(row){
    const clean = normSize({ ...row, code: draft.code, label: draft.label, height: draft.height });
    updateToSheet("Sizes", clean);
    onLocalChange(rows.map(r => r.id === row.id ? clean : r));
    setEditId(null); setDraft(null);
  }
  function remove(row){
    deleteFromSheet("Sizes", row.id);
    onLocalChange(rows.filter(r => r.id !== row.id));
  }

  const list = [{ id: "__new__" }, ...rows];

  return (
    <Table
      columns={[
        { title:"", thClass:"w-8" },
        { title:"Mã", dataIndex:"code", thClass:"w-28" },
        { title:"Nhãn", dataIndex:"label" },
        { title:"Cao (cm)", dataIndex:"height", thClass:"w-28" },
        { title:"", dataIndex:"actions", thClass:"w-40" },
      ]}
      data={list}
      rowRender={(row)=> row.id==="__new__" ? (
        <tr key="__new__">
          <td className="px-3 py-2"><span className="text-gray-200 select-none">⋮⋮</span></td>
          <td className="px-3 py-2"><InlineInput value={rowNew.code} onChange={(v)=>setRowNew({...rowNew, code:v})} placeholder="vd: 20x20" /></td>
          <td className="px-3 py-2"><InlineInput value={rowNew.label} onChange={(v)=>setRowNew({...rowNew, label:v})} placeholder="Size 20x20" /></td>
          <td className="px-3 py-2"><InlineInput value={rowNew.height} onChange={(v)=>setRowNew({...rowNew, height:v})} placeholder="10" /></td>
          <td className="px-3 py-2 text-right">
            <div className="flex justify-end gap-2">
              <Button disabled={!canSaveNew} onClick={commitNew}>Lưu</Button>
              <Button variant="ghost" disabled={!dirtyNew} onClick={()=>setRowNew({ code:"", label:"", height:"" })}>Huỷ</Button>
            </div>
          </td>
        </tr>
      ) : (
        <tr key={row.id}>
          <td className="px-3 py-2"><span className="cursor-grab text-gray-400">⋮⋮</span></td>
          <td className="px-3 py-2">{editId===row.id ? <InlineInput value={draft.code} onChange={(v)=>setDraft({...draft, code:v})}/> : row.code}</td>
          <td className="px-3 py-2">{editId===row.id ? <InlineInput value={draft.label} onChange={(v)=>setDraft({...draft, label:v})}/> : row.label}</td>
          <td className="px-3 py-2">{editId===row.id ? <InlineInput value={draft.height} onChange={(v)=>setDraft({...draft, height:v})}/> : row.height}</td>
          <td className="px-3 py-2 text-right">
            {editId===row.id ? (
              <div className="flex justify-end gap-2">
                <Button onClick={()=>commitEdit(row)}>Lưu</Button>
                <Button variant="ghost" onClick={()=>{ setEditId(null); setDraft(null); }}>Huỷ</Button>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={()=>{ setEditId[row.id]; setDraft({...row}); }}>Sửa</Button>
                <Button variant="danger" onClick={()=>remove(row)}>Xoá</Button>
              </div>
            )}
          </td>
        </tr>
      )}
    />
  );
}

/* ---------- UI bits ---------- */
function SizeListChips({ sizeCodes = [], sizeList = [] }) {
  const byKey = new Map(sizeList.map(s => [sizeKey(s), s]));
  return (
    <div className="flex flex-wrap gap-1">
      {sizeCodes.map(k => <Badge key={k}>{sizeLabel(byKey.get(k) || {code:k})}</Badge>)}
    </div>
  );
}

function InlineMulti({ sizeList = [], codes = [], onChange }) {
  const opts = sizeList.map(s => ({ key: sizeKey(s), label: sizeLabel(s) }));
  const chosen = Array.isArray(codes) ? [...codes] : [];
  const chosenSet = new Set(chosen);
  const avail = opts.filter(o => !chosenSet.has(o.key));

  function dragStart(e, i){ e.dataTransfer.setData("text/plain", String(i)); }
  function drop(e, i){
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isNaN(from) || from===i) return;
    const arr = [...chosen]; const [m] = arr.splice(from,1); arr.splice(i,0,m);
    onChange(arr);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {chosen.map((k,i)=>(
          <div key={k}
               className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-white cursor-move"
               draggable onDragStart={(e)=>dragStart(e,i)} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>drop(e,i)}>
            <span className="font-medium">{opts.find(o=>o.key===k)?.label || k}</span>
            <button type="button" onClick={()=> onChange(chosen.filter(x=>x!==k))}>✕</button>
          </div>
        ))}
        {chosen.length===0 && <span className="text-xs text-gray-500">Chưa chọn size.</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {avail.map(o => (
          <button key={o.key} type="button" className="px-2 py-0.5 rounded border text-xs bg-gray-50"
                  onClick={()=> onChange([...chosen, o.key])}>+ {o.label}</button>
        ))}
      </div>
    </div>
  );
}

function InlineInput({ value, onChange, onEnter, ...props }) {
  return (
    <input
      className="w-full px-2 py-1 border rounded-lg"
      value={value ?? ""}
      onChange={(e)=>onChange?.(e.target.value)}
      onKeyDown={(e)=>{ if(e.key==="Enter") onEnter?.(); }}
      {...props}
    />
  );
}
