// src/components/Footer.jsx
import React from "react";

export function Footer({ data = {}, pages = [] }) {
  const brandName = data?.brand?.name || "Halley Bakery";

  const phone = data?.phone || data?.hotline || "0123 456 789";
  const email = data?.email || "halleybakery@gmail.com";
  const address = data?.address || "24 ngõ 26 Kim Hoa, Đống Đa, Hà Nội";

  const hours =
    Array.isArray(data?.hours) && data.hours.length
      ? data.hours
      : [
        { d: "Thứ 2 — Thứ 6", t: "08:00 — 20:00" },
        { d: "Thứ 7 — CN", t: "08:00 — 19:00" },
      ];

  const socials = {
    facebook: data?.socials?.facebook || data?.facebook,
    instagram: data?.socials?.instagram || data?.instagram,
    tiktok: data?.socials?.tiktok || data?.tiktok,
    zalo: data?.socials?.zalo || data?.zalo,
    labels: data?.socials?.labels || {}, // { facebook, instagram, tiktok, zalo }
  };

  const mapHref =
    data?.mapHref ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const mapSrc =
    data?.mapSrc ||
    `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;

  return (
    <footer className="mt-12 border-t bg-white">
      {/* Cards */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Liên hệ */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900">Liên hệ</h4>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="flex items-start gap-2 hover:underline">
                <PhoneIcon className="mt-0.5" /> {phone}
              </a>
              <a href={`mailto:${email}`} className="flex items-start gap-2 hover:underline">
                <MailIcon className="mt-0.5" /> {email}
              </a>
              <div className="flex items-start gap-2">
                <PinIcon className="mt-0.5" /> <span>{address}</span>
              </div>
              <div className="flex text-justify text-rose-600/90 font-bold">
                Khách hàng đi từ ngõ 2 Xã Đàn vào đường Kim Hoa,
                Không đi vào ngõ 422 Lê Duẩn, đường đi rất nhỏ, rất khó đi.
              </div>
              <div className="flex gap-2 pt-1">
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <DirectionsIcon />
                  Chỉ đường
                </a>
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-sm hover:opacity-90"
                >
                  <PhoneIcon className="text-white" /> Gọi ngay
                </a>
              </div>
            </div>
          </section>

          {/* Giờ mở cửa */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900">Giờ mở cửa</h4>
            <ul className="mt-4 space-y-3 text-sm text-gray-700">
              {hours.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span>{h.d}</span>
                  <span className="tabular-nums text-gray-600">{h.t}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Kết nối MXH: mobile chỉ icon, desktop icon + tên */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900">Kết nối</h4>

            {/* Mobile: icon grid */}
            <div className="mt-3 grid grid-cols-4 gap-3 sm:hidden">
              {renderSocialIcon("facebook", socials.facebook)}
              {renderSocialIcon("instagram", socials.instagram)}
              {renderSocialIcon("tiktok", socials.tiktok)}
              {renderSocialIcon("zalo", socials.zalo)}
            </div>

            {/* Desktop: từng hàng icon + tên */}
            <div className="mt-3 space-y-3 hidden sm:block">
              {renderSocialRow("facebook", "Facebook", socials.facebook, socials.labels.facebook)}
              {renderSocialRow("instagram", "Instagram", socials.instagram, socials.labels.instagram)}
              {renderSocialRow("tiktok", "TikTok", socials.tiktok, socials.labels.tiktok)}
              {renderSocialRow("zalo", "Zalo", socials.zalo, socials.labels.zalo)}
            </div>
          </section>
        </div>
      </div>

      {/* Map */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="rounded-2xl overflow-hidden border bg-white shadow-sm">
          <div className="p-4 border-b">
            <div className="text-sm font-semibold">Bản đồ</div>
            <div className="text-xs text-gray-600">Tìm đường đến {brandName}</div>
          </div>
          <div className="aspect-[21/9] w-full">
            <iframe
              title="Google Map"
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full"
            />
          </div>
        </div>
      </div>

      {/* Bottom line */}
      <div className="border-t">
        <div className="max-w-6xl mx-auto px-4 py-4 text-sm text-gray-600 flex flex-col sm:flex-row items-center gap-2">
          <div className="grow">© {new Date().getFullYear()} {brandName}. All rights reserved.</div>
          <div className="flex items-center gap-4">
            {pages.some(p => p.key === "policy") && <a href="?view=policy" className="hover:underline">Chính sách bảo mật</a>}
            {pages.some(p => p.key === "terms") && <a href="?view=terms" className="hover:underline">Điều khoản</a>}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ===== Social helpers ===== */
function renderSocialIcon(key, url) {
  if (!url) return null;
  const aClass =
    "h-12 w-12 grid place-items-center rounded-full border shadow-sm hover:bg-gray-50";
  const circleProps =
    key === "facebook"
      ? { color: "#1877F2", glyph: <FacebookGlyph /> }
      : key === "instagram"
        ? { gradient: "instagram", glyph: <InstagramGlyph /> }
        : key === "tiktok"
          ? { color: "#000000", glyph: <TiktokGlyph /> }
          : { color: "#0068FF", glyph: <ZaloGlyph /> };
  return (
    <a href={url} target="_blank" rel="noopener" className={aClass} aria-label={key} key={key}>
      <Circle color={circleProps.color} gradient={circleProps.gradient}>
        {circleProps.glyph}
      </Circle>
    </a>
  );
}

function renderSocialRow(key, platform, url, customLabel) {
  if (!url) return null;
  const label = customLabel || handleFromUrl(url, platform);
  const common =
    "flex items-center gap-3 rounded-xl border px-3 py-2 hover:bg-gray-50 transition text-sm";
  const icon =
    key === "facebook" ? (
      <Circle color="#1877F2"><FacebookGlyph /></Circle>
    ) : key === "instagram" ? (
      <Circle gradient="instagram"><InstagramGlyph /></Circle>
    ) : key === "tiktok" ? (
      <Circle color="#000000"><TiktokGlyph /></Circle>
    ) : (
      <Circle color="#0068FF"><ZaloGlyph /></Circle>
    );

  return (
    <a key={key} href={url} target="_blank" rel="noopener" className={common} aria-label={platform}>
      {icon}
      <div className="min-w-0">
        <div className="font-medium text-gray-900">{platform}</div>
        <div className="text-gray-600 truncate">@{label}</div>
      </div>
    </a>
  );
}

function handleFromUrl(u, fallback) {
  try {
    const x = new URL(u);
    let seg = x.pathname.split("/").filter(Boolean).pop() || "";
    if (!seg && x.searchParams.has("id")) seg = x.searchParams.get("id");
    return seg.replace(/^@/, "") || x.hostname.replace(/^www\./, "") || fallback;
  } catch {
    return fallback;
  }
}

/* ===== Small UI primitives ===== */
function Circle({ color, gradient, children }) {
  const base = "h-9 w-9 grid place-items-center rounded-full shadow-sm";
  if (gradient === "instagram") {
    return (
      <div
        className={base}
        style={{
          background:
            "linear-gradient(45deg,#F58529,#FEDA77,#DD2A7B,#8134AF,#515BD4)",
        }}
      >
        <div className="h-6 w-6 text-white">{children}</div>
      </div>
    );
  }
  return (
    <div className={base} style={{ backgroundColor: color }}>
      <div className="h-6 w-6 text-white">{children}</div>
    </div>
  );
}

/* ===== Icons ===== */
function PhoneIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={"h-5 w-5 text-gray-500 " + (className || "")} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.34 1.77.66 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.18a2 2 0 0 1 2.11-.45c.83.32 1.7.54 2.6.66A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function MailIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={"h-5 w-5 text-gray-500 " + (className || "")} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}
function PinIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={"h-5 w-5 text-gray-500 " + (className || "")} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function DirectionsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 2 10 10-10 10L2 12 12 2z" />
      <path d="M12 12h7" />
      <path d="M12 12v7" />
    </svg>
  );
}

/* brand glyphs (white) */
function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15 3h-3.2A3.8 3.8 0 0 0 8 6.8V9H6v3h2v9h4v-9h3l1-3h-4V7a1 1 0 0 1 1-1h3V3z" />
    </svg>
  );
}
function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6-1.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z" />
    </svg>
  );
}
function TiktokGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 8.5a7.5 7.5 0 0 1-5.5-2.4V16a6 6 0 1 1-6-6c.35 0 .69.03 1.02.1V13a3 3 0 1 0 3 3V2h3.02A7.5 7.5 0 0 0 21 5.5z" />
    </svg>
  );
}
function ZaloGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 3h16a1 1 0 0 1 1 1v16.5a.5.5 0 0 1-.8.4L17 19H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4 5h3l-3 5h3v2H6l3-5H6V8zm7 0h2v7h-2V8zm-3 0h2v7h-2V8z" />
    </svg>
  );
}
