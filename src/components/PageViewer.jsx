// src/components/PageViewer.jsx
import React, { useMemo } from "react";
import DOMPurify from "dompurify";

/* ===== helpers ===== */
const S = (v) => (v == null ? "" : String(v).trim());

/** Nhận link Drive bất kỳ -> tạo danh sách URL ảnh trực tiếp để thử dần */
const driveSrcs = (u = "") => {
  const s = S(u);
  if (!s) return [];
  const m = s.match(/(?:file\/d\/|open\?id=|id=)([a-zA-Z0-9_-]{10,})/);
  if (!m) return [s]; // không phải Drive, trả thẳng
  const id = m[1];
  return [
    // trực tiếp
    `https://drive.usercontent.google.com/uc?id=${id}`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    // thumbnail (ít bị chặn hơn)
    `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
  ];
};

export default function PageViewer({ page = {} }) {
  const title = S(page.title || page.name || page.label || "Giới thiệu");
  const desc =
    S(page.desc) ||
    S(page.description) ||
    S(page.summary) ||
    "";

  const rawCover = page.cover || page.banner || page.image || "";
  const coverList = driveSrcs(rawCover);

  const mapHref = S(page.mapHref || page.map || page.gmap);
  const phone = S(page.phone || page.hotline).replace(/\s+/g, "");
  const html = S(page.html || page.content || page.body);

  return (
    <div className="pb-10">
      {/* HERO */}
      <section className="relative">
        {/* nền mềm */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-sky-500/10 via-fuchsia-500/10 to-amber-500/10" />
        <div className="absolute -top-28 -left-16 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl -z-10" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-rose-400/20 blur-3xl -z-10" />

        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="grid md:grid-cols-5 gap-6 items-center">
            {/* text */}
            <div className="md:col-span-3">
              <div className="rounded-2xl border bg-white/70 supports-[backdrop-filter]:bg-white/50 backdrop-blur p-6 shadow-lg ring-1 ring-black/5">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-sky-600 via-fuchsia-600 to-rose-600 bg-clip-text text-transparent">
                    {title}
                  </span>
                </h1>
                {desc && (
                  <p className="mt-2 text-sm md:text-base text-gray-700">
                    {desc}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {mapHref && (
                    <a
                      href={mapHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 border hover:bg-gray-50 shadow-sm"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 21s-6-4.3-6-10a6 6 0 1 1 12 0c0 5.7-6 10-6 10z" />
                        <circle cx="12" cy="11" r="2" />
                      </svg>
                      Chỉ đường
                    </a>
                  )}
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 shadow"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.9v2a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3.1 19 19 0 0 1-6-6A19 19 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h2a2 2 0 0 1 2 1.7c.1.8.3 1.6.6 2.3a2 2 0 0 1-.5 2l-1 1a16 16 0 0 0 6 6l1-1a2 2 0 0 1 2-.5c.7.3 1.5.5 2.3.6A2 2 0 0 1 22 16.9z" />
                      </svg>
                      Gọi ngay
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ảnh */}
            <div className="md:col-span-2">
              <div className="rounded-2xl overflow-hidden border bg-white/70 supports-[backdrop-filter]:bg-white/50 backdrop-blur shadow-lg ring-1 ring-black/5">
                {coverList.length ? (
                  <img
                    src={coverList[0]}
                    alt=""
                    className="w-full h-48 md:h-64 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    data-idx="0"
                    onError={(e) => {
                      const idx = Number(e.currentTarget.dataset.idx || 0);
                      const next = coverList[idx + 1];
                      if (next) {
                        e.currentTarget.dataset.idx = String(idx + 1);
                        e.currentTarget.src = next;
                      } else {
                        e.currentTarget.style.display = "none";
                      }
                    }}
                  />
                ) : (
                  <div className="h-48 md:h-64 grid place-items-center text-gray-400 text-sm">
                    Thêm ảnh vào cột <code>cover</code>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* nội dung chi tiết từ sheet */}
      {html && (
        <section className="max-w-6xl mx-auto px-4 mt-8">
          <article
            className="prose prose-sm md:prose max-w-none prose-rose"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
          />
        </section>
      )}
    </div>
  );
}
