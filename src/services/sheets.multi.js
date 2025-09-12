export function readProductTabsFromEnv() {
  const raw = import.meta.env?.VITE_PRODUCT_TABS || "";
  return raw.split(",").map(s=>s.trim()).filter(Boolean).map(pair=>{
    const [gid,key] = pair.split(":").map(t=>t.trim());
    return { gid:String(gid), key:key||"" };
  });
}
async function fetchGViz({ sheetId, gid }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&t=${Date.now()}`;
  const txt = await fetch(url, { cache: "no-store" }).then(r=>r.text());
  const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}")+1));
  const cols = json.table.cols.map(c => (c.label || c.id || "").toString());
  return (json.table.rows||[]).map(r=>{
    const o={}; cols.forEach((c,i)=>{ o[c||`col_${i}`]=r.c?.[i]?.v ?? ""; }); return o;
  });
}
function slugify(s=""){return s.toString().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)+/g,"");}
export async function fetchProductsFromTabs({ sheetId, tabs, normalize }) {
  const lists = await Promise.all(tabs.map(async t=>{
    const rows = await fetchGViz({ sheetId, gid:t.gid });
    return rows.map(r=>{
      const base={...r,_tab_gid:t.gid,_tab_key:t.key,category:r.category||r.type||t.key};
      return normalize?normalize(base):base;
    });
  }));
  const flat = lists.flat(); const seen=new Set(); const out=[];
  for (const p of flat) {
    const k=p.id||p.ID||p.sku||p.SKU||p.code||p.slug||`${slugify(p.name||p.title||"")}-${p._tab_gid}`;
    if (!seen.has(k)) { seen.add(k); out.push({ ...p, _id:k }); }
  }
  return out;
}
