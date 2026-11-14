import test from "node:test";
import assert from "node:assert/strict";
import { candidatesFor, mkSrcSet, driveIdOf } from "../src/utils/img.js";

test("driveIdOf extracts Google Drive file IDs from supported URL formats", () => {
  assert.equal(driveIdOf("https://drive.google.com/thumbnail?id=1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2&sz=w700"), "1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2");
  assert.equal(driveIdOf("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view"), "1AbCdEfGhIjKlMnOpQrStUvWxYz");
  assert.equal(driveIdOf("https://example.com/cake.jpg"), "");
});

test("candidatesFor prefers Ubuntu media cache then direct Google Drive fallback before weserv.nl", () => {
  const cands = candidatesFor("https://drive.google.com/thumbnail?id=1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2&sz=w700", 600, 0, 70);
  assert.equal(cands[0], "https://img.halley.io.vn/img/1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2?w=600");
  assert.equal(cands[1], "https://drive.google.com/thumbnail?id=1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2&sz=w600");
  assert.equal(cands[2], "https://lh3.googleusercontent.com/d/1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2=w600");
});

test("mkSrcSet routes Google Drive images via Ubuntu media cache", () => {
  const srcset = mkSrcSet("https://drive.google.com/thumbnail?id=1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2&sz=w700", 600, 0, 70);
  assert.ok(srcset.includes("https://img.halley.io.vn/img/1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2?w=320 320w"));
  assert.ok(srcset.includes("https://img.halley.io.vn/img/1XnU4nfZgH3G0ytJd-_iLNpFqVUWGRJp2?w=600 600w"));
});
