// src/components/MessageButton.jsx
import { useMemo } from "react";

export default function MessageButton({
  href,
  bottomClass = "bottom-16 md:bottom-20", // nằm trên BackToTop
}) {
  const link = useMemo(() => {
    const envLink = import.meta.env.VITE_MESSENGER_LINK;
    const envPage = import.meta.env.VITE_MESSENGER_PAGE;
    const base = href || envLink || (envPage ? `https://m.me/${envPage}` : "");
    return base?.startsWith("http") ? base : "";
  }, [href]);

  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener"
      aria-label="Nhắn qua Messenger"
      title="Nhắn qua Messenger"
      className={
        `fixed right-4 md:right-6 ${bottomClass} z-50 grid place-items-center ` +
        `h-10 w-10 md:h-12 md:w-12 rounded-full bg-[#006AFF] text-white ` +
        `shadow-lg ring-1 ring-[#cfe0ff] hover:opacity-90 active:scale-95 transition`
      }
    >
      {/* Biểu tượng Messenger */}
      <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.05 2 11.05c0 2.61 1.12 4.97 3.01 6.63v3.27l2.76-1.52c1.25.35 2.33.5 3.23.5 5.52 0 10-4.05 10-9.05S17.52 2 12 2zm.1 10.87-2.7-2.9-5.15 2.9 5.79-5.52 2.64 2.86 5.16-2.86-5.74 5.52z"/>
      </svg>
    </a>
  );
}
