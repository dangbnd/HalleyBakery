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
var HB_TRACKING_CONSULTS_SHEET_ = "Consults";
var HB_TRACKING_PRODUCT_IMPRESSION_LIST_LIMIT_ = 6;

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

function HB_trackingEnsureSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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

function HB_trackingEnsure_() {
  HB_trackingEnsureSheet_(HB_TRACKING_EVENTS_SHEET_, HB_TRACKING_EVENT_HEADERS_);
  HB_trackingEnsureSheet_(HB_TRACKING_CONSULTS_SHEET_, HB_TRACKING_CONSULT_HEADERS_);
  return { ok: true, eventsSheet: HB_TRACKING_EVENTS_SHEET_, consultsSheet: HB_TRACKING_CONSULTS_SHEET_ };
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

function HB_trackingTrack_(req) {
  try {
    var sheet = HB_trackingEnsureSheet_(HB_TRACKING_EVENTS_SHEET_, HB_TRACKING_EVENT_HEADERS_);
    var events = [];
    if (Array.isArray(req.events)) events = req.events;
    else if (req.event) events = [req.event];
    else if (req.row) events = [req.row];
    else if (req.data) events = Array.isArray(req.data) ? req.data : [req.data];

    var inserted = HB_trackingAppendRows_(sheet, HB_TRACKING_EVENT_HEADERS_, events);
    return { ok: true, accepted: events.length, inserted: inserted, eventsSheet: HB_TRACKING_EVENTS_SHEET_ };
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

function HB_trackingList_(req) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var limit = Number(req.limit || 5000);
    var eventsSheet = ss.getSheetByName(HB_TRACKING_EVENTS_SHEET_);
    var consultsSheet = ss.getSheetByName(HB_TRACKING_CONSULTS_SHEET_);
    return {
      ok: true,
      events: HB_trackingRows_(eventsSheet, limit),
      leads: HB_trackingRows_(consultsSheet, Math.min(limit, 2000)),
      eventsSheet: HB_TRACKING_EVENTS_SHEET_,
      consultsSheet: HB_TRACKING_CONSULTS_SHEET_,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}
