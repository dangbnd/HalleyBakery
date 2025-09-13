export default function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-white overflow-hidden animate-pulse">
          <div className="aspect-[1/1] bg-gray-200" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-gray-200 rounded" />
            <div className="grid grid-cols-3 gap-1">
              <div className="h-6 bg-gray-200 rounded-full" />
              <div className="h-6 bg-gray-200 rounded-full" />
              <div className="h-6 bg-gray-200 rounded-full" />
            </div>
            <div className="h-4 w-1/3 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
