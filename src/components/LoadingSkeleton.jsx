// src/components/LoadingSkeleton.jsx

export default function LoadingSkeleton({ count = 8, message = "Đang tải sản phẩm..." }) {
  return (
    <section className="relative max-w-6xl mx-auto px-4 py-8 min-h-[60vh]">

      {/* Centered Logo Overlay - positioned in top third */}
      <div className="absolute inset-0 z-10 flex flex-col items-center pointer-events-none" style={{ paddingTop: '28%' }}>
        <div className="bg-white/80 backdrop-blur-sm px-8 py-6 rounded-3xl shadow-sm border border-white/50 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-rose-100 rounded-full blur-xl opacity-40 animate-pulse-slow"></div>
            <img
              src="/brand/logo-mobile.png"
              alt="Halley Bakery"
              className="relative w-14 h-14 object-contain animate-float"
            />
          </div>
          <div className="h-0.5 w-16 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-400 w-full animate-progress-indeterminate origin-left"></div>
          </div>
          <p className="text-xs text-gray-400 animate-pulse">Bạn chờ chút chút nhé...</p>
        </div>
      </div>

      {/* Classic Grid Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 opacity-75">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm"
          >
            {/* Aspect Square Image */}
            <div className="aspect-square bg-gray-100 relative overflow-hidden">
              <div className="absolute inset-0 skeleton-shimmer"></div>
            </div>

            <div className="p-3 space-y-3">
              {/* Title Line */}
              <div className="h-4 bg-gray-100 rounded w-4/5 relative overflow-hidden">
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>

              {/* Price | Button */}
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
        @keyframes pulse-slow {
          0%, 100% { transform: scale(0.9); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.6; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }

        @keyframes shimmer-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg, 
            transparent 0%, 
            rgba(255,255,255,0.6) 50%, 
            transparent 100%
          );
          height: 100%;
          width: 100%;
          animation: shimmer-slide 1.5s infinite cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%) scaleX(0.2); }
          50% { transform: translateX(0%) scaleX(0.5); }
          100% { transform: translateX(100%) scaleX(0.2); }
        }
        .animate-progress-indeterminate {
          animation: progress-indeterminate 1.5s infinite linear;
        }
      `}</style>
    </section>
  );
}
