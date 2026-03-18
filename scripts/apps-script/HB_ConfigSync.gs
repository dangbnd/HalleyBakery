/**
 * HB_ConfigSync.gs
 *
 * Batch save/load config từ tab URL/Config trong Google Sheet.
 * Thay vì gọi insert/update từng dòng (chậm), ghi TẤT CẢ cùng lúc.
 *
 * Cách gắn vào doPost:
 *   var cfgHandled = HB_tryHandleConfigActions_(data);
 *   if (cfgHandled) return jsonResp_(cfgHandled);
 */

function HB_tryHandleConfigActions_(req) {
  var action = HB_effectiveAction_ ? HB_effectiveAction_(req) : (req.action || req.op || "");
  if (!action) return null;

  var norm = String(action).toLowerCase().replace(/[^a-z0-9]/g, "");

  if (norm === "configsave" || norm === "saveconfig" || norm === "configbatchsave" || norm === "batchsaveconfig") {
    return HB_batchSaveConfig_(req);
  }
  if (norm === "configload" || norm === "loadconfig" || norm === "configget" || norm === "getconfig") {
    return HB_loadConfig_(req);
  }
  return null;
}

var HB_CONFIG_SHEET_NAMES_ = ["URL", "Config", "config", "Settings", "Cau hinh"];

function HB_findConfigSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < HB_CONFIG_SHEET_NAMES_.length; i++) {
    var sh = ss.getSheetByName(HB_CONFIG_SHEET_NAMES_[i]);
    if (sh) return sh;
  }
  return null;
}

function HB_normCfgKey_(v) {
  return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Batch save: nhận { config: { key1: val1, key2: val2, ... } }
 * Ghi tất cả vào tab Config/URL trong 1 lần.
 */
function HB_batchSaveConfig_(req) {
  try {
    var config = req.config || {};
    var keys = Object.keys(config);
    if (!keys.length) return { ok: true, count: 0, msg: "No config to save" };

    var sheet = HB_findConfigSheet_();
    if (!sheet) return { ok: false, msg: "Không tìm thấy tab URL/Config trong Sheet" };

    var range = sheet.getDataRange();
    var data = range.getValues();

    // Tìm cột key và value (dựa trên header row)
    var keyCol = 0;
    var valCol = 1;

    // Map key đã chuẩn hóa -> row index (0-based, bỏ header)
    var existingMap = {};
    for (var r = 1; r < data.length; r++) {
      var k = HB_normCfgKey_(data[r][keyCol]);
      if (k) existingMap[k] = r; // index trong mảng data (0-based)
    }

    // Chuẩn bị ghi
    var toAppend = [];
    for (var i = 0; i < keys.length; i++) {
      var rawKey = keys[i];
      var normKey = HB_normCfgKey_(rawKey);
      var value = String(config[rawKey] != null ? config[rawKey] : "");

      if (existingMap.hasOwnProperty(normKey)) {
        // Cập nhật giá trị tại ô đã có
        var rowIdx = existingMap[normKey];
        sheet.getRange(rowIdx + 1, valCol + 1).setValue(value); // 1-based
      } else {
        // Key mới -> append
        toAppend.push([rawKey, value]);
      }
    }

    // Ghi các key mới một lượt
    if (toAppend.length > 0) {
      var lastRow = sheet.getLastRow();
      var appendRange = sheet.getRange(lastRow + 1, 1, toAppend.length, 2);
      appendRange.setValues(toAppend);
    }

    return { ok: true, count: keys.length, appended: toAppend.length, msg: "Config saved" };
  } catch (err) {
    return { ok: false, msg: String(err && err.message ? err.message : err) };
  }
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
