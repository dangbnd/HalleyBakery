// src/App.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LS, readLS, writeLS } from "./utils.js";
import { DATA } from "./data.js";
import { encodeState, decodeState } from "./utils/urlState.js";

import Header from "./components/Header.jsx";
import { Footer } from "./components/Footer.jsx";
import { Hero } from "./components/Hero.jsx";
import CategoryBar from "./components/CategoryBar.jsx";
import Filters from "./components/Filters.jsx";
import FilterSheet from "./components/FilterSheet.jsx";
import { ProductList } from "./components/ProductList.jsx";
import ProductQuickView from "./components/ProductQuickView.jsx";
import PageViewer from "./components/PageViewer.jsx";
import MessageButton from "./components/MessageButton.jsx";
import BackToTop from "./components/BackToTop.jsx";
import AnnouncementTicker from "./components/AnnouncementTicker.jsx";

// import Login from "./components/Admin/Login.jsx";
// import Admin from "./components/Admin/index.jsx";

import { readProductTabsFromEnv, fetchProductsFromTabs } from "./services/sheets.multi.js";
import {
  fetchSheetRows, fetchTabAsObjects, fetchFbUrls,
  mapProducts, mapCategories, mapTags, mapMenu, mapPages,
  mapTypes, mapLevels, mapSizes, enrichProductPricing, mapAnnouncements,
} from "./services/sheets.js";

/* ---------------- helpers ---------------- */

const priceMinOf = (p) => {
  const vals = [];
  if (Array.isArray(p?.pricing?.table)) for (const r of p.pricing.table) {
    const n = +r?.price; if (Number.isFinite(n) && n > 0) vals.push(n);
  }
  if (p?.priceBySize && typeof p.priceBySize === "object")
    for (const v of Object.values(p.priceBySize)) { const n = +v; if (Number.isFinite(n) && n > 0) vals.push(n); }
  const base = +p?.price; if (Number.isFinite(base) && base > 0) vals.push(base);
  return vals.length ? Math.min(...vals) : null;
};

const allPrices = (p = {}) => {
  const vals = [];
  if (Array.isArray(p?.pricing?.table)) for (const r of p.pricing.table) { const n = Number(r?.price); if (Number.isFinite(n) && n > 0) vals.push(n); }
  if (p?.priceBySize && typeof p.priceBySize === "object") for (const v of Object.values(p.priceBySize)) { const n = Number(v); if (Number.isFinite(n) && n > 0) vals.push(n); }
  const base = Number(p?.price); if (Number.isFinite(base) && base > 0) vals.push(base);
  return vals;
};

const norm = (s = "") => s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normFb = (u) => { try { const x = new URL(u); x.search = ""; x.hash = ""; return x.toString(); } catch { return u; } };
const HOME_LIMITS = { default: 8 };

const cmpNameNatural = (a = "", b = "") =>
  String(a || "").localeCompare(String(b || ""), "vi", { numeric: true, sensitivity: "base" });
const cmpDefault = (a, b) => {
  const ao = Number.isFinite(+a?.order);
  const bo = Number.isFinite(+b?.order);
  if (ao && bo && +a.order !== +b.order) return +a.order - +b.order;
  if (ao !== bo) return ao ? -1 : 1;            // có order đứng trước
  return cmpNameNatural(a.name, b.name);        // không có order ⇒ theo tên
};

/* -------------- Menu helpers -------------- */
const titleOf = (it) => String(it.title ?? it.label ?? it.key).replace(/^"(.*)"$/, "$1");

function buildTreeFromFlat(nav = []) {
  if (nav.some((n) => Array.isArray(n.children))) return nav;
  const map = new Map(nav.map((it) => [it.key, { ...it, children: [] }]));
  const roots = [];
  nav.forEach((it) => {
    const node = map.get(it.key);
    if (it.parent && map.has(it.parent)) map.get(it.parent).children.push(node);
    else roots.push(node);
  });
  const sort = (arr = []) => arr.sort((a, b) => (+a.order || 0) - (+b.order || 0)).forEach((n) => sort(n.children));
  sort(roots); return roots;
}
function findNodeByKey(nodes = [], key) { for (const n of nodes) { if (n.key === key) return n; const f = findNodeByKey(n.children || [], key); if (f) return f; } return null; }
function getProductCategoriesFromMenu(menu = []) {
  const tree = buildTreeFromFlat(menu); const product = findNodeByKey(tree, "product"); if (!product) return [];
  const out = []; const walk = (n) => { if (n.key && n.key !== "product") out.push({ key: n.key, title: titleOf(n) }); (n.children || []).forEach(walk); };
  walk(product); return out;
}
function buildDescIndex(menu = []) {
  const tree = buildTreeFromFlat(menu); const product = findNodeByKey(tree, "product"); const idx = new Map();
  const gather = (node) => { const kids = node.children || []; if (!kids.length) return [node.key];
    const leaves = kids.flatMap(gather); if (node.key) idx.set(node.key, new Set(leaves.filter((k) => k !== node.key))); return leaves; };
  if (product) gather(product); return idx;
}
const inMenuCat = (catKey, selectedKey, descIdx) => selectedKey === "all" || catKey === selectedKey || !!descIdx.get(selectedKey)?.has(catKey);
const stripAdmin = (nodes = []) => (nodes || []).filter((n) => n.key !== "admin").map((n) => ({ ...n, children: stripAdmin(n.children || []) }));
const scrollTop = () => window.scrollTo({ top: 0, left: 0, behavior: "smooth" });

/* ------------ Sort UI (count ⟷ dropdown) ------------ */
function SortDropdown({ value = "", onChange }) {
  const opts = [
    ["", "Mặc định"],
    ["price-asc", "Giá tăng dần"],
    ["price-desc", "Giá giảm dần"],
    ["name-asc", "Tên từ A–Z"],
    ["name-desc", "Tên từ Z–A"],
  ];

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-gray-600 hidden md:inline">Sắp xếp:</span>
      <div className="relative">
        <select
          aria-label="Sắp xếp"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="appearance-none rounded-full border border-gray-200 bg-white/80 pl-3 pr-8 py-1.5 text-sm shadow-sm hover:bg-white transition focus:outline-none focus:ring-2 focus:ring-rose-300/40 focus:border-rose-300"
        >
          {opts.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
        </select>
        <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8l4 4 4-4" /></svg>
      </div>
    </label>
  );
}

function HeaderRow({ count, sort, onSortChange }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="text-sm text-gray-600">{count} sản phẩm</div>
      <SortDropdown value={sort || ""} onChange={onSortChange} />
    </div>
  );
}

/* Chip tag đặt DƯỚI HeaderRow */
function ActiveFilters({ filterState, clearTag }) {
  const tags = [...(filterState?.tags || new Set())];
  if (!tags.length) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {tags.map((t) => (
        <button
          key={t}
          onClick={() => clearTag(t)}
          className="px-2 py-1 rounded-full border text-xs bg-gray-100 hover:bg-gray-200"
          title="Bỏ tag này"
        >
          #{t} ✕
        </button>
      ))}
      <button
        onClick={() => clearTag("*")}
        className="px-2 py-1 rounded-full border text-xs hover:bg-gray-100"
        title="Xóa tất cả lọc theo tag"
      >
        Xóa lọc tag
      </button>
    </div>
  );
}

/* =================== App =================== */
export default function App() {
  const [route, setRoute] = useState("home");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState(null);
  const [activeCat, setActiveCat] = useState("all");
  const [homeActive, setHomeActive] = useState("all");
  const [filterState, setFilterState] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersResetKey, setFiltersResetKey] = useState(0);

  const [user, setUser] = useState(() => readLS(LS.AUTH, null));
  const [fbUrls, setFbUrls] = useState(() => readLS(LS.FB_URLS, []));
  const [products, setProducts] = useState(() => readLS(LS.PRODUCTS, DATA.products || []));
  const [categories, setCategories] = useState(() => readLS(LS.CATEGORIES, DATA.categories || []));
  const [menu, setMenu] = useState(() => readLS(LS.MENU, DATA.nav || []));
  const [pages, setPages] = useState(() => readLS(LS.PAGES, DATA.pages || []));
  const [tags, setTags] = useState(() => readLS(LS.TAGS, DATA.tags || []));

  const SHEET = {
    id: import.meta.env.VITE_SHEET_ID,
    gid: import.meta.env.VITE_SHEET_GID || "0",
    gids: {
      products: import.meta.env.VITE_SHEET_GID_PRODUCTS || import.meta.env.VITE_SHEET_GID || "0",
      categories: import.meta.env.VITE_SHEET_GID_CATEGORIES,
      tags: import.meta.env.VITE_SHEET_GID_TAGS,
      menu: import.meta.env.VITE_SHEET_GID_MENU,
      pages: import.meta.env.VITE_SHEET_GID_PAGES,
      types: import.meta.env.VITE_SHEET_GID_TYPES,
      levels: import.meta.env.VITE_SHEET_GID_LEVELS,
      sizes: import.meta.env.VITE_SHEET_GID_SIZES,
      announcements: import.meta.env.VITE_SHEET_GID_ANNOUNCEMENTS,
    },
  };

  const [announcements, setAnnouncements] =
    useState(() => readLS(LS.ANNOUNCEMENTS, DATA.announcements || []));
  useEffect(() => writeLS(LS.ANNOUNCEMENTS, announcements), [announcements]);

  const SYNC_MS = Number(import.meta.env.VITE_SYNC_INTERVAL_MS || 600000);

  useEffect(() => writeLS(LS.AUTH, user), [user]);
  useEffect(() => writeLS(LS.PRODUCTS, products), [products]);
  useEffect(() => writeLS(LS.CATEGORIES, categories), [categories]);
  useEffect(() => writeLS(LS.MENU, menu), [menu]);
  useEffect(() => writeLS(LS.PAGES, pages), [pages]);
  useEffect(() => writeLS(LS.TAGS, tags), [tags]);
  useEffect(() => writeLS(LS.FB_URLS, fbUrls), [fbUrls]);

  /* URL -> state */
  useEffect(() => {
    const applyFromURL = () => {
      const s = decodeState(location.search);
      if (s.q) setQ(s.q);
      if (s.cat) setActiveCat(s.cat);
      if (s.view) setRoute(s.view);
      if ((s.cat && s.cat !== "all") || s.q) setRoute("search");
      if (s.filters) { setFilterState(s.filters); setFiltersResetKey((k) => k + 1); }
    };
    applyFromURL();
    window.addEventListener("popstate", applyFromURL);
    return () => window.removeEventListener("popstate", applyFromURL);
  }, []);

  /* state -> URL */
  useEffect(() => {
    const qs = encodeState({ route, q, cat: activeCat, filters: filterState });
    const base = qs ? `?${qs}` : location.pathname;
    const u = new URL(location.href);
    u.search = base.startsWith("?") ? base : "";
    if (route === "home" && homeActive && homeActive !== "all") u.hash = `#${homeActive}`;
    else u.hash = "";
    window.history.replaceState(null, "", u);
  }, [route, q, activeCat, filterState, homeActive]);

  /* FB urls */
  useEffect(() => {
    const SHEET_ID = import.meta.env.VITE_SHEET_ID;
    const FB_GID = import.meta.env.VITE_SHEET_FB_GID || import.meta.env.VITE_SHEET_GID_FB;
    if (!SHEET_ID || !FB_GID) return;
    (async () => {
      try { const urls = await fetchFbUrls({ sheetId: SHEET_ID, gid: FB_GID }); setFbUrls([...new Set(urls.map(normFb))]); }
      catch (e) { console.error("load FB sheet fail:", e); }
    })();
  }, []);

  /* tìm kiếm -> route */
  useEffect(() => {
    if (route === "admin") return;
    const has = q.trim().length > 0;
    if (has && route !== "search") setRoute("search");
    if (!has && route === "search") setRoute(activeCat !== "all" ? activeCat : "all");
  }, [q, route, activeCat]);

  /* admin shortcuts */
  useEffect(() => { if (location.hash === "#admin") setRoute("admin"); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") { e.preventDefault(); setRoute("admin"); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* deep-link QuickView */
  useEffect(() => {
    const pid = new URL(location.href).searchParams.get("pid");
    if (!pid || !products?.length) return;
    const p = (products || []).find((x) => String(x.id) === pid);
    if (p) setQuick(p);
  }, [products]);

  /* đồng bộ dữ liệu */
  useEffect(() => {
    async function syncAll() {
      let prodRows;
      const tabsEnv = (import.meta.env?.VITE_PRODUCT_TABS || "").trim();
      if (tabsEnv) {
        const tabs = readProductTabsFromEnv();
        const rows = await fetchProductsFromTabs({
          sheetId: SHEET.id, tabs,
          normalize: (r) => ({
            ...r,
            images: String(r.images || r.image || "")
              .replace(/\|/g, ",").replace(/\n/g, ",").split(",").map((s) => s.trim()).filter(Boolean).join(","),
            price: String(r.price || r.gia || ""),
            sizes: String(r.sizes || r.size || r.Sizes || r.Size || ""),
            priceBySize: r.pricebysize ?? r.priceBySize ?? "",
            description: String(r.description || r.desc || r.mo_ta || "").trim(),
          }),
        });
        prodRows = rows;
      } else {
        prodRows = await fetchSheetRows({ sheetId: SHEET.id, gid: SHEET.gids.products || "0" });
      }

      const fromSheet = mapProducts(prodRows, null);

      let types = [], levels = [];
      try {
        if (SHEET.gids.types) {
          const trows = await fetchTabAsObjects({ sheetId: SHEET.id, gid: SHEET.gids.types });
          types = mapTypes(trows); writeLS(LS.TYPES, types);
        } else types = readLS(LS.TYPES, []);
        if (SHEET.gids.levels) {
          const lrows = await fetchTabAsObjects({ sheetId: SHEET.id, gid: SHEET.gids.levels });
          levels = mapLevels(lrows); writeLS(LS.LEVELS, levels);
        } else levels = readLS(LS.LEVELS, []);
      } catch (e) { console.error("load types/levels fail:", e); }

      if (fromSheet?.length) {
        const enriched = fromSheet.map((p) => enrichProductPricing(p, types, levels));
        setProducts(enriched); writeLS(LS.PRODUCTS, enriched);
        const cats = [...new Set(enriched.map((p) => p.category).filter(Boolean))];
        if (cats.length) {
          const existed = new Set((categories || []).map((c) => c.key));
          const add = cats.filter((k) => !existed.has(k)).map((k) => ({ key: k, title: k }));
          if (add.length) { const next = [...(categories || []), ...add]; setCategories(next); writeLS(LS.CATEGORIES, next); }
        }
      }

      const loadOpt = async (gid, mapper, setter, lsKey) => {
        if (!gid) return;
        const rows = await fetchTabAsObjects({ sheetId: SHEET.id, gid });
        const mapped = mapper(rows);
        if (mapped?.length) { setter(mapped); writeLS(lsKey, mapped); }
      };
      await Promise.all([
        loadOpt(SHEET.gids.categories, mapCategories, setCategories, LS.CATEGORIES),
        loadOpt(SHEET.gids.tags, mapTags, setTags, LS.TAGS),
        loadOpt(SHEET.gids.menu, mapMenu, setMenu, LS.MENU),
        loadOpt(SHEET.gids.pages, mapPages, setPages, LS.PAGES),
        loadOpt(SHEET.gids.sizes, mapSizes, () => {}, LS.SIZES),
        loadOpt(SHEET.gids.announcements, mapAnnouncements, setAnnouncements, LS.ANNOUNCEMENTS),
      ]);
    }
    if (SHEET.id) { syncAll(); const t = setInterval(syncAll, SYNC_MS); return () => clearInterval(t); }
  }, [SHEET.id, SHEET.gid, SYNC_MS]); // eslint-disable-line

  /* lọc */
  function applyFilters(list = []) {
    if (!filterState) {
      // mặc định vẫn ưu tiên theo 'order'
      return [...list].sort(cmpDefault); /* => {
        const oa = Number.isFinite(a?.order) ? a.order : Infinity;
        const ob = Number.isFinite(b?.order) ? b.order : Infinity;
        if (oa !== ob) return oa - ob;
        if ((b.createdAt || 0) !== (a.createdAt || 0)) return (b.createdAt || 0) - (a.createdAt || 0);
        return cmpNameNatural(a.name, b.name);  // dùng natural sort
      }); */
    }
      
    const { price = [0, Number.MAX_SAFE_INTEGER], priceActive = false, tags: tagSet, sizes: sizeSet,
      levels: levelSet, featured, inStock, sort = "" } = filterState;
    const [min, max] = price;

    let out = list.filter((p) => {
      const priceOk = priceActive ? allPrices(p).some((v) => v >= min && v <= max) : true;
      const pTags = (p.tags || []).map(String);
      const tagOk = !tagSet?.size || pTags.some((id) => tagSet.has(id));
      const sizeOk = !sizeSet?.size || (p.sizes || []).some((s) => sizeSet.has(String(s)));
      const lvlOk = !levelSet?.size || (p.level && levelSet.has(String(p.level)));
      const featOk = !featured || !!p.banner;
      const stockOk = !inStock || p.inStock !== false;
      return priceOk && tagOk && sizeOk && lvlOk && featOk && stockOk;
    });

    // nếu user không chọn sort ⇒ áp thứ tự 'order'
    if (!sort) {
      out = [...out].sort(cmpDefault);/*  => {
        const oa = Number.isFinite(a?.order) ? a.order : Infinity;
        const ob = Number.isFinite(b?.order) ? b.order : Infinity;
        if (oa !== ob) return oa - ob;
        return (b.createdAt || 0) - (a.createdAt || 0) ||
          String(a.name||"").localeCompare(String(b.name||""), "vi", {sensitivity:"base"});
      }); */
    }

    if (sort === "price-asc") out = [...out].sort((a, b) => (priceMinOf(a) ?? Infinity) - (priceMinOf(b) ?? Infinity));
    if (sort === "price-desc") out = [...out].sort((a, b) => (priceMinOf(b) ?? -Infinity) - (priceMinOf(a) ?? -Infinity));
    if (sort === "name-asc")  out = [...out].sort((a,b)=> cmpNameNatural(a.name, b.name));
    if (sort === "name-desc") out = [...out].sort((a,b)=> cmpNameNatural(b.name, a.name));
    return out;
  }

  /* ======= danh mục ======= */
  const productCatsFromMenu = useMemo(() => getProductCategoriesFromMenu(menu), [menu]);
  const descByKey = useMemo(() => buildDescIndex(menu), [menu]);

  const menuCatsWithAll = useMemo(() => [{ key: "all", title: "Tất cả" }, ...productCatsFromMenu], [productCatsFromMenu]);
  const categoryKeysFromMenu = useMemo(() => new Set(productCatsFromMenu.map((c) => c.key)), [productCatsFromMenu]);

  /* list theo route */
  const baseForRoute = useMemo(() => {
    if (route === "home" || route === "search") return products || [];
    return (products || []).filter((p) => inMenuCat(p.category, route, descByKey));
  }, [route, products, descByKey]);
  const filteredForRoute = useMemo(() => applyFilters(baseForRoute), [filterState, baseForRoute]);

  /* list cho search */
  const nqVal = useMemo(() => q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), [q]);
  const catTitle = useMemo(() => Object.fromEntries(productCatsFromMenu.map((c) => [c.key, norm(c.title || c.key)])), [productCatsFromMenu]);
  const listForSearch = useMemo(() => {
    const base =
      activeCat === "all" ? products || [] : (products || []).filter((p) => inMenuCat(p.category, activeCat, descByKey));
    if (!nqVal) return base;
    return base.filter((p) => {
      const cat = norm(catTitle[p.category] || "");
      const nameN = norm(p.name || "");
      const tagsN = norm(Array.isArray(p.tags) ? p.tags.join(" ") : String(p.tags || ""));
      return nameN.includes(nqVal) || tagsN.includes(nqVal) || cat.includes(nqVal);
    });
  }, [nqVal, products, activeCat, catTitle, descByKey]);

  const customPage = useMemo(() => (pages || []).find((p) => p.key === route), [pages, route]);

  /* ===== Scroll-spy trang chủ ===== */
  const catbarRef = useRef(null);
  const sectionRefs = useRef({});
  const sectionTopsRef = useRef([]);
  const suppressSpyUntilRef = useRef(0);
  const rafRef = useRef(0);

  const homeSections = useMemo(() => {
    if (route !== "home") return [];
    const arr = [];
    const sortFn = (a, b) => (b.popular || 0) - (a.popular || 0) || (b.createdAt || 0) - (a.createdAt || 0);
    for (const cat of productCatsFromMenu) {
      const limit = HOME_LIMITS?.[cat.key] ?? HOME_LIMITS?.default ?? 6;
      const items = (filteredForRoute || []).filter((p) => p.category === cat.key).sort(sortFn).slice(0, limit);
      if (items.length) arr.push({ key: cat.key, title: cat.title, items });
    }
    return arr;
  }, [route, productCatsFromMenu, filteredForRoute]);

  const getOffset = useCallback(() => {
    const el = catbarRef.current; if (!el) return 0;
    const topCss = parseFloat(getComputedStyle(el).top) || 0;
    return topCss + el.offsetHeight;
  }, []);

  const recalcSectionTops = useCallback(() => {
    sectionTopsRef.current = homeSections.map(({ key }) => {
      const el = sectionRefs.current[key];
      const topAbs = el ? el.getBoundingClientRect().top + window.scrollY : 0;
      return { key, topAbs };
    });
  }, [homeSections]);

  const scrollToSection = useCallback((key) => {
    const rec = sectionTopsRef.current.find((x) => x.key === key);
    const target = rec ? rec.topAbs - getOffset() - 8 : 0;
    suppressSpyUntilRef.current = performance.now() + 800;
    window.scrollTo({ top: target, behavior: "smooth" });
  }, [getOffset]);

  useEffect(() => {
    if (route !== "home") return;
    requestAnimationFrame(recalcSectionTops);
    const t = setTimeout(recalcSectionTops, 300);
    window.addEventListener("resize", recalcSectionTops);
    window.addEventListener("load", recalcSectionTops);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", recalcSectionTops);
      window.removeEventListener("load", recalcSectionTops);
    };
  }, [route, recalcSectionTops]);

  useEffect(() => {
    if (route !== "home") return;
    const keyFromHash = () => decodeURIComponent(location.hash.replace(/^#/, ""));
    let stopped = false;
    const tryScroll = (tries = 0) => {
      const key = keyFromHash(); if (!key) return;
      const el = sectionRefs.current[key];
      if (el) { recalcSectionTops(); suppressSpyUntilRef.current = performance.now() + 1000; scrollToSection(key); setHomeActive(key); return; }
      if (!stopped && tries < 60) setTimeout(() => tryScroll(tries + 1), 100);
    };
    tryScroll();
    const onHash = () => { stopped = false; tryScroll(0); };
    window.addEventListener("hashchange", onHash);
    return () => { stopped = true; window.removeEventListener("hashchange", onHash); };
  }, [route, homeSections, recalcSectionTops, scrollToSection]);

  useEffect(() => {
    if (route !== "home") return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (performance.now() < suppressSpyUntilRef.current) return;
        const y = window.scrollY + getOffset() + 8;
        const tops = sectionTopsRef.current; if (!tops.length) return;
        let idx = -1; for (let i = 0; i < tops.length; i++) { if (tops[i].topAbs <= y) idx = i; else break; }
        const key = idx < 0 ? "all" : tops[idx].key;
        if (key !== homeActive) {
          const curIdx = tops.findIndex((t) => t.key === homeActive);
          if (idx >= 0 && curIdx >= 0) { const boundary = tops[idx].topAbs; if (Math.abs(y - boundary) < 40) return; }
          setHomeActive(key);
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
  }, [route, homeActive, getOffset]);

  /* -------- Navigation -------- */
  const resetSearchAndFilters = () => { if (q) setQ(""); if (filterState) setFilterState(null); setFiltersOpen(false); setFiltersResetKey((k) => k + 1); };

  function handlePickCategory(key) {
    resetSearchAndFilters();
    if (route === "home") {
      if (key === "all") { scrollTop(); setHomeActive("all"); const u = new URL(location.href); u.hash = ""; history.replaceState(null, "", u); }
      else { setActiveCat(key); setRoute(key); const u = new URL(location.href); u.hash = ""; history.replaceState(null, "", u); }
      return;
    }
    if (key === "all") { setActiveCat("all"); setRoute("search"); } else { setActiveCat(key); setRoute(key); }
  }

  function navigate(key) {
    resetSearchAndFilters(); setRoute(key);
    if (key === "home") { setActiveCat("all"); setHomeActive("all"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" })); }
    else if (categoryKeysFromMenu.has(key)) setActiveCat(key);
  }

  useEffect(() => { scrollTop(); }, [route, activeCat]);

  const menuPublic = useMemo(() => stripAdmin(menu), [menu]);

  /* gợi ý search (không chứa tag) */
  const suggestions = useMemo(() => {
    const query = q.trim(); if (!query) return [];
    const nq = norm(query); const top = (arr, n) => arr.slice(0, n);
    const prod = top((products || []).filter((p) => norm(p.name).includes(nq)).map((p) => ({ type: "sản phẩm", label: p.name, id: p.id })), 5);
    const cat = top((getProductCategoriesFromMenu(menu) || []).filter((c) => norm(c.title || c.key).includes(nq)).map((c) => ({ type: "danh mục", label: c.title || c.key, key: c.key })), 5);
    return [...cat, ...prod].slice(0, 10);
  }, [q, products, menu]);

  function handleSuggestionSelect(s) {
    if (s.type === "danh mục" && s.key) { handlePickCategory(s.key); return; }
    setQ(s.label); setRoute("search");
  }

  const currentKeyForBar = route === "home" ? homeActive : route === "search" ? activeCat : route;

  const CatBar = (
    <div ref={catbarRef} id="hb-catbar" className="sticky top-[96px] md:top-[117px] z-30">
      <div className="max-w-6xl mx-auto px-4">
        <div className="relative bg-gray-50/50 supports-[backdrop-filter]:bg-gray-50/50 backdrop-blur border rounded-xl">
          <CategoryBar
            categories={menuCatsWithAll}
            currentKey={currentKeyForBar}
            onPick={handlePickCategory}
            onOpenFilters={() => { if (route === "home") setRoute("all"); setFiltersOpen(true); }}
            showFilterButton
          />
        </div>
      </div>
    </div>
  );

  const openQuick = useCallback((p) => {
    setQuick(p);
    const u = new URL(location.href); u.searchParams.set("pid", String(p.id)); window.history.pushState(null, "", u);
  }, []);
  const closeQuick = useCallback(() => {
    setQuick(null); const u = new URL(location.href); u.searchParams.delete("pid"); window.history.pushState(null, "", u);
  }, []);

  /* click tag từ QuickView */
  const handlePickTagFromQuickView = useCallback((tag) => {
    const t = String(tag || ""); if (!t) return;
    setQ(""); setFilterState((st) => ({ ...(st || {}), tags: new Set([t]) }));
    setActiveCat("all"); setRoute("search"); closeQuick(); scrollTop();
  }, [closeQuick]);

  /* clear tag chips */
  const clearTag = (t) => {
    setFilterState((st) => {
      if (!st?.tags?.size) return st;
      const next = new Set(st.tags);
      if (t === "*") next.clear(); else next.delete(t);
      const res = { ...(st || {}), tags: next };
      if (next.size === 0) delete res.tags;
      return res;
    });
  };

  /* --------------- render --------------- */
  let mainContent = null;

  if (customPage) {
    mainContent = <PageViewer page={customPage} />;
  } else if (route === "search") {
    const base = listForSearch;
    const list = applyFilters(base);
    const activeTitle =
      activeCat === "all"
        ? "Tất cả"
        : getProductCategoriesFromMenu(menu).find((c) => c.key === activeCat)?.title || activeCat;
    mainContent = (
      <>
        {CatBar}
        <section className="max-w-6xl mx-auto p-4">
          <h2 className="text-xl font-semibold mb-2">{activeTitle}...</h2>
          <HeaderRow
            count={list.length}
            sort={filterState?.sort}
            onSortChange={(v) => setFilterState((s) => ({ ...(s || {}), sort: v }))}
          />
          <ActiveFilters filterState={filterState} clearTag={clearTag} />
          <ProductList products={list} onImageClick={openQuick} filter={filterState} />
        </section>
      </>
    );
  } else {
    const isHome = route === "home";
    const list = filteredForRoute;
    mainContent = (
      <>
        {isHome && (
          <Hero
            products={products}
            interval={2000}
            fbUrls={fbUrls}
            onBannerClick={(p) => { setQuick(p); const u = new URL(location.href); u.searchParams.set("pid", String(p.id)); window.history.pushState(null, "", u); }}
          />
        )}
        {CatBar}

        {isHome ? (
          <section className="max-w-6xl mx-auto p-4 space-y-10">
            {getProductCategoriesFromMenu(menu).map(({ key, title }) => {
              const items = (list || []).filter((p) => p.category === key).slice(0, HOME_LIMITS?.[key] ?? HOME_LIMITS.default);
              if (!items.length) return null;
              return (
                <div key={key} ref={(el) => (sectionRefs.current[key] = el)}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <button className="text-rose-600 hover:underline" onClick={() => { navigate(key); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" })); }}>Xem tất cả</button>
                  </div>
                  <ProductList products={items} onImageClick={openQuick} />
                </div>
              );
            })}
          </section>
        ) : (
          <section className="max-w-6xl mx-auto p-4">
            <HeaderRow
              count={list.length}
              sort={filterState?.sort}
              onSortChange={(v) => setFilterState((s) => ({ ...(s || {}), sort: v }))}
            />
            <ActiveFilters filterState={filterState} clearTag={clearTag} />
            <ProductList products={list} onImageClick={openQuick} filter={filterState} />
          </section>
        )}
      </>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <Header
        currentKey={route}
        navItems={menuPublic}
        onNavigate={navigate}
        logoText={DATA.logoText}
        logoSrcDesktop={DATA.logoDesktop}
        logoSrcMobile={DATA.logoMobile}
        logoSrc={DATA.logoUrl}
        hotline={DATA.hotline}
        searchQuery={q}
        onSearchChange={setQ}
        onSearchSubmit={(qq) =>
          setRoute(qq.trim() ? "search" : activeCat !== "all" ? activeCat : "all")
        }
        suggestions={suggestions}
        onSuggestionSelect={handleSuggestionSelect}
      />
      <AnnouncementTicker items={announcements} />
      <main>{mainContent}</main>

      {quick && (
        <ProductQuickView
          product={quick}
          onClose={closeQuick}
          onPickTag={handlePickTagFromQuickView}
        />
      )}

      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Bộ lọc">
        <Filters
          key={filtersResetKey}
          products={route === "search" ? listForSearch : baseForRoute}
          tags={tags}
          onChange={setFilterState}
        />
      </FilterSheet>

      <Footer data={DATA.footer} />
      <BackToTop />
      <MessageButton />
    </div>
  );
}
