import { readAdminSession } from "./_admin-auth.js";
import { enforceRateLimit, json, readJsonBody, text } from "./_http.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function configuredKeys() {
  const raw = text(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "");
  return [...new Set(raw.split(/[\r\n,;|]+/).map(text).filter(Boolean))];
}

function allowedModel(model = "") {
  const value = text(model);
  if (!/^gemini-[a-z0-9][a-z0-9._-]{2,80}$/i.test(value)) return false;
  const configured = text(process.env.GEMINI_ALLOWED_MODELS);
  if (!configured) return true;
  return configured.split(/[\r\n,;|]+/).map(text).includes(value);
}

function isPrivateHostname(hostname = "") {
  const host = text(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return /^169\.254\./.test(host);
}

function validatedImageUrl(raw = "") {
  const parsed = new URL(text(raw));
  if (parsed.protocol !== "https:" || isPrivateHostname(parsed.hostname)) {
    throw Object.assign(new Error("Image URL is not allowed"), { statusCode: 400 });
  }
  return parsed;
}

async function fetchImage(rawUrl = "") {
  let url = validatedImageUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "image/*" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new Error("Image redirect failed");
        url = validatedImageUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_IMAGE_BYTES) throw Object.assign(new Error("Image is too large"), { statusCode: 413 });
      const mimeType = text(response.headers.get("content-type")).split(";")[0];
      if (!mimeType.startsWith("image/")) throw Object.assign(new Error("URL is not an image"), { statusCode: 400 });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error("Image is too large"), { statusCode: 413 });
      return { mimeType, data: buffer.toString("base64") };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Image fetch failed");
}

function normalizeTags(value = "") {
  return text(value)
    .replace(/[\n\r]+/g, ", ")
    .replace(/^[-*\d.)\s]+/gm, "")
    .replace(/["']/g, "")
    .split(",")
    .map((tag) => text(tag).toLowerCase())
    .filter((tag) => tag && tag.length < 30)
    .join(", ");
}

async function callGemini(key, model, prompt, image, { raw = false, maxOutputTokens = 200 } = {}) {
  const endpoint = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  );
  endpoint.searchParams.set("key", key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        }],
        generationConfig: {
          temperature: raw ? 0.2 : 0.3,
          maxOutputTokens: Math.min(1000, Math.max(100, Number(maxOutputTokens) || 200)),
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(text(data?.error?.message) || `Gemini HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    const output = text(data?.candidates?.[0]?.content?.parts?.[0]?.text || "");
    return raw ? output : normalizeTags(output);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  if (!readAdminSession(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
  if (!enforceRateLimit(req, res, { scope: "gemini", limit: 30, windowMs: 60_000 })) return;

  try {
    const body = await readJsonBody(req, { maxBytes: 12 * 1024 * 1024 });
    const model = text(body.model);
    const prompt = text(body.prompt).slice(0, 6000);
    const imageUrl = text(body.imageUrl);
    const imageData = text(body.imageData);
    const mimeType = text(body.mimeType || "image/jpeg").toLowerCase();
    if (!allowedModel(model) || !prompt || (!imageUrl && !imageData)) {
      return json(res, 400, { ok: false, error: "Invalid model, prompt or image URL" });
    }
    const keys = configuredKeys();
    if (!keys.length) return json(res, 503, { ok: false, error: "Gemini server key is not configured" });
    let image;
    if (imageData) {
      if (!/^image\/(avif|gif|jpe?g|png|webp)$/i.test(mimeType)) {
        return json(res, 400, { ok: false, error: "Invalid image MIME type" });
      }
      const buffer = Buffer.from(imageData, "base64");
      if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
        return json(res, 413, { ok: false, error: "Image is too large" });
      }
      image = { mimeType, data: buffer.toString("base64") };
    } else {
      image = await fetchImage(imageUrl);
    }
    const raw = body.responseMode === "raw";
    let lastError = null;
    for (const key of keys) {
      try {
        const output = await callGemini(key, model, prompt, image, {
          raw,
          maxOutputTokens: body.maxOutputTokens,
        });
        return json(res, 200, raw ? { ok: true, text: output } : { ok: true, tags: output });
      } catch (error) {
        lastError = error;
        if (![400, 403, 429].includes(Number(error?.statusCode))) break;
      }
    }
    return json(res, Number(lastError?.statusCode) === 429 ? 429 : 502, {
      ok: false,
      error: lastError?.message || "Gemini request failed",
    });
  } catch (error) {
    return json(res, error?.statusCode || 502, { ok: false, error: error?.message || "Gemini request failed" });
  }
}
