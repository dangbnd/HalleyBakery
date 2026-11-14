import test from "node:test";
import assert from "node:assert/strict";

import adminAuthHandler from "../api/admin-auth.js";
import gsProxyHandler from "../api/gs-proxy.js";
import {
  cfgFromRequest,
  mergeRuntimeCatalogConfig,
  normalizeProductRow,
  shouldForceRefresh,
} from "../api/all.js";
import {
  publicConfig,
  resolveRuntimeRequestConfig,
} from "../api/runtime-config.js";
import { canUseAdminProxy } from "../api/_admin-auth.js";
import {
  hasReliableCreatedAtMetadata,
  hasStockMetadata,
} from "../src/lib/catalogIntegrity.js";
import { mapProducts } from "../src/services/sheets.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = typeof body === "string" ? JSON.parse(body) : body;
      return this;
    },
    end() {
      return this;
    },
  };
}

test("forged client state cannot create an admin server session", async () => {
  const res = responseRecorder();
  await adminAuthHandler({ method: "GET", headers: {}, socket: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.authenticated, false);
});

test("admin Sheet proxy rejects requests without signed session cookie", async () => {
  const res = responseRecorder();
  await gsProxyHandler({ method: "POST", headers: {}, socket: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Unauthorized");
});

test("runtime config exposes only public allowlisted keys and valid gids", () => {
  const result = publicConfig({
    sheet_id: "sheet",
    sheet_gid_config: "777",
    sheet_gid_menu: "10",
    sheet_gid_tags: "99",
    gs_webapp_token: "secret",
    gemini_api_keys: "secret",
    super_admin_email: "owner@example.com",
  }, new Set(["10"]));

  assert.deepEqual(result, {
    sheet_id: "sheet",
    sheet_gid_menu: "10",
    sheet_gid_tags: "",
  });
});

test("production runtime config ignores client-provided Sheet and config GID", () => {
  assert.deepEqual(
    resolveRuntimeRequestConfig(
      { sheetId: "client-sheet-id", gidConfig: "777" },
      {}
    ),
    {
      configuredSheetId: "",
      requestedSheetId: "client-sheet-id",
      sheetId: "",
      gidConfig: "",
    }
  );
});

test("local runtime config may use explicit client config when server config is absent", () => {
  const result = resolveRuntimeRequestConfig(
    { sheetId: "local-sheet-id", gidConfig: "777" },
    { VERCEL_DEV: "1" }
  );
  assert.equal(result.sheetId, "local-sheet-id");
  assert.equal(result.gidConfig, "777");
});

test("unified API uses server GIDs and ignores client overrides", () => {
  const cfg = cfgFromRequest(
    {
      query: {
        sheetId: "attacker-sheet-id",
        gidMenu: "999",
        gidProducts: "888",
      },
    },
    {
      OG_SHEET_ID: "server-sheet-id",
      OG_MENU_GID: "10",
      VITE_SHEET_GID_PRODUCTS: "20",
    }
  );

  assert.equal(cfg.sheetId, "server-sheet-id");
  assert.equal(cfg.gidMenu, "10");
  assert.equal(cfg.gidProducts, "20");
});

test("validated runtime catalog config overrides stale env GIDs only", () => {
  const base = cfgFromRequest(
    { query: {} },
    {
      OG_SHEET_ID: "server-sheet-id",
      OG_PRODUCT_TABS: "100:basic",
      OG_MENU_GID: "10",
      VITE_SHEET_GID_TAGS: "20",
    }
  );
  const merged = mergeRuntimeCatalogConfig(base, {
    product_tabs: "101:basic;102:boy",
    sheet_gid_menu: "11",
    sheet_gid_tags: "",
    sheet_id: "attacker-sheet-id",
  });

  assert.equal(merged.sheetId, "server-sheet-id");
  assert.equal(merged.productTabs, "101:basic;102:boy");
  assert.equal(merged.gidMenu, "11");
  assert.equal(merged.gidTags, "");
});

test("unified API accepts request config only in local dev", () => {
  const query = {
    sheetId: "local-sheet-id",
    gidMenu: "10",
    gidProducts: "20",
  };
  assert.equal(cfgFromRequest({ query }, {}).sheetId, "");

  const local = cfgFromRequest({ query }, { VERCEL_DEV: "1" });
  assert.equal(local.sheetId, "local-sheet-id");
  assert.equal(local.gidMenu, "10");
  assert.equal(local.gidProducts, "20");
});

test("public requests cannot force bypass unified API cache", () => {
  assert.equal(shouldForceRefresh({ force: "1" }, {}), false);
  assert.equal(shouldForceRefresh({ force: "1" }, { VERCEL_DEV: "1" }), true);
});

test("manager cannot modify sensitive admin sheets", () => {
  const manager = { role: "manager" };
  assert.equal(canUseAdminProxy(manager, { action: "update", sheet: "Users" }), false);
  assert.equal(canUseAdminProxy(manager, { action: "update", sheet: "Người dùng" }), false);
  assert.equal(canUseAdminProxy(manager, { action: "insert", sheet: "Config" }), false);
  assert.equal(canUseAdminProxy(manager, { action: "insert", sheet: "Cấu hình" }), false);
  assert.equal(canUseAdminProxy(manager, { action: "update", sheet: "Products" }), true);
  assert.equal(canUseAdminProxy({ role: "owner" }, { action: "update", sheet: "Users" }), true);
});

test("createdAt survives lowercase CSV header normalization", () => {
  const product = normalizeProductRow({
    id: "1",
    name: "Cake",
    createdat: "2026-07-24",
  });
  assert.equal(product.createdAt, "2026-07-24");
});

test("active=false hides product without turning it into a banner", () => {
  const normalized = normalizeProductRow({ id: "1", name: "Cake", active: "true" });
  assert.equal(Object.hasOwn(normalized, "banner"), false);

  const [product] = mapProducts([{ id: "1", name: "Cake", active: "false" }]);
  assert.equal(product.visibility, "hidden");
  assert.equal(product.banner, false);
});

test("stock and newest controls require meaningful source metadata", () => {
  const products = Array.from({ length: 100 }, (_, index) => ({
    id: String(index + 1),
    createdAt: index === 0 ? "2026-07-24" : "",
  }));
  assert.equal(hasStockMetadata(products), false);
  assert.equal(hasReliableCreatedAtMetadata(products), false);
  assert.equal(hasStockMetadata([{ inStock: false }]), true);
  assert.equal(hasReliableCreatedAtMetadata([
    { createdAt: "2026-07-23" },
    { createdAt: "2026-07-24" },
  ]), true);
});
