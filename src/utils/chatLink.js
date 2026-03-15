import { DATA } from "../data.js";
import { getConfig } from "./config.js";

const FALLBACK_ZALO = String(DATA?.footer?.socials?.zalo || "").trim();
const FALLBACK_FACEBOOK = String(DATA?.footer?.socials?.facebook || "").trim();
const ENV_PUBLIC_SITE_URL = String(import.meta.env.VITE_PUBLIC_SITE_URL || "").trim();

const toHttpUrl = (input = "") => {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : "";
};

const cleanToken = (v = "") =>
  String(v || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[|;]+/g, "-");

const normalizeSizeLabel = (label = "") => {
  const raw = String(label || "").trim();
  if (!raw) return "";
  return raw.replace(/^size\s*/i, "").trim() || raw;
};

const firstImageOf = (product = {}) => {
  if (Array.isArray(product?.images)) {
    const found = product.images.find(Boolean);
    if (found) return String(found).trim();
  }
  const raw = String(product?.images || product?.image || "").trim();
  if (!raw) return "";
  return raw.split(/[\n,|]\s*/).map((s) => s.trim()).find(Boolean) || "";
};

const extractImageId = (rawUrl = "") => {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  const m = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/) || raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return String(m?.[1] || "").trim();
};

const productPidForLink = (product = {}) =>
  String(product.uid || product.code || product.slug || product.id || "").trim();

const resolvePublicOrigin = () => {
  const envUrl = toHttpUrl(ENV_PUBLIC_SITE_URL);
  if (envUrl) return envUrl.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = String(window.location.origin || "");
    if (!/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(origin)) return origin.replace(/\/+$/, "");
  }

  return "https://halleybakery.io.vn";
};

const buildProductLink = (product = {}) => {
  const pid = productPidForLink(product);
  if (!pid) return "";
  const origin = resolvePublicOrigin();
  return `${origin}/?pid=${encodeURIComponent(pid)}`;
};

const withParams = (baseUrl, params = {}) => {
  try {
    const u = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === "") return;
      u.searchParams.set(key, String(value));
    });
    return u.toString();
  } catch {
    return "";
  }
};

const extractZaloId = (zaloUrl = "") => {
  try {
    const u = new URL(zaloUrl);
    const fromQuery =
      u.searchParams.get("phone") ||
      u.searchParams.get("id") ||
      u.searchParams.get("uid") ||
      "";
    if (fromQuery) return fromQuery.trim();
    const segs = u.pathname.split("/").filter(Boolean);
    return String(segs[segs.length - 1] || "").trim().replace(/^@+/, "");
  } catch {
    return String(zaloUrl || "").trim().replace(/^@+/, "");
  }
};

const profileZaloUrl = (id = "", fallback = "") => {
  const raw = String(id || "").trim();
  if (raw) return `https://zalo.me/${encodeURIComponent(raw)}`;
  return toHttpUrl(fallback) || "";
};

const normalizeMessengerLink = (raw = "") => {
  const input = String(raw || "").trim();
  if (!input) return "";
  try {
    const u = new URL(input);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("m.me")) {
      const seg = u.pathname.split("/").filter(Boolean)[0] || "";
      return seg ? `https://m.me/${seg}` : "";
    }
    if (host.includes("facebook.com")) {
      const segs = u.pathname.split("/").filter(Boolean);
      if (!segs.length) return "";
      if (segs[0] === "messages" && segs[1] === "t" && segs[2]) return `https://m.me/${segs[2]}`;
      if (segs[0] === "profile.php") {
        const id = u.searchParams.get("id");
        return id ? `https://m.me/${id}` : "";
      }
      if (segs[0] === "pg" && segs[1]) return `https://m.me/${segs[1]}`;
      return `https://m.me/${segs[0]}`;
    }
    return toHttpUrl(input);
  } catch {
    return "";
  }
};

export function productCodeOf(product = {}) {
  const raw = String(product.code || product.uid || product.sku || product.id || "").trim();
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) return "HBUNKNOWN";
  if (/^hb/i.test(safe)) return safe.toUpperCase();
  return `HB${safe}`;
}

export function resolveChatTargets() {
  const messenger =
    normalizeMessengerLink(getConfig("messenger_link", "")) ||
    normalizeMessengerLink(FALLBACK_FACEBOOK);
  const zalo = toHttpUrl(getConfig("zalo_link", "")) || toHttpUrl(FALLBACK_ZALO);
  return { messenger, zalo };
}

function buildMetaPayload({ code, sizeLabel, intent, imageId }) {
  const sizeToken = cleanToken(sizeLabel || "tu_van");
  const imgToken = cleanToken(imageId || "");
  return `HB_ORDER|code=${cleanToken(code)}|size=${sizeToken}|intent=${cleanToken(intent)}|img=${imgToken}|source=web`;
}

function buildHumanMessage({ productName, intent, productLink }) {
  const intro =
    intent === "order_same"
      ? "Xin ch\u00E0o, m\u00ECnh mu\u1ED1n \u0111\u1EB7t l\u00E0m y h\u00ECnh m\u1EABu n\u00E0y."
      : "Xin ch\u00E0o, m\u00ECnh mu\u1ED1n h\u1ECFi th\u00F4ng tin gi\u00E1 m\u1EABu n\u00E0y.";

  const lines = [
    intro,
    `T\u00EAn m\u1EABu: ${String(productName || "").trim() || "Ch\u01B0a r\u00F5"}`,
    productLink ? `\u1EA2nh m\u1EABu: ${productLink}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildMessengerLink(baseUrl, message, payload) {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("m.me")) return withParams(baseUrl, { ref: payload, text: message });
    if (host.includes("facebook.com")) return withParams(baseUrl, { text: message, ref: payload });
    return withParams(baseUrl, { text: message, ref: payload });
  } catch {
    return "";
  }
}

function buildZaloLink(baseUrl, message, payload) {
  const zaloId = extractZaloId(baseUrl);
  const configuredHref = toHttpUrl(baseUrl);
  const profileHref = profileZaloUrl(zaloId, baseUrl);

  // Use exact configured URL first, fallback to normalized profile URL.
  const href = configuredHref || profileHref;

  // Disable app deep-link: it may trigger "invalid phone number" on many Zalo accounts.
  return { href, appHref: "" };
}

export function openChatTarget(target, event) {
  if (!target?.href) return;
  if (event?.preventDefault) event.preventDefault();
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  if (target.channel === "zalo" && isMobile && target.appHref) {
    window.location.assign(target.appHref);
    setTimeout(() => {
      window.location.assign(target.href);
    }, 700);
    return;
  }

  window.open(target.href, "_blank", "noopener");
}

export function buildProductChatLink({
  product,
  sizeLabel,
  intent = "ask_price",
  preferred = "messenger",
}) {
  const { messenger, zalo } = resolveChatTargets();
  const channel =
    preferred === "messenger"
      ? (messenger ? "messenger" : zalo ? "zalo" : "")
      : preferred === "zalo"
        ? (zalo ? "zalo" : messenger ? "messenger" : "")
        : (messenger ? "messenger" : zalo ? "zalo" : "");

  if (!channel) {
    return {
      href: "",
      appHref: "",
      channel: "",
      code: "",
      message: "",
      payload: "",
      sizeLabel: "",
      imageUrl: "",
      productLink: "",
    };
  }

  const code = productCodeOf(product);
  const normalizedSize = normalizeSizeLabel(sizeLabel);
  const imageUrl = firstImageOf(product);
  const imageId = extractImageId(imageUrl);
  const productLink = buildProductLink(product);
  const payload = buildMetaPayload({ code, sizeLabel: normalizedSize, intent, imageId });
  const message = buildHumanMessage({
    productName: product?.name,
    code,
    sizeLabel: normalizedSize,
    intent,
    productLink,
  });

  if (channel === "zalo") {
    const links = buildZaloLink(zalo, message, payload);
    return {
      href: links.href,
      appHref: links.appHref,
      channel,
      code,
      message,
      payload,
      sizeLabel: normalizedSize,
      imageUrl,
      productLink,
    };
  }

  return {
    href: buildMessengerLink(messenger, message, payload),
    appHref: "",
    channel,
    code,
    message,
    payload,
    sizeLabel: normalizedSize,
    imageUrl,
    productLink,
  };
}


