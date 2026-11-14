import test from "node:test";
import assert from "node:assert/strict";
import { mapProducts } from "../src/services/sheets.js";
import { normalizeProductRow } from "../api/all.js";

test("mapProducts maps sameDay flag and appends banh-trong-ngay alias without changing primary category", () => {
  const rows = [
    { id: "1", name: "Mẫu A", category: "hoa-qua", sameDay: "TRUE" },
    { id: "2", name: "Mẫu B", category: "bltm", banhTrongNgay: "x" },
    { id: "3", name: "Mẫu C", category: "100k", trong_ngay: "1" },
    { id: "4", name: "Mẫu D", category: "hoa-qua", sameDay: "" },
  ];
  const mapped = mapProducts(rows);
  assert.equal(mapped.length, 4);

  assert.equal(mapped[0].sameDay, true);
  assert.equal(mapped[0].category, "hoa-qua");
  assert.ok(mapped[0].categories.includes("hoa-qua"));
  assert.ok(mapped[0].categories.includes("banh-trong-ngay"));

  assert.equal(mapped[1].sameDay, true);
  assert.ok(mapped[1].categories.includes("banh-trong-ngay"));

  assert.equal(mapped[2].sameDay, true);
  assert.ok(mapped[2].categories.includes("banh-trong-ngay"));

  assert.equal(mapped[3].sameDay, false);
  assert.deepEqual(mapped[3].categories, ["hoa-qua"]);
});

test("normalizeProductRow preserves sameDay from supported column names", () => {
  const rowA = normalizeProductRow({ id: "10", name: "Cake 1", category: "hoa-qua", sameDay: "TRUE" });
  const rowB = normalizeProductRow({ id: "11", name: "Cake 2", category: "bltm", banh_trong_ngay: "x" });
  const rowC = normalizeProductRow({ id: "12", name: "Cake 3", category: "100k" });

  assert.equal(rowA.sameDay, "TRUE");
  assert.equal(rowB.sameDay, "x");
  assert.equal(rowC.sameDay, undefined);
});
