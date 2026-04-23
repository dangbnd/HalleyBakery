/**
 * ========== DRIVE ⇄ SHEET MASTER TOOL (OPTIMIZED V21 + UPLOAD API + CONFIG SYNC) ==========
 * Bao gồm:
 * - Sync ảnh / Fix ID
 * - API update row / update tags
 * - API drive: list folders, list leaf folders, list file hashes, upload file
 * - API sheet: list, insert, update, delete (cho admin panel)
 * - API config: batch save / load (đồng bộ cấu hình admin)
 */

// --- 1. CẤU HÌNH ---
const CFG = {
  rootFolderId: "1kc6cjMeqTOkUNuhusjIL-fyOHYy0smje",
  nameFormat: "brackets", // 'brackets' => Tên (1) | 'dash' => Tên-1
  colNameAliases: ["name", "tên", "ten", "tên sp", "product"],
  colImagesAliases: ["images", "image", "ảnh", "hinh", "link ảnh", "url"],
  colThumbAliases: ["thumbnail", "thumb", "ảnh nhỏ", "preview", "minh họa"],
  colIdAliases: ["id", "stt", "mã", "code", "product_id", "sku"],
  colCategoryAliases: ["category", "danh mục", "nhóm", "loại", "key"],
  colTagsAliases: ["tags", "tag", "thẻ"],
  headerRow: 1,
};
const MENU_CFG = { sheetName: "Menu", colKey: "key", colLabel: "key" };

// --- 2. MENU & UI ---
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚀 Drive Master V21")
    .addItem("⚠️ 1. Đánh lại toàn bộ ID (Fix trùng)", "toolFixDuplicateIDs")
    .addSeparator()
    .addItem("📥 2. Import ảnh mới (ID tăng dần)", "actionImportOnly")
    .addItem("🧹 3. Tìm & Xóa ảnh đã mất", "actionCleanDeleted")
    .addItem("🔥 4. Chạy Full (Thêm + Xóa)", "actionFullSync")
    .addSeparator()
    .addItem("🗑️ 5. Xóa Cache", "toolClearCache")
    .addItem("📡 6. Test kết nối", "toolTestConnection")
    .addToUi();
}

// --- 3. CÁC TOOL CHỨC NĂNG ---
function toolFixDuplicateIDs() {
  const ui = SpreadsheetApp.getUi();
  if (
    ui.alert(
      "⚠️ CẢNH BÁO",
      "Đánh lại ID toàn bộ sheet từ 1 -> N để sửa lỗi trùng lặp. Tiếp tục?",
      ui.ButtonSet.YES_NO
    ) != ui.Button.YES
  )
    return;

  const sh = SpreadsheetApp.getActiveSheet();
  const info = detectColumns_(sh);
  if (!info || !info.idCol) return toast_("❌ Không tìm thấy cột ID");

  const lastRow = sh.getLastRow();
  if (lastRow <= info.headerRow) return;

  const numRows = lastRow - info.headerRow;
  const newIds = Array.from({ length: numRows }, (_, i) => [i + 1]);
  sh.getRange(info.headerRow + 1, info.idCol, numRows, 1).setValues(newIds);
  toast_(`✅ Đã reset ID từ 1 đến ${numRows}.`);
}

function actionImportOnly() {
  coreSyncProcess_({ add: true, delete: false, sort: true });
}
function actionCleanDeleted() {
  coreSyncProcess_({ add: false, delete: true, sort: true });
}
function actionFullSync() {
  coreSyncProcess_({ add: true, delete: true, sort: true });
}
function toolClearCache() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  toast_("Đã xóa Cache.");
}
function toolTestConnection() {
  try {
    DriveApp.getFolderById(CFG.rootFolderId);
    toast_("Kết nối OK");
  } catch (e) {
    toast_("Lỗi ID Folder");
  }
}

function toolTestConnectionVerbose() {
  try {
    const f = DriveApp.getFolderById(CFG.rootFolderId);
    Logger.log("OK | id=" + f.getId() + " | name=" + f.getName());
    SpreadsheetApp.getActive().toast("Kết nối OK: " + f.getName(), "Master", 5);
  } catch (e) {
    Logger.log("ERROR: " + (e && e.message));
    SpreadsheetApp.getActive().toast("Lỗi: " + (e && e.message), "Master", 8);
    throw e;
  }
}

function debugDriveFolderApi() {
  const id = String(CFG.rootFolderId || "").trim();
  Logger.log("ID = " + id);
  Logger.log("ActiveUser = " + Session.getActiveUser().getEmail());
  Logger.log("EffectiveUser = " + Session.getEffectiveUser().getEmail());

  const token = ScriptApp.getOAuthToken();
  const url = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?fields=id,name,mimeType";
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });

  Logger.log("HTTP = " + res.getResponseCode());
  Logger.log("Body = " + res.getContentText());
}


// --- 4. CORE SYNC LOGIC ---
function coreSyncProcess_(opts) {
  const sh = SpreadsheetApp.getActiveSheet();
  const info = detectColumns_(sh);
  if (!info) return toast_("❌ Lỗi xác định cột.");

  const { mapper, validKeys } = loadSmartMenu_(SpreadsheetApp.getActive());
  let sheetMap = new Map(),
    nameCount = {},
    maxGlobalID = 0;

  // Quét Sheet
  if (info.lastRow > info.headerRow) {
    sh.getRange(info.headerRow + 1, 1, info.lastRow - info.headerRow, sh.getLastColumn())
      .getValues()
      .forEach((row, i) => {
        const url = String(row[info.imagesCol - 1] || "");
        const mId = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (mId) sheetMap.set(mId[1], info.headerRow + 1 + i);

        const name = String(row[info.nameCol - 1] || "").trim();
        const mName = name.match(/^(.*?)\s*[\(-](\d+)[\)]?$/);
        if (mName) {
          const k = mName[1].trim(),
            n = parseInt(mName[2], 10);
          nameCount[k] = Math.max(nameCount[k] || 0, n);
        }

        if (info.idCol) {
          const cId = parseInt(row[info.idCol - 1], 10);
          if (!isNaN(cId) && cId > maxGlobalID) maxGlobalID = cId;
        }
      });
  }

  // Quét Drive
  toast_("⏳ Đang quét Drive...");
  const driveFiles = [],
    driveIds = new Set();
  try {
    const processFolder = (folder, pCat) => {
      const cat = findSmartKey_(folder.getName(), mapper, validKeys) || pCat;
      const files = folder.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        if (/^image\//i.test(f.getMimeType())) {
          const fid = f.getId();
          driveIds.add(fid);
          if (opts.add && !sheetMap.has(fid)) {
            driveFiles.push({ id: fid, date: f.getDateCreated(), name: folder.getName(), cat: cat || "" });
          }
        }
      }
      const subs = folder.getFolders();
      while (subs.hasNext()) processFolder(subs.next(), cat);
    };
    processFolder(DriveApp.getFolderById(CFG.rootFolderId), null);
  } catch (e) {
    return SpreadsheetApp.getUi().alert("❌ Lỗi: " + e.message);
  }

  // Xóa
  if (opts.delete && sheetMap.size > 0) {
    const toDel = [...sheetMap]
      .filter(([k]) => !driveIds.has(k))
      .map(([, v]) => v)
      .sort((a, b) => b - a);

    toDel.forEach((r) => sh.deleteRow(r));
    if (toDel.length) toast_(`🗑️ Đã xóa ${toDel.length} dòng.`);
  }

  // Thêm
  if (opts.add && driveFiles.length > 0) {
    driveFiles.sort((a, b) => a.date - b.date);
    const newData = driveFiles.map((f) => {
      nameCount[f.name] = (nameCount[f.name] || 0) + 1;
      maxGlobalID++;
      const row = new Array(sh.getMaxColumns()).fill("");

      row[info.nameCol - 1] =
        CFG.nameFormat === "brackets"
          ? `${f.name} (${nameCount[f.name]})`
          : `${f.name}-${nameCount[f.name]}`;

      row[info.imagesCol - 1] = `https://drive.google.com/uc?export=view&id=${f.id}`;
      if (info.catCol) row[info.catCol - 1] = f.cat;
      if (info.idCol) row[info.idCol - 1] = maxGlobalID;
      if (info.thumbCol) {
        row[info.thumbCol - 1] = `=IMAGE("https://drive.google.com/thumbnail?id=${f.id}&sz=w160"; 3)`;
      }
      return row;
    });

    sh.getRange(sh.getLastRow() + 1, 1, newData.length, sh.getMaxColumns()).setValues(newData);
    toast_(`📥 Đã thêm ${newData.length} ảnh.`);
  }

  if (opts.sort) sortSheetNaturally_(sh, info.headerRow, info.nameCol);
  toast_("🎉 Hoàn tất!");
}

// =====================================================================
// --- 5. API BACKEND (doPost / doGet) ---
// =====================================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonResp_({ ok: false, error: "Server busy" });

  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    if (e && e.parameter && e.parameter.payload) raw = e.parameter.payload;
    if (!raw) throw new Error("No data received");

    var data = JSON.parse(raw);

    // ── AUTH CHECK (nếu có token) ──
    // var authResult = HB_checkAuth_(data);
    // if (authResult && !authResult.ok) return jsonResp_(authResult);

    // ── CONFIG SYNC (batch save/load — 1 call cho tất cả config) ──
    var cfgHandled = HB_tryHandleConfigActions_(data);
    if (cfgHandled) return jsonResp_(cfgHandled);

    var trackingHandled = HB_tryHandleTrackingActions_(data);
    if (trackingHandled) return jsonResp_(trackingHandled);

    // ── DRIVE ACTIONS ──
    var driveHandled = HB_tryHandleDriveActions_(data);
    if (driveHandled) return jsonResp_(driveHandled);

    // ── SHEET CRUD (list / insert / update / delete) ──
    var sheetHandled = HB_tryHandleSheetActions_(data);
    if (sheetHandled) return jsonResp_(sheetHandled);

    // ── Legacy handlers ──
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (data.op === "update_tags") return handleUpdateTags_(ss, data);
    if (data.action === "update") return handleUpdateRow_(ss, data);

    return jsonResp_({ ok: false, error: "Unknown action/op" });
  } catch (err) {
    return jsonResp_({ ok: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var data = null;

    if (e && e.parameter && e.parameter.payload) {
      data = JSON.parse(e.parameter.payload);
    } else if (e && e.parameter && Object.keys(e.parameter).length) {
      data = e.parameter;
    }

    if (data) {
      var cfgHandled = HB_tryHandleConfigActions_(data);
      if (cfgHandled) return jsonResp_(cfgHandled);

      var trackingHandled = HB_tryHandleTrackingActions_(data);
      if (trackingHandled) return jsonResp_(trackingHandled);

      var driveHandled = HB_tryHandleDriveActions_(data);
      if (driveHandled) return jsonResp_(driveHandled);

      var sheetHandled = HB_tryHandleSheetActions_(data);
      if (sheetHandled) return jsonResp_(sheetHandled);

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (data.op === "update_tags") return handleUpdateTags_(ss, data);
      if (data.action === "update") return handleUpdateRow_(ss, data);
    }
  } catch (err) {
    return jsonResp_({ ok: false, error: err.toString() });
  }
  return jsonResp_({ ok: true, msg: "no action" });
}

// =====================================================================
// --- 5.1 SHEET CRUD: list / insert / update / delete ---
// =====================================================================
function HB_tryHandleSheetActions_(req) {
  var action = HB_s_(req && req.action).toLowerCase();
  var op = HB_s_(req && (req.op || req.operation)).toLowerCase();
  var act = action || op;

  if (!act) return null;

  // LIST
  if (act === "list" || act === "listrows" || act === "list_rows" || act === "sheet.list" || act === "rows.list") {
    return HB_sheetList_(req);
  }
  // INSERT
  if (act === "insert" || act === "add" || act === "append" || act === "create" ||
      act === "insertrow" || act === "appendrow" || act === "addrow" ||
      act === "sheet.insert" || act === "sheet.add" || act === "sheet.append" ||
      act === "rows.insert" || act === "rows.add" || act === "rows.append") {
    return HB_sheetInsert_(req);
  }
  // UPDATE
  if (act === "update" || act === "edit" || act === "patch" || act === "save" ||
      act === "updaterow" || act === "editrow" || act === "saverow" ||
      act === "sheet.update" || act === "sheet.edit" || act === "rows.update") {
    return HB_sheetUpdate_(req);
  }
  // DELETE
  if (act === "delete" || act === "remove" || act === "erase" ||
      act === "deleterow" || act === "removerow" ||
      act === "sheet.delete" || act === "rows.delete") {
    return HB_sheetDelete_(req);
  }

  return null;
}

function HB_resolveSheet_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = HB_s_(req.sheet || req.sheetName || req.tab || req.name);
  if (name) {
    var sh = ss.getSheetByName(name);
    if (sh) return sh;
    // Try case-insensitive
    var sheets = ss.getSheets();
    var lower = name.toLowerCase();
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().toLowerCase() === lower) return sheets[i];
    }
    return null;
  }
  return ss.getSheets()[0];
}

function HB_sheetToRows_(sh) {
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { headers: [], rows: [] };

  var headers = data[0].map(function(h) { return String(h || "").trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    var hasData = false;
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (val !== "" && val !== null && val !== undefined) hasData = true;
      obj[headers[j]] = val;
    }
    if (hasData) rows.push(obj);
  }
  return { headers: headers, rows: rows };
}

function HB_sheetList_(req) {
  try {
    var sh = HB_resolveSheet_(req);
    if (!sh) return { ok: false, error: "Sheet not found: " + HB_s_(req.sheet || req.sheetName || req.tab) };
    var result = HB_sheetToRows_(sh);
    return { ok: true, rows: result.rows, headers: result.headers, count: result.rows.length, version: String(Date.now()) };
  } catch (err) {
    return { ok: false, error: HB_s_(err && err.message) || "list error" };
  }
}

function HB_sheetInsert_(req) {
  try {
    var sh = HB_resolveSheet_(req);
    if (!sh) return { ok: false, error: "Sheet not found" };
    var rowData = req.row || req.data || req.rowData || {};
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) { return String(h || "").trim(); });

    var newRow = headers.map(function(h) {
      var hLower = h.toLowerCase();
      // Try exact match first
      if (rowData.hasOwnProperty(h)) return rowData[h] != null ? rowData[h] : "";
      if (rowData.hasOwnProperty(hLower)) return rowData[hLower] != null ? rowData[hLower] : "";
      // Try normalized match
      var norm = normalize_(h);
      for (var k in rowData) {
        if (normalize_(k) === norm) return rowData[k] != null ? rowData[k] : "";
      }
      return "";
    });

    sh.appendRow(newRow);
    return { ok: true, msg: "Inserted", row: rowData };
  } catch (err) {
    return { ok: false, error: HB_s_(err && err.message) || "insert error" };
  }
}

function HB_sheetUpdate_(req) {
  try {
    var sh = HB_resolveSheet_(req);
    if (!sh) return { ok: false, error: "Sheet not found" };
    var rowData = req.row || req.data || req.rowData || {};
    var rowId = HB_s_(rowData.id || rowData.ID || rowData.key || req.id || req.rowId);
    if (!rowId) return { ok: false, error: "Missing row id" };

    var data = sh.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h || "").trim(); });

    // Find ID column
    var idColIdx = -1;
    var idAliases = ["id", "stt", "mã", "code", "key", "product_id", "sku"];
    for (var j = 0; j < headers.length; j++) {
      if (idAliases.indexOf(headers[j].toLowerCase()) !== -1 || normalize_(headers[j]) === "id") {
        idColIdx = j;
        break;
      }
    }
    if (idColIdx === -1) idColIdx = 0; // fallback to first column

    // Find row
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idColIdx]).trim() === rowId) {
        rowIndex = i + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) return { ok: false, error: "Row not found: " + rowId };

    // Update cells
    for (var k in rowData) {
      if (k === "id" || k === "ID" || k === "_id") continue;
      var colIdx = -1;
      for (var c = 0; c < headers.length; c++) {
        if (headers[c] === k || headers[c].toLowerCase() === k.toLowerCase() || normalize_(headers[c]) === normalize_(k)) {
          colIdx = c;
          break;
        }
      }
      if (colIdx !== -1) {
        var cellVal = typeof rowData[k] === "object" ? JSON.stringify(rowData[k]) : rowData[k];
        sh.getRange(rowIndex, colIdx + 1).setValue(cellVal);
      }
    }

    return { ok: true, msg: "Updated row " + rowIndex };
  } catch (err) {
    return { ok: false, error: HB_s_(err && err.message) || "update error" };
  }
}

function HB_sheetDelete_(req) {
  try {
    var sh = HB_resolveSheet_(req);
    if (!sh) return { ok: false, error: "Sheet not found" };
    var rowId = HB_s_(req.id || req.rowId || req.key || (req.row && req.row.id));
    if (!rowId) return { ok: false, error: "Missing row id" };

    var data = sh.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h || "").trim(); });

    var idColIdx = -1;
    var idAliases = ["id", "stt", "mã", "code", "key", "product_id", "sku"];
    for (var j = 0; j < headers.length; j++) {
      if (idAliases.indexOf(headers[j].toLowerCase()) !== -1 || normalize_(headers[j]) === "id") {
        idColIdx = j;
        break;
      }
    }
    if (idColIdx === -1) idColIdx = 0;

    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idColIdx]).trim() === rowId) {
        sh.deleteRow(i + 1);
        return { ok: true, msg: "Deleted row " + (i + 1) };
      }
    }
    return { ok: false, error: "Row not found: " + rowId };
  } catch (err) {
    return { ok: false, error: HB_s_(err && err.message) || "delete error" };
  }
}

// =====================================================================
// --- 5.2 CONFIG SYNC (batch save / load — 1 call cho TẤT CẢ config) ---
// =====================================================================
var HB_CONFIG_SHEET_NAMES_ = ["URL", "Config", "config", "Settings", "Cau hinh"];

function HB_tryHandleConfigActions_(req) {
  var action = HB_effectiveAction_(req || {});
  if (!action) return null;
  var norm = HB_normKey_(action);

  if (norm === "configsave" || norm === "saveconfig" || norm === "configbatchsave" || norm === "batchsaveconfig") {
    return HB_batchSaveConfig_(req);
  }
  if (norm === "configload" || norm === "loadconfig" || norm === "configget" || norm === "getconfig") {
    return HB_loadConfig_(req);
  }
  return null;
}

function HB_findConfigSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < HB_CONFIG_SHEET_NAMES_.length; i++) {
    var sh = ss.getSheetByName(HB_CONFIG_SHEET_NAMES_[i]);
    if (sh) return sh;
  }
  return null;
}

/**
 * Batch save: nhận { config: { key1: val1, key2: val2, ... } }
 * Ghi tất cả vào tab URL/Config trong 1 lần — SIÊU NHANH.
 */
function HB_batchSaveConfig_(req) {
  try {
    var config = req.config || {};
    var keys = Object.keys(config);
    if (!keys.length) return { ok: true, count: 0, msg: "No config to save" };

    var sheet = HB_findConfigSheet_();
    if (!sheet) return { ok: false, msg: "Không tìm thấy tab URL/Config trong Sheet" };

    var data = sheet.getDataRange().getValues();
    var keyCol = 0;
    var valCol = 1;

    // Map key chuẩn hóa -> row index (0-based trong mảng data, bỏ header)
    var existingMap = {};
    for (var r = 1; r < data.length; r++) {
      var k = HB_normCfgKey_(data[r][keyCol]);
      if (k) existingMap[k] = r; // index trong mảng data
    }

    var toAppend = [];
    var updated = 0;
    for (var i = 0; i < keys.length; i++) {
      var rawKey = keys[i];
      var normKey = HB_normCfgKey_(rawKey);
      var value = String(config[rawKey] != null ? config[rawKey] : "");

      if (existingMap.hasOwnProperty(normKey)) {
        var rowIdx = existingMap[normKey];
        sheet.getRange(rowIdx + 1, valCol + 1).setValue(value); // 1-based
        updated++;
      } else {
        toAppend.push([rawKey, value]);
      }
    }

    if (toAppend.length > 0) {
      var lastRow = sheet.getLastRow();
      var appendRange = sheet.getRange(lastRow + 1, 1, toAppend.length, 2);
      appendRange.setValues(toAppend);
    }

    return { ok: true, count: keys.length, updated: updated, appended: toAppend.length, msg: "Config saved" };
  } catch (err) {
    return { ok: false, msg: String(err && err.message ? err.message : err) };
  }
}

function HB_normCfgKey_(v) {
  return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Load: trả về tất cả config dạng { config: { key: value, ... } }
 */
function HB_loadConfig_(req) {
  try {
    var sheet = HB_findConfigSheet_();
    if (!sheet) return { ok: true, config: {}, msg: "No config sheet found" };

    var data = sheet.getDataRange().getValues();
    var config = {};
    for (var r = 1; r < data.length; r++) {
      var key = String(data[r][0] || "").trim();
      var value = String(data[r][1] || "").trim();
      if (key) config[key] = value;
    }

    return { ok: true, config: config };
  } catch (err) {
    return { ok: false, msg: String(err && err.message ? err.message : err) };
  }
}

// =====================================================================
// --- 5.3 DRIVE ACTIONS ---
// =====================================================================
function HB_s_(v) {
  return v == null ? "" : String(v).trim();
}
function HB_normKey_(v) {
  return HB_s_(v).toLowerCase().replace(/[^a-z0-9]/g, "");
}
function HB_in_(needle, aliases) {
  var n = HB_normKey_(needle);
  for (var i = 0; i < aliases.length; i++) {
    if (n === HB_normKey_(aliases[i])) return true;
  }
  return false;
}
function HB_effectiveAction_(req) {
  var action = HB_s_(req && req.action);
  var op = HB_s_(req && (req.op || req.operation));
  if (action.toLowerCase() === "drive" && op) return op;
  return action || op;
}
function HB_pickRootFolderId_(req) {
  return HB_s_(req.rootFolderId || req.folderId || req.parentId || req.rootId || CFG.rootFolderId);
}

function HB_tryHandleDriveActions_(req) {
  var action = HB_effectiveAction_(req || {});
  if (!action) return null;

  if (
    HB_in_(action, [
      "drive.listLeafFolders", "drive_list_leaf_folders", "listDriveLeafFolders",
      "list_leaf_folders", "listLeafFolders", "driveListLeafFolders",
      "drive.list_leaf_folders", "drive/list_leaf_folders", "leaf_folders",
    ])
  ) {
    return HB_listLeafFolders_(req);
  }

  if (
    HB_in_(action, [
      "drive.listFolders", "drive_list_folders", "listDriveFolders",
      "list_folders", "listFolders", "driveListFolders",
      "drive.list_folders", "drive/list_folders", "driveFolders",
      "drive.folders", "folders.list",
    ])
  ) {
    return HB_listAllFolders_(req);
  }

  if (
    HB_in_(action, [
      "drive.listFileHashes", "drive_list_file_hashes", "listDriveFileHashes",
      "list_file_hashes", "listFiles", "list_files",
      "drive.list_files", "drive/list_files", "drive.listFiles",
      "driveListFiles", "drive.hashes", "drive.listFilesWithHash",
    ])
  ) {
    return HB_listFileHashes_(req);
  }

  if (
    HB_in_(action, [
      "drive.uploadFile", "drive_upload_file", "uploadDriveFile",
      "upload_file", "drive.upload_file", "drive/upload_file",
      "uploadFile", "driveUpload", "drive.uploadImage",
    ])
  ) {
    return HB_uploadFile_(req);
  }

  return null;
}

function HB_listAllFolders_(req) {
  try {
    var rootId = HB_pickRootFolderId_(req || {});
    if (!rootId) return { ok: false, msg: "Missing rootFolderId" };
    var rows = HB_collectFolders_(rootId, true);
    return { ok: true, rows: rows, folders: rows, count: rows.length };
  } catch (err) {
    return { ok: false, msg: HB_s_(err && err.message) || "list folders error" };
  }
}

function HB_listLeafFolders_(req) {
  try {
    var rootId = HB_pickRootFolderId_(req || {});
    if (!rootId) return { ok: false, msg: "Missing rootFolderId" };
    var rows = HB_collectFolders_(rootId, false);
    return { ok: true, rows: rows, folders: rows, count: rows.length };
  } catch (err) {
    return { ok: false, msg: HB_s_(err && err.message) || "list leaf folders error" };
  }
}

function HB_collectFolders_(rootId, includeNonLeaf) {
  var root = DriveApp.getFolderById(rootId);
  var out = [];
  var stack = [{ folder: root, parentId: "", level: 0, path: root.getName() }];

  while (stack.length) {
    var node = stack.pop();
    var childIt = node.folder.getFolders();
    var children = [];
    while (childIt.hasNext()) children.push(childIt.next());

    var hasChildren = children.length > 0;
    var isRoot = node.folder.getId() === rootId;

    if (!isRoot && (includeNonLeaf || !hasChildren)) {
      out.push({
        id: node.folder.getId(),
        name: node.folder.getName(),
        path: node.path,
        parentId: node.parentId,
        level: node.level,
        hasChildren: hasChildren,
      });
    }

    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      stack.push({
        folder: c,
        parentId: node.folder.getId(),
        level: node.level + 1,
        path: node.path + "/" + c.getName(),
      });
    }
  }
  return out;
}

function HB_listFileHashes_(req) {
  try {
    var rootId = HB_pickRootFolderId_(req || {});
    if (!rootId) return { ok: false, msg: "Missing rootFolderId" };
    var rows = HB_collectFileHashesRecursive_(rootId);
    return { ok: true, rows: rows, files: rows, count: rows.length };
  } catch (err) {
    return { ok: false, msg: HB_s_(err && err.message) || "list file hashes error" };
  }
}

function HB_collectFileHashesRecursive_(rootFolderId) {
  var token = ScriptApp.getOAuthToken();
  var queue = [rootFolderId];
  var visited = {};
  var out = [];

  while (queue.length) {
    var folderId = queue.shift();
    if (!folderId || visited[folderId]) continue;
    visited[folderId] = true;

    var pageToken = "";
    do {
      var q = "'" + folderId + "' in parents and trashed=false";
      var fields =
        "nextPageToken,files(id,name,mimeType,parents,webViewLink,size,md5Checksum,sha1Checksum,sha256Checksum)";
      var url =
        "https://www.googleapis.com/drive/v3/files" +
        "?q=" + encodeURIComponent(q) +
        "&fields=" + encodeURIComponent(fields) +
        "&pageSize=1000" +
        "&includeItemsFromAllDrives=true" +
        "&supportsAllDrives=true";

      if (pageToken) url += "&pageToken=" + encodeURIComponent(pageToken);

      var resp = UrlFetchApp.fetch(url, {
        method: "get",
        muteHttpExceptions: true,
        headers: { Authorization: "Bearer " + token },
      });

      var code = resp.getResponseCode();
      var text = HB_s_(resp.getContentText());
      if (code < 200 || code >= 300) {
        throw new Error("Drive API HTTP " + code + ": " + text.slice(0, 250));
      }

      var json = {};
      try { json = JSON.parse(text); } catch (e) {}
      var files = (json && json.files) || [];

      for (var i = 0; i < files.length; i++) {
        var f = files[i] || {};
        var id = HB_s_(f.id);
        var mime = HB_s_(f.mimeType);
        if (!id) continue;

        if (mime === "application/vnd.google-apps.folder") {
          if (!visited[id]) queue.push(id);
          continue;
        }

        var sha256 = HB_s_(f.sha256Checksum).toLowerCase();
        var sha1 = HB_s_(f.sha1Checksum).toLowerCase();
        var md5 = HB_s_(f.md5Checksum).toLowerCase();
        var hash = sha256 || sha1 || md5;
        if (!hash) continue;

        out.push({
          id: id,
          name: HB_s_(f.name),
          folderId: folderId,
          path: "",
          hash: hash,
          algo: sha256 ? "sha256" : sha1 ? "sha1" : "md5",
          size: Number(f.size || 0) || 0,
          mimeType: mime,
          url: HB_s_(f.webViewLink),
        });
      }

      pageToken = HB_s_(json && json.nextPageToken);
    } while (pageToken);
  }

  return out;
}

function HB_uploadFile_(req) {
  try {
    var folderId = HB_s_(req.folderId || req.targetFolderId || req.parentId);
    if (!folderId) return { ok: false, msg: "Missing folderId" };

    var base64 = HB_s_(req.base64 || req.data || req.contentBase64);
    if (!base64) return { ok: false, msg: "Missing base64" };

    var fileName = HB_s_(req.fileName || req.name || ("upload_" + Date.now() + ".jpg"));
    var mimeType = HB_s_(req.mimeType || req.type || "image/jpeg");

    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);

    return {
      ok: true,
      id: file.getId(),
      fileId: file.getId(),
      name: file.getName(),
      fileName: file.getName(),
      url: file.getUrl(),
      webViewLink: file.getUrl(),
    };
  } catch (err) {
    return { ok: false, msg: HB_s_(err && err.message) || "upload error" };
  }
}

// =====================================================================
// --- Legacy handlers (giữ nguyên) ---
// =====================================================================
function handleUpdateTags_(ss, data) {
  const id = data.id;
  const gid = data.gid;
  const tags = data.tags;
  const sheet = gid ? ss.getSheets().find((s) => s.getSheetId() == gid) : ss.getSheets()[0];
  if (!sheet) throw new Error("Sheet not found");

  const info = detectColumns_(sheet);
  if (!info.idCol || !getCol_(info.hRaw, CFG.colTagsAliases)) throw new Error("Missing ID or Tags column");

  const tagColIdx = getCol_(info.hRaw, CFG.colTagsAliases);
  const values = sheet.getDataRange().getValues();

  for (let i = info.headerRow; i < values.length; i++) {
    if (String(values[i][info.idCol - 1]) == String(id)) {
      sheet.getRange(i + 1, tagColIdx).setValue(tags);
      return jsonResp_({ ok: true, id: id, msg: "Tags updated" });
    }
  }
  return jsonResp_({ ok: false, error: "ID not found" });
}

function handleUpdateRow_(ss, data) {
  const sheet = data.sheet ? ss.getSheetByName(data.sheet) : ss.getSheets()[0];
  if (!sheet) throw new Error("Sheet not found");

  const rowData = data.row;
  if (!rowData || !rowData.id) throw new Error("Missing ID");

  const info = detectColumns_(sheet);
  if (!info.idCol) throw new Error("ID Column not defined in sheet");

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = info.headerRow; i < values.length; i++) {
    if (String(values[i][info.idCol - 1]) === String(rowData.id)) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) throw new Error("Row ID " + rowData.id + " not found");

  const colMap = {};
  info.hRaw.forEach((h, i) => (colMap[h] = i + 1));

  const aliasMap = {
    description: ["description", "desc", "mo_ta", "mota"],
    tags: CFG.colTagsAliases,
    name: CFG.colNameAliases,
    active: ["active", "hien_thi", "status"],
    pricebysize: ["pricebysize", "price_by_size", "gia"],
    images: CFG.colImagesAliases,
  };

  for (const [key, val] of Object.entries(rowData)) {
    if (key === "id" || key === "_id") continue;
    const nKey = normalize_(key);
    let colIdx = colMap[nKey];

    if (!colIdx) {
      for (const [k, arr] of Object.entries(aliasMap)) {
        if (nKey === k || arr.some((a) => normalize_(a) === nKey)) {
          for (const header of info.hRaw) {
            if (arr.some((a) => normalize_(a) === header)) {
              colIdx = colMap[header];
              break;
            }
          }
        }
        if (colIdx) break;
      }
    }

    if (colIdx) {
      const cellVal = typeof val === "object" ? JSON.stringify(val) : val;
      sheet.getRange(rowIndex, colIdx).setValue(cellVal);
    }
  }

  return jsonResp_({ ok: true, message: "Updated row " + rowIndex });
}

// --- 6. HELPERS ---
function normalize_(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
function jsonResp_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function toast_(m) {
  SpreadsheetApp.getActive().toast(m, "Master Tool", 5);
}

function detectColumns_(sh) {
  const hRaw = sh
    .getRange(CFG.headerRow, 1, 1, sh.getLastColumn())
    .getValues()[0]
    .map((x) => normalize_(String(x)));

  const getC = (aliases) => {
    const idx = hRaw.findIndex((h) => aliases.some((a) => normalize_(a) === h));
    return idx !== -1 ? idx + 1 : null;
  };

  const nameCol = getC(CFG.colNameAliases);
  const imagesCol = getC(CFG.colImagesAliases);
  if (!nameCol || !imagesCol) return null;

  return {
    hRaw,
    headerRow: CFG.headerRow,
    lastRow: sh.getLastRow(),
    nameCol,
    imagesCol,
    idCol: getC(CFG.colIdAliases),
    catCol: getC(CFG.colCategoryAliases),
    thumbCol: getC(CFG.colThumbAliases),
  };
}

function getCol_(hRaw, aliases) {
  const idx = hRaw.findIndex((h) => aliases.some((a) => normalize_(a) === h));
  return idx !== -1 ? idx + 1 : null;
}

function loadSmartMenu_(ss) {
  const map = {},
    validKeys = [];
  const sh = ss.getSheetByName(MENU_CFG.sheetName);
  if (!sh || sh.getLastRow() < 2) return { mapper: map, validKeys: validKeys };

  const h = sh
    .getRange(1, 1, 1, sh.getLastColumn())
    .getValues()[0]
    .map((x) => normalize_(String(x)));

  const kIdx = h.indexOf(normalize_(MENU_CFG.colKey));
  const lIdx = h.indexOf(normalize_(MENU_CFG.colLabel));
  if (kIdx === -1) return { mapper: map, validKeys: validKeys };

  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn())
    .getValues()
    .forEach((r) => {
      const k = String(r[kIdx]).trim();
      if (k) {
        validKeys.push(k);
        map[normalize_(k)] = k;
        if (lIdx !== -1 && r[lIdx]) map[normalize_(String(r[lIdx]))] = k;
      }
    });

  return {
    mapper: map,
    validKeys: validKeys.sort((a, b) => b.length - a.length),
  };
}

function findSmartKey_(name, map, keys) {
  const n = normalize_(name);
  if (map[n]) return map[n];
  return keys.find((k) => n.includes(normalize_(k))) || null;
}

function sortSheetNaturally_(sh, hRow, nCol) {
  const lr = sh.getLastRow();
  if (lr <= hRow) return;

  const rng = sh.getRange(hRow + 1, 1, lr - hRow, sh.getLastColumn());
  const vals = rng.getValues(),
    forms = rng.getFormulas();

  const rows = vals.map((v, i) => ({ v: v, f: forms[i], k: String(v[nCol - 1] || "") }));
  rows.sort((a, b) => a.k.localeCompare(b.k, undefined, { numeric: true, sensitivity: "base" }));

  rng.setValues(
    rows.map((r) =>
      r.v.map((c, i) => (r.f[i] ? r.f[i] : c))
    )
  );
}
