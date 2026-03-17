/**
 * HB_DriveActionsPatch.gs
 *
 * Muc tieu:
 * - Bo sung action cho GS WebApp de frontend co the:
 *   1) list folder cap cuoi
 *   2) list file hashes (sha256/sha1/md5) de check trung
 *
 * Cach gan vao doPost hien tai (voi code cua ban da parse JSON thanh bien `data`):
 *
 * // ---- THEM 2 DONG NAY O DAU ROUTER ----
 * var driveHandled = HB_tryHandleDriveActions_(data);
 * if (driveHandled) return jsonResp_(driveHandled);
 *
 *   // ... router cu cua ban (list/insert/update/upload...) ...
 *
 * Neu ban khong co jsonResp_ thi dung:
 * return HB_json_(driveHandled);
 *
 * Luu y:
 * - File nay KHONG thay the code cu.
 * - Chi bo sung handle cac action drive.* ma frontend Upload dang goi.
 */

function HB_json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function HB_parseReq_(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (err) {}
  return {};
}

function HB_s_(v) {
  return v == null ? "" : String(v).trim();
}

function HB_normKey_(v) {
  return HB_s_(v).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function HB_getAdminToken_() {
  return HB_s_(PropertiesService.getScriptProperties().getProperty("HB_ADMIN_TOKEN"));
}

function HB_extractAdminToken_(req) {
  return HB_s_(
    (req && req._auth && req._auth.token) ||
    (req && req.adminToken) ||
    (req && req.token)
  );
}

function HB_requireAdminToken_(req) {
  var expected = HB_getAdminToken_();
  if (!expected) return { ok: false, msg: "Missing HB_ADMIN_TOKEN script property" };
  var provided = HB_extractAdminToken_(req);
  if (!provided || provided !== expected) return { ok: false, msg: "Unauthorized" };
  return null;
}

function HB_effectiveAction_(req) {
  var action = HB_s_(req.action);
  var op = HB_s_(req.op || req.operation);
  if (action.toLowerCase() === "drive" && op) return op;
  return action || op;
}

function HB_in_(needle, aliases) {
  var n = HB_normKey_(needle);
  for (var i = 0; i < aliases.length; i++) {
    if (n === HB_normKey_(aliases[i])) return true;
  }
  return false;
}

function HB_tryHandleDriveActions_(req) {
  var action = HB_effectiveAction_(req);
  if (!action) return null;

  if (HB_in_(action, [
    "drive.listLeafFolders",
    "drive_list_leaf_folders",
    "listDriveLeafFolders",
    "list_leaf_folders",
    "listLeafFolders",
    "driveListLeafFolders",
    "leaf_folders",
    "drive.list_leaf_folders",
    "drive/list_leaf_folders"
  ])) {
    var leafAuthErr = HB_requireAdminToken_(req);
    if (leafAuthErr) return leafAuthErr;
    return HB_listLeafFolders_(req);
  }

  if (HB_in_(action, [
    "drive.listFolders",
    "drive_list_folders",
    "listDriveFolders",
    "list_folders",
    "listFolders",
    "driveListFolders",
    "drive.folders",
    "folders.list",
    "drive/list_folders"
  ])) {
    var folderAuthErr = HB_requireAdminToken_(req);
    if (folderAuthErr) return folderAuthErr;
    return HB_listAllFolders_(req);
  }

  if (HB_in_(action, [
    "drive.listFileHashes",
    "drive_list_file_hashes",
    "listDriveFileHashes",
    "list_file_hashes",
    "listFiles",
    "list_files",
    "drive.listFiles",
    "driveListFiles",
    "drive.hashes",
    "drive.listFilesWithHash",
    "drive/list_files"
  ])) {
    var hashAuthErr = HB_requireAdminToken_(req);
    if (hashAuthErr) return hashAuthErr;
    return HB_listFileHashes_(req);
  }

  return null;
}

function HB_pickRootFolderId_(req) {
  return HB_s_(req.rootFolderId || req.folderId || req.parentId || req.rootId);
}

function HB_listAllFolders_(req) {
  try {
    var rootId = HB_pickRootFolderId_(req);
    if (!rootId) return { ok: false, msg: "Missing rootFolderId" };

    var rows = HB_collectFolders_(rootId, true);
    return {
      ok: true,
      rows: rows,
      folders: rows,
      count: rows.length
    };
  } catch (err) {
    return { ok: false, msg: HB_s_(err && err.message) || "list folders error" };
  }
}

function HB_listLeafFolders_(req) {
  try {
    var rootId = HB_pickRootFolderId_(req);
    if (!rootId) return { ok: false, msg: "Missing rootFolderId" };

    var rows = HB_collectFolders_(rootId, false);
    return {
      ok: true,
      rows: rows,
      folders: rows,
      count: rows.length
    };
  } catch (err) {
    return { ok: false, msg: HB_s_(err && err.message) || "list leaf folders error" };
  }
}

/**
 * includeNonLeaf = true  -> tra tat ca folder
 * includeNonLeaf = false -> chi tra folder cap cuoi (khong co folder con)
 */
function HB_collectFolders_(rootId, includeNonLeaf) {
  var root = DriveApp.getFolderById(rootId);
  var out = [];
  var stack = [{
    folder: root,
    parentId: "",
    level: 0,
    path: root.getName()
  }];

  while (stack.length) {
    var node = stack.pop();
    var it = node.folder.getFolders();
    var children = [];
    while (it.hasNext()) children.push(it.next());

    var hasChildren = children.length > 0;
    var isRoot = node.folder.getId() === rootId;

    if ((includeNonLeaf || !hasChildren) && !isRoot) {
      out.push({
        id: node.folder.getId(),
        name: node.folder.getName(),
        path: node.path,
        parentId: node.parentId,
        level: node.level,
        hasChildren: hasChildren
      });
    }

    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      stack.push({
        folder: child,
        parentId: node.folder.getId(),
        level: node.level + 1,
        path: node.path + "/" + child.getName()
      });
    }
  }

  return out;
}

function HB_listFileHashes_(req) {
  try {
    var rootId = HB_pickRootFolderId_(req);
    if (!rootId) return { ok: false, msg: "Missing rootFolderId" };

    var files = HB_collectFileHashesRecursive_(rootId);
    return {
      ok: true,
      rows: files,
      files: files,
      count: files.length
    };
  } catch (err) {
    return { ok: false, msg: HB_s_(err && err.message) || "list file hashes error" };
  }
}

function HB_collectFileHashesRecursive_(rootFolderId) {
  var token = ScriptApp.getOAuthToken();
  var queue = [rootFolderId];
  var visitedFolder = {};
  var out = [];

  while (queue.length) {
    var folderId = queue.shift();
    if (!folderId || visitedFolder[folderId]) continue;
    visitedFolder[folderId] = true;

    var pageToken = "";
    do {
      var q = "'" + folderId + "' in parents and trashed=false";
      var fields = "nextPageToken,files(id,name,mimeType,parents,webViewLink,size,md5Checksum,sha1Checksum,sha256Checksum)";
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
        headers: { Authorization: "Bearer " + token }
      });

      var status = resp.getResponseCode();
      var text = HB_s_(resp.getContentText());
      if (status < 200 || status >= 300) {
        throw new Error("Drive API HTTP " + status + ": " + text.slice(0, 200));
      }

      var json = {};
      try { json = JSON.parse(text); } catch (e) {}
      var files = (json && json.files) || [];

      for (var i = 0; i < files.length; i++) {
        var f = files[i] || {};
        var mime = HB_s_(f.mimeType);
        var id = HB_s_(f.id);
        if (!id) continue;

        if (mime === "application/vnd.google-apps.folder") {
          if (!visitedFolder[id]) queue.push(id);
          continue;
        }

        var hash = HB_s_(f.sha256Checksum || f.sha1Checksum || f.md5Checksum).toLowerCase();
        if (!hash) continue;

        out.push({
          id: id,
          name: HB_s_(f.name),
          folderId: folderId,
          path: "",
          hash: hash,
          algo: f.sha256Checksum ? "sha256" : (f.sha1Checksum ? "sha1" : "md5"),
          size: Number(f.size || 0) || 0,
          mimeType: mime,
          url: HB_s_(f.webViewLink)
        });
      }

      pageToken = HB_s_(json && json.nextPageToken);
    } while (pageToken);
  }

  return out;
}
