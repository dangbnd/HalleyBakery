/**
 * HB_Tracking.gs
 *
 * Centralized telemetry for the storefront.
 * Add this file to the same Apps Script project as DriveMasterV21_Full.gs,
 * then route it from doPost:
 *
 *   var trackingHandled = HB_tryHandleTrackingActions_(data);
 *   if (trackingHandled) return jsonResp_(trackingHandled);
 */

var HB_TRACKING_EVENTS_SHEET_ = "Events";
var HB_TRACKING_EVENTS_DAILY_PREFIX_ = "Events_";
var HB_TRACKING_CONSULTS_SHEET_ = "Consults";
var HB_TRACKING_PRODUCT_IMPRESSION_LIST_LIMIT_ = 6;
var HB_TRACKING_TIMEZONE_ = "Asia/Ho_Chi_Minh";
var HB_TRACKING_SHEET_ID_CONFIG_KEYS_ = [
  "tracking_sheet_id",
  "tracking_spreadsheet_id",
  "telemetry_sheet_id",
  "telemetry_spreadsheet_id",
  "events_sheet_id",
  "events_spreadsheet_id",
];

var HB_TRACKING_ALLOWED_EVENT_TYPES_ = {
  session_start: true,
  page_view: true,
  search_submit: true,
  search_results_view: true,
  search_zero_result: true,
  category_results_view: true,
  detail_open: true,
  product_impression: true,
  messenger_click: true,
  contact_entry_click: true,
  consult_submit: true,
  category_click: true,
  tag_click: true,
};

var HB_TRACKING_EVENT_HEADERS_ = [
  "id",
  "ip_address",
  "address",
  "gps_latitude",
  "gps_longitude",
  "gps_accuracy_m",
  "location_source",
  "ts",
  "ts_ms",
  "type",
  "source",
  "severity",
  "visitor_id",
  "session_id",
  "page_path",
  "page_url",
  "page_title",
  "route",
  "page_type",
  "content_group",
  "section",
  "list_id",
  "list_name",
  "list_position",
  "results_count",
  "zero_results",
  "search_mode",
  "referrer",
  "visibility",
  "product_pid",
  "product_id",
  "product_name",
  "category",
  "query",
  "tag",
  "channel",
  "href",
  "status",
  "message",
  "file",
  "line",
  "col",
  "stack",
  "target_tag",
  "target_text",
  "target_href",
  "target_id",
  "duration_ms",
  "value",
  "first_touch_source",
  "first_touch_medium",
  "first_touch_campaign",
  "first_touch_content",
  "first_touch_term",
  "first_touch_click_id",
  "first_touch_channel",
  "first_touch_landing_path",
  "first_touch_referrer",
  "first_touch_at",
  "last_touch_source",
  "last_touch_medium",
  "last_touch_campaign",
  "last_touch_content",
  "last_touch_term",
  "last_touch_click_id",
  "last_touch_channel",
  "last_touch_landing_path",
  "last_touch_referrer",
  "last_touch_at",
  "meta",
  "user_agent",
  "screen",
  "viewport",
  "language",
  "timezone",
  "connection",
  "app_host",
];

var HB_TRACKING_CONSULT_HEADERS_ = [
  "id",
  "ts",
  "name",
  "phone",
  "phone_digits",
  "needed_date",
  "size",
  "note",
  "product_pid",
  "product_id",
  "product_name",
  "category",
  "tags",
  "product_link",
  "source",
  "page_path",
  "page_url",
  "page_title",
  "route",
  "referrer",
  "first_touch_source",
  "first_touch_medium",
  "first_touch_campaign",
  "first_touch_content",
  "first_touch_term",
  "first_touch_click_id",
  "first_touch_channel",
  "first_touch_landing_path",
  "first_touch_referrer",
  "first_touch_at",
  "last_touch_source",
  "last_touch_medium",
  "last_touch_campaign",
  "last_touch_content",
  "last_touch_term",
  "last_touch_click_id",
  "last_touch_channel",
  "last_touch_landing_path",
  "last_touch_referrer",
  "last_touch_at",
  "lead_status",
  "lead_score",
  "quote_amount",
  "order_value",
  "lost_reason",
  "sales_note",
  "assigned_to",
  "closed_at",
];

function HB_trackingAction_(req) {
  var action = typeof HB_effectiveAction_ === "function"
    ? HB_effectiveAction_(req || {})
    : String((req && (req.action || req.op || req.operation)) || "");
  return String(action || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function HB_tryHandleTrackingActions_(req) {
  var action = HB_trackingAction_(req);
  if (!action) return null;

  var sheetName = String((req && (req.sheet || req.sheetName || req.tab || req.name)) || "").trim().toLowerCase();
  if (
    sheetName === String(HB_TRACKING_CONSULTS_SHEET_).toLowerCase() &&
    (
      action === "insert" ||
      action === "add" ||
      action === "append" ||
      action === "create" ||
      action === "insertrow" ||
      action === "appendrow" ||
      action === "addrow" ||
      action === "sheetinsert" ||
      action === "sheetadd" ||
      action === "sheetappend" ||
      action === "rowsinsert" ||
      action === "rowsadd" ||
      action === "rowsappend"
    )
  ) {
    return HB_trackingConsultInsert_(req);
  }

  if (
    action === "trackingtrack" ||
    action === "telemetrytrack" ||
    action === "track" ||
    action === "eventsinsert" ||
    action === "eventinsert"
  ) {
    return HB_trackingTrack_(req);
  }

  if (
    action === "trackingconsult" ||
    action === "telemetryconsult" ||
    action === "consultinsert" ||
    action === "leadinsert" ||
    action === "leadsinsert"
  ) {
    return HB_trackingConsultInsert_(req);
  }

  if (
    action === "trackinglist" ||
    action === "telemetrylist" ||
    action === "tracklist" ||
    action === "eventslist"
  ) {
    return HB_trackingList_(req);
  }

  if (action === "trackingensure" || action === "ensuretracking") {
    return HB_trackingEnsure_();
  }

  return null;
}

function HB_trackingHeaderIndex_(headers, name) {
  var target = String(name || "").trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").trim().toLowerCase() === target) return i + 1;
  }
  return 0;
}

function HB_trackingEnsureHeaderPositions_(sheet, current, headers) {
  if (!sheet || headers[0] !== "id") return current;

  var anchorCol = HB_trackingHeaderIndex_(current, "id");
  if (!anchorCol) return current;

  for (var i = 1; i < headers.length; i++) {
    var header = headers[i];
    if (header === "ts") break;

    var col = HB_trackingHeaderIndex_(current, header);
    if (!col) {
      sheet.insertColumnAfter(anchorCol);
      sheet.getRange(1, anchorCol + 1).setValue(header);
      var lastColAfterInsert = Math.max(sheet.getLastColumn(), headers.length, 1);
      current = sheet.getRange(1, 1, 1, lastColAfterInsert).getValues()[0];
      col = anchorCol + 1;
    }
    anchorCol = col;
  }

  var lastCol = Math.max(sheet.getLastColumn(), headers.length, 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function HB_trackingSpreadsheetIdFromValue_(value) {
  var text = String(value || "").trim();
  if (!text) return "";
  var match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return text.replace(/[^a-zA-Z0-9-_]/g, "");
}

function HB_trackingNormCfgKey_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function HB_trackingConfigValue_(keys) {
  var wanted = {};
  keys.forEach(function (key) {
    wanted[HB_trackingNormCfgKey_(key)] = true;
  });

  try {
    if (typeof HB_loadConfig_ === "function") {
      var loaded = HB_loadConfig_({});
      var config = loaded && loaded.config ? loaded.config : {};
      for (var key in config) {
        if (wanted[HB_trackingNormCfgKey_(key)]) return config[key];
      }
    }
  } catch (err) {}

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var names = ["URL", "Config", "config", "Settings", "Cau hinh"];
    for (var i = 0; i < names.length; i++) {
      var sheet = ss.getSheetByName(names[i]);
      if (!sheet) continue;
      var values = sheet.getDataRange().getValues();
      for (var r = 1; r < values.length; r++) {
        var cfgKey = HB_trackingNormCfgKey_(values[r][0]);
        if (wanted[cfgKey]) return values[r][1];
      }
    }
  } catch (err2) {}

  return "";
}

function HB_trackingConfiguredSpreadsheetId_(req) {
  var raw = req && (
    req.tracking_sheet_id ||
    req.trackingSheetId ||
    req.tracking_spreadsheet_id ||
    req.trackingSpreadsheetId ||
    req.telemetry_sheet_id ||
    req.telemetrySheetId
  );
  var id = HB_trackingSpreadsheetIdFromValue_(raw);
  if (id) return id;

  id = HB_trackingSpreadsheetIdFromValue_(HB_trackingConfigValue_(HB_TRACKING_SHEET_ID_CONFIG_KEYS_));
  if (id) return id;

  try {
    var props = PropertiesService.getScriptProperties();
    id = HB_trackingSpreadsheetIdFromValue_(
      props.getProperty("HB_TRACKING_SHEET_ID") ||
      props.getProperty("TRACKING_SHEET_ID") ||
      props.getProperty("TRACKING_SPREADSHEET_ID")
    );
    if (id) return id;
  } catch (err) {}

  return "";
}

function HB_trackingSpreadsheet_(req) {
  var id = HB_trackingConfiguredSpreadsheetId_(req || {});
  if (!id) return SpreadsheetApp.getActiveSpreadsheet();
  return SpreadsheetApp.openById(id);
}

function HB_trackingEnsureSheetIn_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var lastCol = Math.max(sheet.getLastColumn(), headers.length, 1);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var hasHeader = current.some(function (cell) { return String(cell || "").trim(); });
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  current = HB_trackingEnsureHeaderPositions_(sheet, current, headers);

  var existing = {};
  current.forEach(function (cell) {
    var key = String(cell || "").trim();
    if (key) existing[key] = true;
  });

  var missing = headers.filter(function (header) { return !existing[header]; });
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }

  return sheet;
}

function HB_trackingEnsureSheet_(name, headers, req) {
  return HB_trackingEnsureSheetIn_(HB_trackingSpreadsheet_(req || {}), name, headers);
}

function HB_trackingDateFromRow_(row) {
  var ms = Number(HB_trackingValue_(row, "ts_ms"));
  if (isFinite(ms) && ms > 0) return new Date(ms);

  var ts = String(HB_trackingValue_(row, "ts") || "").trim();
  if (ts) {
    var parsed = Date.parse(ts);
    if (isFinite(parsed)) return new Date(parsed);
  }

  return new Date();
}

function HB_trackingDailyEventsSheetName_(row) {
  return HB_TRACKING_EVENTS_DAILY_PREFIX_ +
    Utilities.formatDate(HB_trackingDateFromRow_(row || {}), HB_TRACKING_TIMEZONE_, "yyyy-MM-dd");
}

function HB_trackingTodayEventsSheetName_() {
  return HB_TRACKING_EVENTS_DAILY_PREFIX_ +
    Utilities.formatDate(new Date(), HB_TRACKING_TIMEZONE_, "yyyy-MM-dd");
}

function HB_trackingEnsure_() {
  var ss = HB_trackingSpreadsheet_({});
  var todaySheet = HB_trackingTodayEventsSheetName_();
  HB_trackingEnsureSheetIn_(ss, todaySheet, HB_TRACKING_EVENT_HEADERS_);
  HB_trackingEnsureSheetIn_(ss, HB_TRACKING_CONSULTS_SHEET_, HB_TRACKING_CONSULT_HEADERS_);
  return {
    ok: true,
    trackingSpreadsheetId: ss.getId(),
    eventsSheet: todaySheet,
    consultsSheet: HB_TRACKING_CONSULTS_SHEET_,
  };
}

function testTrackingSetup() {
  return HB_trackingEnsure_();
}

function testTrackingPing() {
  return HB_tryHandleTrackingActions_({
    action: "tracking.track",
    events: [{
      id: "manual-" + Date.now(),
      ts: new Date().toISOString(),
      ts_ms: Date.now(),
      type: "session_start",
      source: "apps-script",
      severity: "info",
      page_path: "/apps-script-test",
      message: "Manual tracking smoke test",
      app_host: "apps-script",
    }],
  });
}

function HB_trackingValue_(row, header) {
  if (!row) return "";
  if (Object.prototype.hasOwnProperty.call(row, header)) return row[header] == null ? "" : row[header];

  var lower = String(header || "").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower] == null ? "" : row[lower];

  var norm = lower.replace(/[^a-z0-9]+/g, "");
  for (var key in row) {
    if (String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "") === norm) {
      return row[key] == null ? "" : row[key];
    }
  }
  return "";
}

function HB_trackingRecentIdSet_(sheet, headers, limit) {
  var ids = {};
  if (!sheet) return ids;

  var idCol = headers.indexOf("id") + 1;
  if (idCol < 1) return ids;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return ids;

  var count = Math.min(Math.max(1, Number(limit || 3000)), lastRow - 1);
  var start = lastRow - count + 1;
  var values = sheet.getRange(start, idCol, count, 1).getValues();
  values.forEach(function (row) {
    var id = String(row[0] || "").trim();
    if (id) ids[id] = true;
  });
  return ids;
}

function HB_trackingAllowVolume_(row) {
  var type = String(HB_trackingValue_(row, "type") || "").trim();
  if (type !== "product_impression") return true;

  var pos = Number(HB_trackingValue_(row, "list_position"));
  return !isFinite(pos) || pos <= HB_TRACKING_PRODUCT_IMPRESSION_LIST_LIMIT_;
}

function HB_trackingAppendRows_(sheet, headers, rows) {
  if (!rows.length) return 0;
  var recentIds = HB_trackingRecentIdSet_(sheet, headers, 3000);
  var batchIds = {};
  var filtered = rows.filter(function (row) {
    var type = String(HB_trackingValue_(row, "type") || "").trim();
    if (!HB_TRACKING_ALLOWED_EVENT_TYPES_[type]) return false;
    if (!HB_trackingAllowVolume_(row)) return false;

    var id = String(HB_trackingValue_(row, "id") || "").trim();
    if (id) {
      if (recentIds[id] || batchIds[id]) return false;
      batchIds[id] = true;
    }

    return true;
  });
  if (!filtered.length) return 0;
  var values = filtered.map(function (row) {
    return headers.map(function (header) {
      var value = HB_trackingValue_(row, header);
      if (typeof value === "object" && value !== null) {
        try {
          return JSON.stringify(value);
        } catch (err) {
          return String(value);
        }
      }
      return value;
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  return values.length;
}

function HB_trackingAppendConsultRows_(sheet, headers, rows) {
  if (!rows.length) return 0;
  var recentIds = HB_trackingRecentIdSet_(sheet, headers, 3000);
  var batchIds = {};
  var filtered = rows.filter(function (row) {
    var id = String(HB_trackingValue_(row, "id") || "").trim();
    if (id) {
      if (recentIds[id] || batchIds[id]) return false;
      batchIds[id] = true;
    }
    return true;
  });
  if (!filtered.length) return 0;

  var values = filtered.map(function (row) {
    return headers.map(function (header) {
      var value = HB_trackingValue_(row, header);
      if (typeof value === "object" && value !== null) {
        try {
          return JSON.stringify(value);
        } catch (err) {
          return String(value);
        }
      }
      return value;
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  return values.length;
}

function HB_trackingTrack_(req) {
  try {
    var ss = HB_trackingSpreadsheet_(req || {});
    var events = [];
    if (Array.isArray(req.events)) events = req.events;
    else if (req.event) events = [req.event];
    else if (req.row) events = [req.row];
    else if (req.data) events = Array.isArray(req.data) ? req.data : [req.data];

    var grouped = {};
    events.forEach(function (event) {
      var name = HB_trackingDailyEventsSheetName_(event || {});
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(event);
    });

    var inserted = 0;
    var eventSheets = [];
    for (var name in grouped) {
      var sheet = HB_trackingEnsureSheetIn_(ss, name, HB_TRACKING_EVENT_HEADERS_);
      var count = HB_trackingAppendRows_(sheet, HB_TRACKING_EVENT_HEADERS_, grouped[name]);
      inserted += count;
      eventSheets.push(name);
    }

    return {
      ok: true,
      accepted: events.length,
      inserted: inserted,
      trackingSpreadsheetId: ss.getId(),
      eventsSheet: eventSheets[0] || HB_trackingTodayEventsSheetName_(),
      eventSheets: eventSheets,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function HB_trackingConsultInsert_(req) {
  try {
    var ss = HB_trackingSpreadsheet_(req || {});
    var sheet = HB_trackingEnsureSheetIn_(ss, HB_TRACKING_CONSULTS_SHEET_, HB_TRACKING_CONSULT_HEADERS_);
    var rows = [];
    if (Array.isArray(req.rows)) rows = req.rows;
    else if (Array.isArray(req.leads)) rows = req.leads;
    else if (req.lead) rows = [req.lead];
    else if (req.row) rows = [req.row];
    else if (req.data) rows = Array.isArray(req.data) ? req.data : [req.data];

    var inserted = HB_trackingAppendConsultRows_(sheet, HB_TRACKING_CONSULT_HEADERS_, rows);
    return {
      ok: true,
      accepted: rows.length,
      inserted: inserted,
      trackingSpreadsheetId: ss.getId(),
      consultsSheet: HB_TRACKING_CONSULTS_SHEET_,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function HB_trackingRows_(sheet, limit) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var start = Math.max(2, lastRow - Math.max(1, Number(limit || 5000)) + 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (cell) {
    return String(cell || "").trim();
  });
  var values = sheet.getRange(start, 1, lastRow - start + 1, lastCol).getValues();

  return values.map(function (row) {
    var obj = {};
    header.forEach(function (key, index) {
      if (key) obj[key] = row[index];
    });
    return obj;
  }).filter(function (obj) {
    return Object.keys(obj).some(function (key) { return obj[key] !== "" && obj[key] != null; });
  }).reverse();
}

function HB_trackingEventSheetDateKey_(name) {
  var text = String(name || "").trim();
  if (text === HB_TRACKING_EVENTS_SHEET_) return "0000-00-00";
  var match = text.match(/^Events_(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : "";
}

function HB_trackingEventSheets_(ss) {
  return ss.getSheets().filter(function (sheet) {
    return !!HB_trackingEventSheetDateKey_(sheet.getName());
  }).sort(function (a, b) {
    return HB_trackingEventSheetDateKey_(b.getName()).localeCompare(HB_trackingEventSheetDateKey_(a.getName()));
  });
}

function HB_trackingEventRows_(ss, limit) {
  var max = Math.max(1, Number(limit || 5000));
  var rows = [];
  var sheets = HB_trackingEventSheets_(ss);
  for (var i = 0; i < sheets.length && rows.length < max; i++) {
    var remaining = max - rows.length;
    rows = rows.concat(HB_trackingRows_(sheets[i], remaining));
  }
  return rows.slice(0, max);
}

function HB_trackingList_(req) {
  try {
    var ss = HB_trackingSpreadsheet_(req || {});
    var limit = Number(req.limit || 5000);
    var consultsSheet = ss.getSheetByName(HB_TRACKING_CONSULTS_SHEET_);
    return {
      ok: true,
      events: HB_trackingEventRows_(ss, limit),
      leads: HB_trackingRows_(consultsSheet, Math.min(limit, 2000)),
      trackingSpreadsheetId: ss.getId(),
      eventsSheet: HB_trackingTodayEventsSheetName_(),
      eventSheets: HB_trackingEventSheets_(ss).map(function (sheet) { return sheet.getName(); }),
      consultsSheet: HB_TRACKING_CONSULTS_SHEET_,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}
