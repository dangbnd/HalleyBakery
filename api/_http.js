const RATE_BUCKETS = new Map();
const RATE_BUCKET_LIMIT = 5000;
let nextRateCleanupAt = 0;

export function text(value = "") {
  return value == null ? "" : String(value).trim();
}

export function clientIp(req = {}) {
  const headers = req.headers || {};
  const forwarded =
    headers["cf-connecting-ip"] ||
    headers["true-client-ip"] ||
    headers["x-vercel-forwarded-for"] ||
    headers["x-real-ip"] ||
    headers["x-forwarded-for"] ||
    "";
  return text(Array.isArray(forwarded) ? forwarded[0] : String(forwarded).split(",")[0]) ||
    text(req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown");
}

export function applyApiSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
}

export function json(res, status, body) {
  applyApiSecurityHeaders(res);
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  if (typeof res.json === "function") return res.json(body);
  return res.send(JSON.stringify(body));
}

export async function readJsonBody(req, { maxBytes = 64 * 1024 } = {}) {
  const contentLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const error = new Error("Request body too large");
    error.statusCode = 413;
    throw error;
  }

  const raw = req.body;
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) {
    const measured = Buffer.byteLength(JSON.stringify(raw));
    if (measured > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    return raw;
  }
  if (typeof raw === "string" || Buffer.isBuffer(raw)) {
    const source = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (source.length > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    if (!source.length) return {};
    try {
      return JSON.parse(source.toString("utf8"));
    } catch {
      const error = new Error("Invalid JSON body");
      error.statusCode = 400;
      throw error;
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

export function enforceRateLimit(
  req,
  res,
  { scope = "api", limit = 60, windowMs = 60_000 } = {}
) {
  const now = Date.now();
  if (now >= nextRateCleanupAt || RATE_BUCKETS.size > RATE_BUCKET_LIMIT) {
    cleanRateBuckets(now);
    nextRateCleanupAt = now + Math.min(windowMs, 60_000);
  }
  const key = `${scope}:${clientIp(req)}`;
  const current = RATE_BUCKETS.get(key);
  const bucket = !current || now >= current.resetAt
    ? { count: 0, resetAt: now + windowMs }
    : current;
  bucket.count += 1;
  RATE_BUCKETS.set(key, bucket);

  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count <= limit) return true;
  json(res, 429, { ok: false, error: "Too many requests" });
  return false;
}

export function cleanRateBuckets(now = Date.now()) {
  for (const [key, bucket] of RATE_BUCKETS.entries()) {
    if (now >= bucket.resetAt) RATE_BUCKETS.delete(key);
  }
  while (RATE_BUCKETS.size > RATE_BUCKET_LIMIT) {
    const oldest = RATE_BUCKETS.keys().next().value;
    if (!oldest) break;
    RATE_BUCKETS.delete(oldest);
  }
}
