// src/components/LoadingSkeleton.jsx

export default function LoadingSkeleton({ count = 8, message = "Bạn chờ chút chút nhé..." }) {
  return (
    <section className="relative max-w-6xl mx-auto px-4 py-6" aria-busy="true">
      <div className="mb-3 flex items-center gap-2 text-xs text-gray-400">
        <div className="h-3 w-3 rounded-full border-2 border-rose-300 border-t-transparent animate-spin" />
        <span>{message}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 opacity-75">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm">
            <div className="aspect-square bg-gray-100 relative overflow-hidden">
              <div className="absolute inset-0 skeleton-shimmer"></div>
            </div>

            <div className="p-3 space-y-3">
              <div className="h-4 bg-gray-100 rounded w-4/5 relative overflow-hidden">
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="h-4 bg-gray-100 rounded w-1/3 relative overflow-hidden">
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
                <div className="h-7 w-20 bg-gray-100 rounded-full relative overflow-hidden">
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes shimmer-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .skeleton-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%);
          height: 100%;
          width: 100%;
          animation: shimmer-slide 1.5s infinite cubic-bezier(0.4, 0, 0.2, 1);
        }

      `}</style>
    </section>
  );
}
