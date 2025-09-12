
export function genId(){ return Math.random().toString(36).slice(2,10); }
export function ensureArray(x){ return Array.isArray(x) ? x : (x ? [x] : []); }
export function pick(obj, keys){ const out={}; keys.forEach(k=>{out[k]=obj[k]}); return out; }
